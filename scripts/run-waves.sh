#!/bin/bash
# Drive a range of waves back to back, one process, resumable.
#
# A single wave is ~72 runs and outlives most shell-level timeouts, so each wave used to be started
# by hand and lost partway. This loop owns the whole range: `run-wave.py` caches completed runs, so
# re-invoking this after any interruption picks up exactly where it stopped.
#
# Usage: ./scripts/run-waves.sh <from> <to>   (WAVE_ROOT defaults to ~/.cache/genui-loop)
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
. "$HERE/wave-root.sh"
FROM=$1; TO=$2
for w in $(seq "$FROM" "$TO"); do
  echo "===== WAVE $w  $(date +%H:%M:%S)"
  uv run "$HERE/run-wave.py" "$w" || echo "wave $w exited nonzero"
  n=$(ls "$WAVE_ROOT/waves/w$(printf %03d "$w")"/*.txt 2>/dev/null | wc -l | tr -d ' ')
  echo "===== WAVE $w done: $n runs  $(date +%H:%M:%S)"
done
echo "ALL WAVES $FROM..$TO COMPLETE"
