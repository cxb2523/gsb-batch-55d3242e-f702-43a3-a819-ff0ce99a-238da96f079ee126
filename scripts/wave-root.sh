# The wave root, in one place for every shell script that needs it: `. "$(dirname "$0")/wave-root.sh"`.
#
# Under ~/.cache, not /tmp: macOS reaps /tmp and took every wave from w001 to w019 with it —
# cards, screenshots and verdicts, all of it paid for in real model calls.
#
# One place per language rather than one per script. The value was written out in ten files, with
# the same comment pasted beside it six times, and the two that FORGOT to read the variable at all
# measured an empty directory and reported that as a result. `wave_root.py` is this file's twin.
WAVE_ROOT=${WAVE_ROOT:-$HOME/.cache/genui-loop}
