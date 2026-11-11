#!/usr/bin/env bash
# Run one prompt in a throwaway workspace and report its shape.
# Reports `crash` rather than a zero when the run never reached a model — the two are
# indistinguishable by fence count alone, and a zero that was really a crash has been
# mistaken for a refuted prompt rule three times.
set -u
set -o pipefail
prompt=$1; seed=${2:-/dev/null}
d=$(mktemp -d)
# The profile loads whatever this symlink resolves to. When it is a different checkout, every
# prompt A/B measures an unchanged prompt and reports plausible numbers — a whole afternoon of
# conclusions was lost to it once. Exit 4 rather than measuring the wrong tree.
link=${DSH_HOME:-$HOME/.dsh}/profiles/headless/node_modules/dsh-generative-ui
linked=$(readlink "$link" 2>/dev/null || true)
# `readlink` returns the target VERBATIM, and pnpm writes a RELATIVE one — relative to the
# symlink's own directory, not to wherever this script runs. Resolving it from the cwd therefore
# fails silently: `cd` errors, `pwd -P` yields nothing, and the comparison below can never match,
# so a correctly-linked checkout reports `stale` and every eval exits 4. Resolve from the link.
case "$linked" in
  ""|/*) ;;
  *) linked=$(cd "$(dirname "$link")/$linked" 2>/dev/null && pwd -P || echo "$linked") ;;
esac
here=$(cd "$(dirname "$0")/.." && pwd -P)
# A wave FREEZES the plugin into its own directory and points the homes there, so that a `src/`
# edit in another window cannot move the prompt under jobs already running — five waves were lost
# before that existed. Such a link is this checkout, deliberately pinned, not a different one, and
# the two staleness checks below are about a tree that can still change. A frozen copy cannot.
case "$linked" in
  */waves/w[0-9][0-9][0-9]/plugin)
    exec_frozen=yes ;;
  *)
    exec_frozen=no
    if [ -n "$linked" ] && [ "$(cd "$linked" 2>/dev/null && pwd -P)" != "$here" ]; then
      echo "stale  the headless profile loads $linked, not $here" >&2; exit 4
    fi ;;
esac
# And it must be built from the current source: `lib/` older than `src/` means the last edit is
# not in what dsh will read. Same failure as the symlink, one step further along — every prompt
# A/B measures the previous prompt, and the numbers look exactly like a rule that did nothing.
#
# The two halves are checked against their OWN output, which is the same split `run-wave.py`
# fingerprints. Scanning all of `src/` against `lib/index.js` alone conflates them, and the two
# are not the same failure: `src/client/` compiles into `lib/client.js` and changes how a card
# RENDERS, while what an eval measures is the prompt and the skill in `lib/index.js`. Measured —
# a wave lost 67 of 72 runs to three edited files under `src/client/`, none of which the eval was
# reading. A render change means re-shoot the screenshots, not discard the verdicts.
stale_half() {
  [ -n "$(find "$1" \( -name '*.ts' -o -name '*.tsx' \) -newer "$2" 2>/dev/null | head -1)" ]
}
# `src/client/` is excluded from the node half by pruning it, so an edit there cannot fail this.
if [ "$exec_frozen" = no ] && [ -n "$(find "$here/src" -path "$here/src/client" -prune -o \( -name '*.ts' -o -name '*.tsx' \) -newer "$here/lib/index.js" -print 2>/dev/null | head -1)" ]; then
  echo "stale  src/ (node half) is newer than lib/index.js — run \`bun run build\`" >&2
  exit 4
fi
# The client half only decides how a card is rendered, so a stale one is a warning, not a verdict:
# the run's `skill=`/`fence=`/`canvas=` numbers stand and only the screenshots need retaking.
if [ "$exec_frozen" = no ] && stale_half "$here/src/client" "$here/lib/client.js"; then
  echo "note: src/client/ is newer than lib/client.js — verdicts stand, RE-SHOOT the screenshots" >&2
