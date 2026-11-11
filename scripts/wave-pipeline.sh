#!/bin/bash
# Generate -> shoot -> judge for one wave, overlapping the stages that do not depend on each other.
#
# The three stages look sequential and are not. Judging a card needs THAT CARD's six shots and
# nothing else, so waiting for the whole shoot to finish before starting the judge leaves the
# gateway idle for as long as the shoot takes — measured, the shoot is the slowest stage by far
# (one bun server plus a headless Chromium per card-theme pair).
#
# So: run the shoot, and run a judge loop beside it that picks up whatever is complete. The judge
# caches per card, so a card seen twice costs one lookup the second time; and its own guard —
# refusing a card whose six images are not all there — is what makes the overlap safe rather than
# a source of verdicts about half-drawn cards. That guard stays exactly as it is.
set -u
W=$1
REPO=$(cd "$(dirname "$0")/.." && pwd)
. "$(dirname "$0")/wave-root.sh"
ROOT=$WAVE_ROOT
WD=$(printf "w%03d" "$W")

bash "$REPO/scripts/shoot-wave.sh" "$W" &
shoot=$!

# First pass only once some shots exist: an empty directory makes the judge print a bare
# "no cards" and exit, which reads like a failure rather than "not yet".
while [ "$(ls "$ROOT/shots/$WD" 2>/dev/null | wc -l)" -lt 6 ] && kill -0 $shoot 2>/dev/null; do sleep 5; done

pass=0
while :; do
  pass=$((pass + 1))
  LITELLM_KEY=${LITELLM_KEY:?set LITELLM_KEY} \
    SHOTS_DIR="$ROOT/shots/$WD" CARDS_DIR="$ROOT/cards/$WD" \
    uv run "$REPO/scripts/judge-cards.py" 2>&1 | sed "s/^/[judge $pass] /"
  kill -0 $shoot 2>/dev/null || break
  sleep 20
done
wait $shoot
echo "$WD pipeline done after $pass judge passes"
