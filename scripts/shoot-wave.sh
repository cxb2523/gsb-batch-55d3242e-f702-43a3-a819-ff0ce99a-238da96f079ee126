#!/bin/bash
# Extract every card a wave produced and shoot it at 320/440/720 in both themes.
#
# One harness per (card, theme) on a random high port: the harness binds one card at start-up, and
# the theme is read from THEME at that moment too, so a single long-lived server cannot cover the
# grid. Ports are randomised because the previous runner reused one and a lingering process from
# the last wave served the last wave's card under this wave's filename — a screenshot that looks
# fine and belongs to nothing.
set -u
W=$(printf "w%03d" "$1")
REPO=$(cd "$(dirname "$0")/.." && pwd)
. "$(dirname "$0")/wave-root.sh"
ROOT=$WAVE_ROOT
DIR=$ROOT/waves/$W
CARDS=$ROOT/cards/$W; SHOTS=$ROOT/shots/$W
mkdir -p "$CARDS" "$SHOTS"

for f in "$DIR"/*.txt; do
  [ -e "$f" ] || continue
  tag=$(basename "$f" .txt)
  reply=$(grep -o 'reply=[^ ]*' "$f" | head -1 | cut -d= -f2)
  [ -n "$reply" ] && [ -f "$reply" ] || continue
  python3 "$REPO/scripts/extract-fences.py" "$reply" "$CARDS" "$tag" >/dev/null 2>&1
  # A canvas is a FILE, not a fence: counting fences alone misses it entirely, which this project
  # has recorded twice as a wrong conclusion.
  ws=$(grep -o '/var/folders[^ ]*' "$f" | head -1)
  if [ -n "$ws" ]; then
    for c in "$ws"/.dsh/ui4a/canvases/*.ui4a.tsx; do
      [ -e "$c" ] && cp "$c" "$CARDS/$tag-canvas-$(basename "$c")"
    done
  fi
done

n=$(ls "$CARDS"/*.tsx 2>/dev/null | wc -l | tr -d ' ')
echo "$W: $n cards extracted"
[ "$n" -eq 0 ] && exit 0

# One (card, theme) per line, shot CONCURRENTLY. Every pair is independent — its own harness on
# its own random port, its own output file — and the loop that used to run them one at a time
# spent most of its wall clock waiting for a server to boot: 86 cards x 2 themes x (start +
# poll + shoot + kill) is 172 serial round trips for work with no ordering between any two of
# them. `xargs -P` rather than a hand-rolled gate because macOS ships bash 3.2, which has no
# `wait -n` — a counter-based gate there fails silently open and spawns everything at once.
#
# The cap is deliberately below the core count: each job runs a bun server AND a headless
# Chromium, so the limit is memory and the GPU process, not CPU.
shoot_one() {
  card=$1; theme=$2
  base=$(basename "$card"); base=${base%.tsx}; base=${base%.ui4a}
  # Already shot: skip. A wave's shoot is the slowest stage by far, and it gets interrupted —
  # a killed run, a machine asleep, a retune of the concurrency. Without this, resuming means
  # re-taking every image that already exists, which is most of them. `SHOOT_FORCE=1` re-takes
  # anyway, which is what a rendering change needs.
  if [ "${SHOOT_FORCE:-}" != 1 ]; then
    have=1
    for w in 320 440 720; do [ -s "$SHOTS/$base.$theme.$w.png" ] || have=0; done
    [ "$have" = 1 ] && return
  fi
  port=$(( 30000 + RANDOM % 20000 ))
  THEME=$theme nohup bun "$REPO/scripts/surface-harness.ts" "$port" "$card" >>"$ROOT/h.log" 2>&1 &
  hp=$!
  # `-f` is not optional: without it curl exits 0 on a refused connection too, so `&& break`
  # fires on the first attempt, the shot runs against nothing, and the wave reports 0 screenshots
  # with no error anywhere. Cost an hour of looking at the wrong half of the pipeline.
  up=0
  for _ in $(seq 60); do curl -sf -o /dev/null "http://127.0.0.1:$port/surface.js" && { up=1; break; }; sleep 0.25; done
  [ "$up" = 1 ] || { echo "  harness never came up on $port for $base ($theme)"; kill $hp 2>/dev/null; return; }
  bun "$REPO/scripts/shot-card.mjs" "$port" "$SHOTS/$base.$theme" 2>&1 | grep -E "OVERFLOW|CRUSHED|UNUSED|STRETCHED|FLUSH|pageerror|WARN" | sed "s|^|  $base.$theme |" | tee -a "$SHOTS/defects.log"
  kill $hp 2>/dev/null
}
export -f shoot_one
export REPO ROOT SHOTS

SHOOT_JOBS=${SHOOT_JOBS:-6}
for card in "$CARDS"/*.tsx; do
  for theme in light dark; do printf '%s\0%s\0' "$card" "$theme"; done
done | xargs -0 -P "$SHOOT_JOBS" -n 2 bash -c 'shoot_one "$0" "$1"' 
echo "$W: $(ls "$SHOTS"/*.png 2>/dev/null | wc -l | tr -d ' ') screenshots"