fi
# The gateway credential is the third way to measure nothing and not be told. The provider block
# in each eval home reads its key from `apiKeyEnv`, and with that variable unset dsh starts, opens
# a session, and sits there: the process is alive, the connection is open, nothing ever comes back
# and no error is printed. Measured — a whole wave of 72 runs spent its budget this way, five
# workers busy for minutes with zero session files written, which reads exactly like the upstream
# stalling. Same class as the two guards above, so the same treatment: refuse rather than measure.
keyenv=$(grep -oE 'apiKeyEnv: *[A-Z0-9_]+' "${DSH_HOME:-$HOME/.dsh}/settings.yaml" 2>/dev/null | head -1 | awk '{print $2}')
if [ -n "$keyenv" ] && [ -z "${!keyenv:-}" ]; then
  echo "nocreds  \$$keyenv is unset — dsh would open a session and hang with no error" >&2
  exit 4
fi
# `"$seed"/*` silently omits dotfiles, and a .env or .gitignore fixture is usually the point.
[ -d "$seed" ] && cp -R "$seed"/. "$d"/
# A seed may need more than files — `git 历史` wants commits, and a checked-in `.git` would
# nest inside this repo. `setup.sh` runs in the copy, never in the seed.
[ -x "$d/setup.sh" ] && ( cd "$d" && ./setup.sh >/dev/null 2>&1 && rm -f setup.sh )
# A seed ships its own `.tsx` (make-seed.sh's `src` kind writes App.tsx and Button.tsx), so the
# stray-card check below has to report what THIS RUN added, not what it found. Comparing against a
# baseline taken here is the difference between a signal and a constant: without it every run
# against that seed reports `stray=2` whatever the model did.
seeded=$(find "$d" -name '*.tsx' -not -path "$d/.dsh/*" 2>/dev/null | sort)
# DSH_HOME can point at an isolated home with a different default model — used to keep
# measuring when the primary account runs out of balance, and to compare models.
#
# WHICH MODEL TO MEASURE ON. The default eval home runs `macaron-v1-tall`, which is small enough
# that a rule can look like it works when all it did was patch around the model being dim. The
# models dsh actually runs are `macaron-v1-venti`, `macaron-v1-coding-venti` and `glm-5.2`; a rule
# is worth shipping when it holds on those. One home per model, each with its own settings.yaml —
# and settings.yaml must be a REAL FILE there, not the symlink back to the shared home that the
# bootstrap below creates, or editing one home's model silently edits every home's:
#
#   DSH_HOME=~/.dsh-eval-macaron-v1-venti ./scripts/eval.sh "…"
#
# Confirm the run used the model you asked for rather than a silent fallback:
#   zstd -dc "$sess/session.jsonl.zstd" | grep -o '"model":"[^"]*"' | sort -u
#
# It ALSO decides where the session transcript lands, and that is why it defaults to an eval home
# rather than to `~/.dsh`. dsh writes one session per working directory, this script makes a fresh
# `mktemp -d` per run, and the user's sidebar lists them all: a day of measuring left **2,143
# `tmp.XXXXXXXX` conversations** in it against 85 real ones. The eval home is a sibling of the real
# one — same profile, same credentials by symlink — so nothing about the run changes except which
# sidebar the debris lands in.
if [ -z "${DSH_HOME:-}" ]; then
  export DSH_HOME="$HOME/.dsh-eval"
  if [ ! -d "$DSH_HOME/profiles/headless" ]; then
    mkdir -p "$DSH_HOME/profiles"
    cp -R "$HOME/.dsh/profiles/headless" "$DSH_HOME/profiles/" 2>/dev/null || true
    # Symlinked, not copied: credentials rotate, and a stale copy fails as an auth error that
    # looks exactly like a refused rule.
    for f in settings.yaml .credentials.yaml .anonymous-user-id; do
      [ -e "$HOME/.dsh/$f" ] && ln -sf "$HOME/.dsh/$f" "$DSH_HOME/$f"
    done
  fi
