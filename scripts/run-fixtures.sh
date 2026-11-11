#!/usr/bin/env bash
# Run every prompt in the "Must" tables of test/eval-fixtures.md N times and print a grid.
# Only those tables: the later sections quote tool names and commands in backticks too.
set -u
runs=${1:-3}
seed=${2:-}
prompts=$(awk '
  /^## (Must stay prose|Must produce UI|Correctness)/ { on=1; next }
  /^## / { on=0 }
  on && /^\| `/ { line=$0; sub(/^\| `/, "", line); sub(/`.*/, "", line); print line }
' test/eval-fixtures.md)

# Run concurrently but capped — serially the grid outlives a tool timeout, and unbounded it
# exhausts the account's balance partway through, which turns the rest of the table into `crash`
# rows. Unbounded, a 23x3 grid ran the balance out partway through; four lanes is a guess at a
# safe width, not a measured one.
lanes=${LANES:-4}
tmp=$(mktemp -d)
i=0
while IFS= read -r p; do
  [ -z "$p" ] && continue
  i=$((i + 1))
  (
    out=""
    for _ in $(seq 1 "$runs"); do
      r=$(./scripts/eval.sh "$p" $seed 2>&1)
      case "$r" in
        # A stale plugin makes every cell in the grid a measurement of the PREVIOUS prompt, and
        # the numbers look exactly like a rule that did nothing. Abort the whole run rather than
        # recording it: `*)` below would find no `fence=` and quietly print a blank cell.
        stale*) echo "$r" >&2; kill 0; exit 4 ;;
        crash*) out="$out C" ;;
        *) f=$(printf %s "$r" | grep -o 'fence=[0-9]*' | cut -d= -f2)
           c=$(printf %s "$r" | grep -o 'canvas=[0-9]*' | cut -d= -f2)
           # A cell for a run that never loaded the skill says nothing about any rule living in
           # it — lowercase marks that, so a grid used to measure a skill rule can be read for
           # which cells are even eligible.
           case "$r" in skill=no*) k=k; one=$(printf %s "$f" | tr '[:upper:]' '[:lower:]');; *) k=K; one=$f;; esac
           if [ "${c:-0}" != "0" ]; then out="$out $k"; else out="$out $one"; fi ;;
      esac
    done
    printf '%-46s %s\n' "$(printf %s "$p" | cut -c1-44)" "$out" > "$tmp/$(printf %02d "$i")"
  ) &
  # throttle: keep at most $lanes prompts in flight
  while [ "$(jobs -pr | wc -l)" -ge "$lanes" ]; do wait -n 2>/dev/null || sleep 1; done
done <<< "$prompts"
wait
cat "$tmp"/* 2>/dev/null
rm -rf "$tmp"
