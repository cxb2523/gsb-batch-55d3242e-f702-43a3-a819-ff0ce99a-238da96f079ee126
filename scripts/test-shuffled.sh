#!/bin/sh
# The suite, in many random orders, with the seed printed so a failure can be reproduced.
#
# bun shares one global and one module registry per RUN, not per file, so a test that stubs
# `document` or leaves a transcript listener registered breaks whichever file runs next. That is
# invisible in the default alphabetical order.
#
# ONE shuffled run is not a check. This suite failed half of all seeds while a single shuffled
# run had been passing and the record here said it was verified — a 50% failure rate looks
# exactly like success one time in two. `--randomize --seed=N` makes each order reproducible,
# which is the difference between knowing there is a bug and being able to find it.
#
# POSIX sh, not zsh: the CI runner is ubuntu and has no zsh, so `zsh scripts/…` exited 127 —
# "command not found" reported as a failing check, on a machine where every local run passed
# because macOS ships zsh. Nothing here needs a shell beyond sh.
#
# Usage: [JOBS=<cores>] scripts/test-shuffled.sh [runs]   (default 20)
set -e
cd "$(dirname "$0")/.."
runs=${1:-20}
# Each seed is its own process, so they run side by side; outputs land in files and are read in order.
out=$(mktemp -d)
seq 1 "$runs" | xargs -P "${JOBS:-$(getconf _NPROCESSORS_ONLN)}" -I{} sh -c 'bun test --randomize --seed={} >"$0/{}" 2>&1 || touch "$0/{}.failed"' "$out"
failed=0
for seed in $(seq 1 "$runs"); do
  if [ -e "$out/$seed.failed" ]; then
    failed=$((failed + 1))
    echo "seed $seed FAILED — reproduce with: bun test --randomize --seed=$seed"
    grep -E '\(fail\)' "$out/$seed" | head -5
  fi
done
rm -rf "$out"
if [ "$failed" -gt 0 ]; then
  printf '\n%s of %s shuffled orders failed\n' "$failed" "$runs"
  exit 1
fi
echo "$runs shuffled orders, all clean"