fi
# The transcript goes OUTSIDE the workspace. Written as `$d/o.txt` it is a file the model can
# see and edit, and one run in six wrote its card into the very file that measures it.
out=$(mktemp)
# macOS has no timeout(1), so perl carries the alarm. It reports the timeout as an exit code
# rather than dying of the signal: the earlier `exec` form let SIGALRM kill the subshell, and the
# SHELL announces that — `95054 Alarm clock: 14  perl -e …` lands on this script's stderr AHEAD of
# the verdict, so a caller reading the first line gets a job-control message instead of `timeout`.
# Redirecting the subshell does not help; the message comes from the parent. Forking and exiting
# 142 by hand is what keeps the line clean, and the SIGTERM is what stops a timed-out `dsh`
# outliving the run that gave up on it.
( cd "$d" && perl -e '$SIG{ALRM} = sub { kill 15, $p; exit 142 }; alarm shift; $p = fork; if (!$p) { exec @ARGV } waitpid $p, 0; exit $? >> 8' \
    "${EVAL_TIMEOUT:-900}" ${EVAL_CMD:-dsh --profile headless} "$prompt" > "$out" 2>&1 )
# `EVAL_CMD` exists for one test and nothing else: the timeout path cannot be measured through
# `dsh`, because a run with a throwaway credential comes back 401 in well under a second and the
# alarm never fires. Measured — six identical runs went 142/1/142/1/1/1, so the assertion turned
# on how fast the gateway answered. With a command that reliably outlasts the alarm the branch
# below is testable; nothing else sets it.
# A timeout has two very different causes and the verdict alone cannot separate them: the model
# was producing slowly (a machine under load — every timeout so far arrived while a dozen other
# evals were running), or it wedged and produced nothing. Print the bytes it had written and where
# to look, the same way the crash branches do; a verdict with nowhere to go is a verdict nobody
# can act on.
[ $? -eq 142 ] && {
  echo "timeout after ${EVAL_TIMEOUT:-900}s  bytes=$(wc -c < "$out" | tr -d ' ')  $d  reply=$out"
  exit 3
}
# Tool calls live in the session transcript, not the reply — the visualisation rule
# ("this block, not a tool") is invisible without them.
# The session dir is the workdir with slashes turned to dashes and wrapped in `--`, but the
# path has been through /private, so match on the trailing mktemp name instead of rebuilding it.
# dsh exits before the transcript is on disk, so a lookup right after it returns finds nothing and
# the run is reported `crash/nosession` — with a complete reply sitting in `$out`. Measured three
# times in one session, including on two runs whose replies opened with a ui4a fence. Poll briefly
# for the file rather than sleeping: it is usually there within a second, and a run that genuinely
# never reached a model still falls through after the deadline.
# The transcript is written when the session CLOSES, not as it goes: measured, a session directory
# appeared at 22:58 and its `session.jsonl.zstd` landed at 23:06 — eight minutes later, the moment
# dsh exited. A lookup right after the process returns therefore finds a directory with nothing in
# it, and every earlier version of this reported `crash/nosession` on runs whose reply was a
# complete ui4a card. So: wait for the directory, then wait for the file.
# The flush is independent of the model request timeout and has reached 37s in a real run; allow
# 120s before calling a completed reply an unfinished/no-session run.
sess=""
transcript=""
for _ in $(seq 480); do
  sess=$(ls -td "${DSH_HOME:-$HOME/.dsh}/sessions/"*"$(basename "$d")--"/session-* 2>/dev/null | head -1 || true)
  [ -n "$sess" ] && break
  sleep 0.25
done
if [ -n "$sess" ]; then
  for _ in $(seq 480); do
    if [ -s "$sess/session.v4.jsonl.zstd" ]; then transcript="$sess/session.v4.jsonl.zstd"; break; fi
    if [ -s "$sess/session.jsonl.zstd" ]; then transcript="$sess/session.jsonl.zstd"; break; fi
    sleep 0.25
  done
  [ -n "$transcript" ] || sess=""
