# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow~=12.0", "numpy~=2.0"]
# ///
"""Controls that do nothing: clicked, unchanged 20 seconds later, and nothing sent.

**This is not rule 2.** Rule 2 is "no control ends the step" — the card offers no way to finish.
This is the control that is *there*, is clickable, and is wired to nothing: a tab that does not
switch, a step that does not expand, a variant that does not swap. `dead_clicks` cannot see it
because its `ok` only means the driver FOUND a control at that ref and clicked it.

It needs no probe change. The harness already shoots the card before the reader touches it and
again after, so an inert control is a byte-identical PNG pair — and PNG encoding is deterministic,
so identical pixels really do produce identical bytes. Verified not to be the driver skipping the
second shot: across 112 candidates the two files were written a median of 21.5 s apart and **none**
were closer than 11 s.

**Four false-positive classes, every one found by reading the hits rather than by thinking.** The
raw count was 116 of 517 clicking turns (22%); it is 74 (14.3%) once these are gone, and the
subtractions are worth keeping because a future widening of this file will re-introduce them:

| class | why it is not a defect | n |
|---|---|---|
| the click sent the turn | the step ended; the card is supposed to sit still | 4 |
| a copy / download button | copying changes nothing visible, and a toast is long gone 20 s later | 19 |
| the click landed on an input or a slider | the driver clicks, it does not type or drag — CLAUDE.md §6.1 already records that a bare `.click()` unlocks nothing | 12 |
| the card is at the 4800px shot cap | growth past the clip is invisible, so "unchanged" cannot be read | 1 |

The third is detected off the card SOURCE (`placeholder=`, a `type="range"` within 400 chars of the
label), not off the label's length — the first version used `len(label) > 28` and missed `例如 360`,
`300` and `轨道倾角（度）`, which are exactly the shape it was meant to catch.

**It still misses some, and the residue is measured rather than assumed.** Reading 38 of r006's 74
hits found **5 that are still the driver clicking what it cannot operate** — a `type="text"` holding
`300`, a `<select>` whose native dropdown does not render into a screenshot, a form of labelled
fields. So the honest reading of a number from this file is **about 13% high**: r006's 14.3% is
roughly 12.4% real, or one clicking turn in eight. Do not quote the raw rate as the defect rate, and
re-read a sample every round — the residue is a property of what the cards happen to build.

**A note on the shot cap.** The driver's `Math.min(2400, …)` is CSS pixels and the PNG is written at
`deviceScaleFactor: 2`, so the cap in the file is **4800**. Testing `>= 2400` marked 20 cards as
uncheckable that were fine, and would have reported 11.8% instead of 14.3%.

    uv run eval/inert.py <round-dir> [--show=N]
"""
import collections, json, pathlib, re, sys

COPY = ("复制", "copy", "拷贝", "下载", "download", "导出", "分享", "share")
SHOT_CAP = 4800


def diff_identical(before: pathlib.Path, after: pathlib.Path) -> bool | None:
    """`True` when the card is pixel-identical. `None` when the pair cannot be compared."""
    from PIL import Image
    import numpy as np
    a, b = Image.open(before).convert("RGB"), Image.open(after).convert("RGB")
    if a.size[1] >= SHOT_CAP: return None                    # growth past the clip is invisible
    if a.size != b.size: return False                        # it grew or shrank: it changed
    return not (np.abs(np.asarray(a, dtype=np.int16) - np.asarray(b, dtype=np.int16)).sum(axis=2) > 12).any()


def input_like(sources: list[str], label: str) -> str | None:
    """Whether the clicked label names an input or a slider, read off the card's own source."""
    esc = re.escape(label.strip()[:24])
    for s in sources:
        if re.search(rf'placeholder=["\'{{`][^"\'}}`]*{esc}', s): return "placeholder"
        for m in re.finditer(esc, s):
            window = s[max(0, m.start() - 400): m.start() + 400]
            if 'type="range"' in window or "type='range'" in window: return "slider"
            if 'type="number"' in window and "<label" in window: return "number-input"
    return None


