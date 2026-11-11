# /// script
# requires-python = ">=3.11"
# ///
"""Pair the judge panel's verdicts before and after a change, per card.

The panel's own spread is ~2.0, so a difference in wave means says almost nothing. But when the
SOURCE is fixed and only the rendering changed, every card is its own control: the same five models
grade the same TSX twice, and the only difference is the pixels. Paired, that reads clean —
measured +0.40 across 7 cards with the `text-base` fix, every one of them up.

Reads /tmp/judge-cache, splits on file mtime. Usage:

    uv run scripts/judge-delta.py [minutes]     # default 10 — anything newer is "after"
"""
import collections, glob, json, os, re, statistics, sys, time

cut = time.time() - float(sys.argv[1] if len(sys.argv) > 1 else 10) * 60
before, after = collections.defaultdict(list), collections.defaultdict(list)
for f in glob.glob("/tmp/judge-cache/*"):
    r = json.loads(open(f).read())
    m = re.search(r"SCORE:\s*([\d.]+)", r.get("verdict") or "")
    if not m: continue
    (after if os.path.getmtime(f) > cut else before)[r["card"]].append(float(m.group(1)))

pairs = [(c, statistics.mean(before[c]), statistics.mean(after[c]), len(after[c])) for c in after if c in before]
if not pairs:
    sys.exit("no card was judged on both sides of the split — widen or narrow the minutes argument")
for c, b, a, n in sorted(pairs, key=lambda t: t[2] - t[1]):
    print(f"{c:58} {b:.2f} -> {a:.2f}  {a - b:+.2f}  (n={n})")
d = [a - b for _, b, a, _ in pairs]
up = sum(x > 0 for x in d)
mean = statistics.mean(d)
# Paired removes the judges' ~2.0 between-card spread, but not their within-card noise, and the
# per-card deltas here still scatter by more than a point. Say whether the mean clears its own
# standard error before reading anything into it — at 7 cards this looked like +0.40 and at 18 it
# was +0.25, which is what a number below 2 SE looks like while it is still moving.
se = statistics.stdev(d) / len(d) ** 0.5 if len(d) > 1 else float("inf")
verdict = "significant" if abs(mean) > 2 * se else "NOT significant — do not report this as an effect"
print(f"\n{len(pairs)} paired cards · mean {mean:+.2f} ± {se:.2f} (SE) · {up} up, {len(d) - up} down or flat")
print(f"{verdict}")