fi
# `name` sits inside `data`, well past the first `}` — grep the whole record, take the last name.
calls=$(zstd -dc "$transcript" 2>/dev/null \
  | grep -o '"type":"tool/call".*' | grep -o '"name":"[a-z_]*"' | cut -d\" -f4 \
  | sort | uniq -c | awk '{print $2"x"$1}' | tr '\n' ' ')

# Ask the transcript how the turn ended rather than pattern-matching stdout. dsh writes a
# `turn/end` record whose reason is `completed` on success and `{kind: error, code: …}` when the
# request failed — an upstream 400, an exhausted balance, a refused tool. Three earlier versions
# of this check grepped for error strings and each missed the next failure to come along; this
# one asks the structure. A missing transcript still means the run never reached a model at all.
# Two crash branches, two different causes, and they were printing the same line — so a run that
# plainly produced a card could report `crash` with no way to tell whether the transcript was
# missing or the turn was unfinished, and no path to go and look. Say which, and where.
if [ ! -s "$out" ] || [ -z "$sess" ]; then
  echo "crash/nosession  $(tr '\n' ' ' < "$out" | cut -c1-100)  $d  reply=$out"
  exit 2
fi
# Matched loosely on purpose: `"kind": "completed"` with or without spaces, so the check does
# not turn on dsh's JSON formatting.
if ! zstd -dc "$transcript" 2>/dev/null | grep -qE '"kind" *: *"completed"'; then
  echo "crash/unfinished  $(tr '\n' ' ' < "$out" | cut -c1-100)  $d  reply=$out  session=$sess"
  exit 2
fi
# The CLI output can contain the model's reasoning stream, including scratch fences and computed
# values. The browser consumes only assistant `type:"text"` blocks, so derive the measured reply
# from the v4 transcript instead of counting reasoning that never reaches the chat node.
visible=$(mktemp)
if ! zstd -dc "$transcript" 2>/dev/null | bun "$here/scripts/visible-reply.ts" - > "$visible"; then
  echo "crash/parse  transcript=$transcript  raw=$out"
  exit 2
fi
# A rule that lives in the SKILL can only be measured on a run that loaded it, and a run that did
# not is not evidence about the rule — it is evidence about the trigger layer. The tool list has
# always carried this and it is easy to read past, so say it in one word: `skill=no` is a reason to
# discard the run from a skill-rule measurement, not a result. Three separate conclusions were
# written from runs that never read the rule they were testing before this line existed.
skill=$(printf %s "$calls" | grep -q 'skillx' && echo yes || echo no)

# `$d` is a `mktemp -d` the system reclaims, so a canvas card's SOURCE vanished with it and every
# source-level statistic silently covered only the fence half. Measured on wave 7: canvas=21 vs
# fence=22, and grok-4.6 wrote ZERO fences — it was absent from every source analysis, not
# under-represented in one. Copying the directory costs nothing and changes no verdict.
if [ -d "$d/.dsh/ui4a/canvases" ]; then cp -R "$d/.dsh/ui4a/canvases" "$visible.canvases"; fi
# A card written to the WRONG path is invisible twice: the user never sees it (nothing outside
# `.dsh/ui4a/canvases/` is mounted) and the verdict reads `canvas=0`, which scores as "chose not
# to build one". Measured once in wave 8 — a complete 150-line routine written to `rutina.tsx` in
# the workspace root. Rare, but it is the one failure that looks exactly like the model declining.
stray=$(find "$d" -name '*.tsx' -not -path "$d/.dsh/*" 2>/dev/null | sort | grep -vxF "$seeded" 2>/dev/null | head -3 | tr '\n' ',')
fences=$(awk '{ sub(/\r$/, ""); if ($0 == "````ui4a/tsx") { open = 1; next } if ($0 == "````" && open) { count++; open = 0 } } END { print count + 0 }' "$visible")
echo "skill=$skill fence=$fences canvas=$(ls "$d"/.dsh/ui4a/canvases/ 2>/dev/null | wc -l | tr -d ' ') bytes=$(wc -c < "$visible" | tr -d ' ')  tools=[${calls% }]  $d  reply=$visible raw=$out canvases=$visible.canvases${stray:+  stray=${stray%,}}"
