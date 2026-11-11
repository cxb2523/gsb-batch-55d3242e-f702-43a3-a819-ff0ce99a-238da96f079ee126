#!/bin/zsh
# Which conditions have a test that would notice them breaking.
#
# Inverts one `if` at a time and counts failing tests. A condition whose inversion changes nothing
# has no test constraining it — which is how `compiler.test.ts` was found to be testing a
# re-implementation, and how nine live guards (`$dsh/fs` with no host, the traversal fence, the
# panel collapse) were found to be unconstrained.
#
# Three earlier versions of this script under-reported, each silently:
#
# - Mutating a whole file at once. A module that then THROWS on import collapses its tests into
#   one error, so `segments.ts` scored 1 out of 17 while every one of its six conditions was in
#   fact covered. Per-condition is the only reading that means anything.
# - `perl -e 's/if \(([^)]*)\)/'`. A regex stops at the first `)`, so any condition containing a
#   call became a syntax error rather than a mutant — 27 of them here. `invert-ifs.mjs` matches
#   parens instead.
# - `echo "$out"`. zsh's echo expands the `\u` and `\t` in test names, corrupting the lines grep
#   was matching. `printf %s\\n` does not.
#
# Not part of `bun run check`: it rewrites source files and takes about an hour. Run it deliberately.
set -e
cd "$(dirname "$0")/.."

# `set -e` plus a rewritten source file is a bad combination: a failure between the mutation and
# the restore leaves the tree broken, which is exactly what happened once.
current=""
restore() {
  if [[ -n "$current" ]]; then
    cp "/tmp/ma-$(basename "$current")" "$current"
    current=""
  fi
  return 0
}
trap restore EXIT INT TERM
[[ -z "$(git status --porcelain)" ]] || { echo "working tree must be clean: this script rewrites source files"; exit 2 }

# Name the lines the mutator refused to touch. "4 in prose, declined" is indistinguishable from
# "the fence tracker desynced and skipped 4 real branches", and only the line tells you which.
name_declined() {
  for n in $lines; do
    cp "$src" "/tmp/ma-decl-${src:t}"
    bun scripts/invert-ifs.mjs "$src" "$n" 2> /dev/null
    cmp -s "$src" "/tmp/ma-decl-${src:t}" &&
      printf '    declined %s:%s  %s\n' "${src:t}" "$n" "$(sed -n "${n}p" "$src" | sed 's/^ *//' | cut -c1-64)"
    cp "/tmp/ma-decl-${src:t}" "$src"
    rm -f "/tmp/ma-decl-${src:t}"
  done
}

uncovered=0
# Every source under src/, at any depth, .ts and .tsx alike. The old form listed two directories
# at one depth each and silently skipped five files — GenUISurface.tsx among them, which holds
# the two error decisions this suite exists to constrain.
for src in ${(f)"$(fd -e ts -e tsx . src)"}; do
  [[ "$src" == *panel-css* ]] && continue
  lines=($(grep -n 'if (' "$src" | cut -d: -f1))
  (( ${#lines} == 0 )) && { echo "${src:t}: no conditions (operator does not apply)"; continue }
  cp "$src" "/tmp/ma-${src:t}"
  current="$src"
  covered=0
  uncovered_here=0
  for n in $lines; do
    bun scripts/invert-ifs.mjs "$src" "$n"
    # The mutator declines lines whose `if` is inside a string — `skill.ts` documents the
    # `AbortError` check inside its prompt. An unchanged file means "not a branch", which is a
    # different answer from "no test noticed", and reporting it as the latter is a standing
    # false positive that trains you to ignore the report.
    if cmp -s "$src" "/tmp/ma-${src:t}"; then continue; fi
    out=$(bun test 2>&1 || true)
    fails=$(printf %s\\n "$out" | grep -oE '^ *[0-9]+ fail' | head -1 | tr -dc 0-9 || true)
    errors=$(printf %s\\n "$out" | grep -cE '^ *[0-9]+ error' || true)
    cp "/tmp/ma-${src:t}" "$src"
    # An `if` inside a prompt string is prose, not a branch — `skill.ts` has one. Nothing
    # distinguishes it automatically; it is reported and read.
    if [[ "${fails:-0}" == "0" && "$errors" == "0" ]]; then
      printf '  %s:%s  UNCOVERED  %s\n' "${src:t}" "$n" "$(sed -n "${n}p" "$src" | sed 's/^ *//' | cut -c1-72)"
      uncovered=$((uncovered + 1))
      uncovered_here=$((uncovered_here + 1))
    else
      covered=$((covered + 1))
    fi
  done
  restore
  declined=$(( ${#lines} - covered - uncovered_here ))
  # "no branches" only when there genuinely were none. A file whose every condition came back
  # UNCOVERED used to print the same line, which reads as "nothing to check" — the opposite.
  if (( covered == 0 && uncovered_here > 0 )); then
    echo "${src:t}: ${uncovered_here} conditions, NONE constrained by a test"
  elif (( covered == 0 )); then
    echo "${src:t}: no branches (${declined} \`if (\` in prose, declined)"
    name_declined
  elif (( declined > 0 )); then
    # Name them. "4 in prose, declined" is indistinguishable from "the fence tracker desynced and
    # skipped 4 real branches", and only the line itself tells you which.
    echo "${src:t}: ${covered} conditions covered (${declined} in prose, declined)"
    name_declined
  else
    echo "${src:t}: ${covered} conditions covered"
  fi
done
echo
if [[ "$uncovered" == "0" ]]; then
  echo "every condition is constrained by a test"
else
  # Not part of `bun run check` — this takes an hour — but a report nothing can fail against is
  # a report that gets skimmed. Exit non-zero so a CI job or a `&&` chain can hold the line.
  # The number stops falling well before zero, and that is not a stall. Every remaining condition
  # is a null-guard or a one-line dispatch inside a React effect, reachable only with a DOM; the
  # decisions they used to hold have been extracted into pure functions (`errorAction`,
  # `dispatchError`, `probeOutcome`, `deliveryFor`, `needsResolve`) that ARE tested. Extracting
  # one does not lower this count — it trades an untestable condition for a tested function plus
  # a dispatch the audit still sees. Read it as "conditions a DOM-less suite cannot reach", and
  # judge progress by whether the LOGIC moved out, not by the number.
  echo "$uncovered unconstrained (all in React effect bodies — see the note in this script)"
  exit 1
fi
