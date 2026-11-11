#!/usr/bin/env python3
"""What the cards a wave produced actually look like — not whether one appeared.

Card RATE answers "did the model decide an interface was warranted". It cannot answer the
questions that follow: is the thing dense, does it fold, did it reach for a library or
hand-roll. Those need the source, which lives in the reply file for a fence card and in
`canvases/` for a canvas one.
"""
import collections, os, pathlib, re, sys
from wave_root import ROOT

FENCE = re.compile(r"```+ui4a/tsx\n(.*?)```+", re.S)

def sources(wave: pathlib.Path):
    for f in sorted(wave.glob("*.txt")):
        t = f.read_text()
        if not t.startswith("skill="): continue
        m = re.search(r"reply=(\S+)", t)
        p = pathlib.Path(m.group(1)) if m else None
        if p and p.exists():
            for src in FENCE.findall(p.read_text()): yield f.stem, src
    for d in (wave / "canvases").glob("*/**/*.tsx"):
        yield d.parent.name, d.read_text()

# Each probe is deliberately narrow: a wide one counts unrelated uses of the same API and
# invents defects that are not there. `expanded` plus a conditional render is what folding
# actually looks like; `useState(false)` alone is any boolean at all.
PROBES = {
    "headlessui": lambda s: "@headlessui/react" in s,
    "shiki":      lambda s: "shiki" in s or "codeToHtml" in s,
    "folds":      lambda s: bool(re.search(r"aria-expanded", s)) or "Disclosure" in s,
    "bare <pre>": lambda s: "<pre" in s and "codeToHtml" not in s,
    "charts":     lambda s: "recharts" in s,
    "icons":      lambda s: "lucide-react" in s,
}

for name in sys.argv[1:]:
    wave = pathlib.Path(name) if "/" in name else ROOT / "waves" / name
    stat, lines = collections.Counter(), []
    for _, src in sources(wave):
        stat["cards"] += 1
        lines.append(len(src.splitlines()))
        for label, hit in PROBES.items():
            if hit(src): stat[label] += 1
    n = stat["cards"] or 1
    med = sorted(lines)[len(lines) // 2] if lines else 0
    print(f"{wave.name}  cards={stat['cards']}  median={med} lines")
    for label in PROBES:
        print(f"   {label:<12} {stat[label]:>3}  {stat[label] * 100 // n:>3}%")