def scan(root: pathlib.Path) -> tuple[dict[tuple[str, str], tuple[int, int]], "collections.Counter[str]", list[tuple[str, str, str, list[str]]]]:
    """`(case, model) -> (inert turns, clicking turns)`, plus what was dropped and why, plus the hits."""
    per: dict[tuple[str, str], list[int]] = {}
    dropped = collections.Counter()
    hits: list[tuple[str, str, str, list[str]]] = []

    for meta_path in sorted(root.glob("*/*/meta.json")):
        case, model = meta_path.parent.parent.name, meta_path.parent.name
        meta = json.loads(meta_path.read_text())
        shots, sources = meta_path.parent / "shots", None
        for turn in meta["turns"]:
            clicks = turn["clicks"]
            if not clicks: continue
            tn = f"t{turn['n']:02d}"
            after = shots / f"{tn}-after-w380-light.png"
            befores = [p for p in shots.glob(f"{tn}-*-w380-light.png") if "-after-" not in p.name]
            if not after.exists() or len(befores) != 1: continue
            tally = per.setdefault((case, model), [0, 0]); tally[1] += 1
            if any(c["sent"] for c in clicks): dropped["sent the turn"] += 1; continue
            same = diff_identical(befores[0], after)
            if same is None: dropped["at the shot cap"] += 1; continue
            if not same: continue
            labels = [c["label"] for c in clicks]
            if all(any(k in l.lower() for k in COPY) for l in labels): dropped["copy button"] += 1; continue
            if sources is None:
                sources = [p.read_text(errors="ignore") for p in meta_path.parent.glob("turn-*.tsx")]
            if all(input_like(sources, l) for l in labels): dropped["input or slider"] += 1; continue
            tally[0] += 1
            hits.append((case, model, tn, labels))
    return {k: (v[0], v[1]) for k, v in per.items()}, dropped, hits


def main() -> None:
    import statistics
    if "--paired" in sys.argv:
        # Only cells where BOTH sides produced clicking turns: a run the reader never clicked has
        # no rate, and scoring it 0% lets a round win by building cards nobody can touch.
        a, b = (scan(pathlib.Path(p))[0] for p in sys.argv[1:3])
        keys = [k for k in a if k in b and a[k][1] and b[k][1]]
        d = [b[k][0] / b[k][1] - a[k][0] / a[k][1] for k in keys]
        mean, se = statistics.fmean(d), statistics.stdev(d) / len(d) ** 0.5
        ia, na = sum(a[k][0] for k in keys), sum(a[k][1] for k in keys)
        ib, nb = sum(b[k][0] for k in keys), sum(b[k][1] for k in keys)
        print(f"配对 {len(keys)} 组（两侧读者都点过东西）")
        print(f"  惰性率  {mean:+.3f} ± {se:.3f}  {'← 过 2SE' if se > 0 and abs(mean) >= 2 * se else '(未过 2SE)'}")
        print(f"  同一批格子: 前 {ia}/{na} = {100 * ia / na:.1f}%   后 {ib}/{nb} = {100 * ib / nb:.1f}%")
        return

    root = pathlib.Path(sys.argv[1])
    show = int(next((x.split("=")[1] for x in sys.argv[2:] if x.startswith("--show=")), 0))
    per, dropped, hits = scan(root)
    turns = sum(n for _, n in per.values())
    print(f"{root.name}: {turns} 个「读者点了东西」的 turn\n")
    print(f"  惰性控件（点了、逐像素未变、也没发消息）  {len(hits):4} = {len(hits) / turns:.1%}" if turns else "  没有可比对的 turn")
    for reason, n in dropped.most_common(): print(f"    剔除 · {reason:18} {n:4}")
    if show:
        print(f"\n── 前 {show} 个命中（计数之前先读它们）──")
        for case, model, tn, labels in hits[:show]:
            print(f"  {case}/{model} {tn}  点: {' / '.join(l[:34] for l in labels)}")


if __name__ == "__main__": main()
