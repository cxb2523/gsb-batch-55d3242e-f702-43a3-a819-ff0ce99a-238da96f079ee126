#!/bin/bash
# Everything that happens after a wave's runs finish: score, extract, shoot, judge.
# Reading the screenshots is NOT in here on purpose — that is mine to do, and a script that
# printed a summary would let me skip it. The judges' text is a source of hypotheses; the images
# are the evidence, and this project has a recorded case of three judges agreeing on a card I had
# not looked at.
set -u
W=$1
# Never hardcode the gateway key: this file is versioned.
: "${LITELLM_KEY:?set LITELLM_KEY to the gateway key before closing a wave}"
. "$(dirname "$0")/wave-root.sh"
ROOT=$WAVE_ROOT
HERE=$(cd "$(dirname "$0")" && pwd)
cd "$ROOT"
echo "== score"
uv run "$HERE/score-wave.py" "$W"
echo "== shoot"
"$HERE/shoot-wave.sh" "$W"
n=$(ls "$ROOT/shots/w$(printf %03d "$W")"/*.png 2>/dev/null | wc -l | tr -d ' ')
[ "$n" -eq 0 ] && { echo "no cards this wave — nothing to judge"; exit 0; }
echo "== judge"
SHOTS_DIR="$ROOT/shots/w$(printf %03d "$W")" \
  CARDS_DIR="$ROOT/cards/w$(printf %03d "$W")" \
  uv run "$HERE/judge-cards.py"
