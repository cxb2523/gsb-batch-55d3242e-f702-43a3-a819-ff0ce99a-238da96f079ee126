#!/usr/bin/env python3
"""How tall the cards a wave produced actually render.

The density rule ("the unopened card should sit inside roughly two thirds of the viewport") had
no measurement behind it. This is it, and unlike the card RATE it is deterministic: the same card
renders to the same height every time, so a change of a few points is a change, not noise.

Heights come from the screenshots, which are taken at deviceScaleFactor 3 — divide by that to get
CSS pixels, which is what a viewport fraction is about.

    python3 scripts/card-height.py w015 w017
"""
import collections, os, pathlib, sys
from wave_root import ROOT

DSF = 3          # `shot-card.mjs` shoots at deviceScaleFactor 3 so a judge can read 13px labels
VIEWPORT = 800   # a common laptop viewport; 60% of it is the budget the prompt asks cards to fit

try:
    from PIL import Image
except ImportError:
    sys.exit("card-height needs Pillow: uv run --with pillow scripts/card-height.py <wave>")

for name in sys.argv[1:]:
    shots = ROOT / "shots" / name
    by_width = collections.defaultdict(list)
    for f in sorted(shots.glob("*.png")):
        parts = f.stem.rsplit(".", 2)          # <tag>.<theme>.<width>
        if len(parts) != 3: continue
        by_width[int(parts[2])].append(Image.open(f).size[1] / DSF)
    if not by_width:
        print(f"{name}: no shots — run scripts/shoot-wave.sh first")
        continue
    print(f"{name}  (viewport {VIEWPORT}px, 60vh = {VIEWPORT * 6 // 10}px)")
    for w in sorted(by_width):
        v = sorted(by_width[w]); n = len(v)
        over = 100 * sum(x > VIEWPORT * 0.6 for x in v) // n
        twice = 100 * sum(x > VIEWPORT * 2 for x in v) // n
        print(f"  {w:>4}px wide  median {v[n // 2]:>6.0f}  over 60vh {over:>3}%  over 2 screens {twice:>3}%  max {v[-1]:.0f}")
