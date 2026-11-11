# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Evaluate a round against the predictions registered for it, with the thresholds frozen here.

**Why this file exists.** r006's read said "rule 2 is flat". It was not flat; it was read on the
wrong population, and the right one was chosen only after the flat number came back. Nothing in the
process stopped that — `PREDICTIONS.md` named the metric, but a human reading a wall of counters
picks which line to believe. So the thresholds live in code, committed BEFORE the round finishes,
and this prints a verdict per prediction rather than a table to interpret.

Every threshold below is quoted from `eval/PREDICTIONS.md` § r007 and must not be edited to match a
result. Editing one after the fact is the failure this file is for; if a threshold turns out to be
wrong, say so in the read and register a new one for the NEXT round.

    uv run eval/read-round.py <before-round-dir> <after-round-dir>
"""
import json, re, subprocess, sys, pathlib

REPO = pathlib.Path(__file__).resolve().parent.parent


def run(*cmd: str) -> str:
    p = subprocess.run(cmd, capture_output=True, text=True, cwd=REPO)
    if p.returncode: sys.exit(f"instrument failed: {' '.join(cmd)}\n{p.stderr[-2000:]}")
    return p.stdout


def grab(text: str, pattern: str, what: str) -> list[str]:
    """Regex a number out of an instrument, and DIE if the format moved.

    A miss returning 0.0 is the shape §6.4 names — "no failures" and "nothing was examined"
    printing the same number — and it is worse here than anywhere, because the verdict below would
    read as PASS.
    """
    m = re.search(pattern, text)
    if not m: sys.exit(f"could not read {what}; the instrument's output format moved:\n{text[:800]}")
    return list(m.groups())


def case_canvases(round_dir: str, case: str) -> tuple[int, int]:
    """(runs of this case that wrote a canvas, runs of it that finished)."""
    d = pathlib.Path(round_dir) / case
    if not d.is_dir(): return (0, 0)
    runs = [json.loads(p.read_text()) for p in d.glob("*/meta.json")]
    runs = [m for m in runs if m["status"] in ("complete", "timeout")]
    return sum(1 for m in runs if any(c["kind"] == "canvas" for t in m["turns"] for c in t["cards"])), len(runs)


def verdict(name: str, ok: bool | None, detail: str) -> None:
    tag = "PASS" if ok else ("FAIL" if ok is False else "……")
    print(f"  [{tag}] {name}\n         {detail}")


def main() -> None:
    before, after = sys.argv[1], sys.argv[2]
    print(f"{pathlib.Path(before).name} → {pathlib.Path(after).name}\n")

    d = run("uv", "run", "eval/delta.py", before, after)
    print(d[:d.index("counters, paired")] if "counters, paired" in d else d)
    print("── 预注册的六条，阈值在结果出现之前就写死在本文件里 ──\n")

    # 1. sticky — the AST instrument decides; the grep is reported beside it, never instead of it.
    s = run("node", "eval/sticky.mjs", before, after, "--paired")
    pa, pb = grab(s, r"前 \d+/\d+ = ([\d.]+)%\s+后 \d+/\d+ = ([\d.]+)%", "sticky paired rates")
    verdict("1. sticky 恢复（AST 口径，阈值 ≥ 2.0%）", float(pb) >= 2.0,
            f"{pa}% → {pb}%   " + ("低于阈值 = 极性假设作废，r006 的退化另有原因" if float(pb) < 2.0 else "回到 r005 量级"))

    # 2. rule 2 — both registered reads. `preview-then-commit` must not fall; the per-run read is
    #    asked to clear the SIGN test, not the SE, because the SE is what overstated it last time.
    pv = grab(d, r"preview-then-commit\s+([+-][\d.]+) ± ([\d.]+)", "preview-then-commit")
    verdict("2a. preview-then-commit 不下降", float(pv[0]) >= -2 * float(pv[1]),
            f"Δ {pv[0]} ± {pv[1]}")
    st = re.search(r"runs that ended a step\s+([+-][\d.]+) ± ([\d.]+).*?p=([\d.]+)", d)
    verdict("2b. runs that ended a step 过符号检验 p<0.05",
            float(st.group(3)) < 0.05 if st else None,
            f"Δ {st.group(1)} ± {st.group(2)}, p={st.group(3)}" if st else "无符号检验行（该计数器可能未产出配对）")

    # 3. nesting — r006 shipped a 6x-wrong figure and this got worse; r007 ships the measured one.
    nb = grab(run("node", "eval/nesting.mjs", before), r"= ([\d.]+)%", "nesting before")[0]
    na = grab(run("node", "eval/nesting.mjs", after), r"= ([\d.]+)%", "nesting after")[0]
    verdict("3. 链长≥4 回到 4.1% 以下", float(na) < 4.1, f"{nb}% → {na}%（r005 是 4.1%）")

    # 4. rules 1 and 4 held. Neither had its text weakened, so a fall here is evidence that
    #    round-to-round drift swamps rule text — which would put every read in this file in doubt.
    co = grab(d, r"cards that persist an answer\s+([+-][\d.]+) ± ([\d.]+)", "persist")
    cb = grab(run("uv", "run", "eval/sweep.py", before), r"同族碰撞\s+(\d+) 张卡片", "collisions before")[0]
    ca = grab(run("uv", "run", "eval/sweep.py", after), r"同族碰撞\s+(\d+) 张卡片", "collisions after")[0]
    verdict("4. 规则 4 守住（不显著下降）", float(co[0]) >= -2 * float(co[1]), f"Δ {co[0]} ± {co[1]}")
    print(f"         规则 1 碰撞卡片数 {cb} → {ca}（两轮卡片总数不同，看 delta.py 的配对行）")

    # 5. the panel. `overall` is the one r006 moved; a fall is the cost the canvas change could have.
    #    `delta.py` prints TWO overall lines and they disagree (+0.208 all pairs, +0.329 clean) —
    #    the registered read is the SECOND, over pairs where neither side errored, came back empty
    #    or was cut short, because that is the one r006's headline used. Taking whichever appears
    #    first is how a read drifts to the friendlier number without anyone choosing to.
    ov = re.findall(r"^ +overall +([+-][\d.]+) ± ([\d.]+)", d, re.M)
    if len(ov) < 2: sys.exit(f"expected two `overall` lines from delta.py, got {len(ov)}")
    verdict("5. panel overall 不下降（干净配对那一行）", float(ov[1][0]) >= -2 * float(ov[1][1]),
            f"Δ {ov[1][0]} ± {ov[1][1]}（全部配对那行是 {ov[0][0]} ± {ov[0][1]}）")

    # 6. canvas. The control (`onboard-doc`) landed in this round only because a resume re-read the
    #    case list, so it is read separately at 7 below rather than folded in here; the paired
    #    canvas rate on its own still cannot tell "stopped writing canvases for questions" from
    #    "stopped writing canvases".
    cv = re.search(r"…canvases\s+([+-][\d.]+) ± ([\d.]+)", d)
    ch = len(list((pathlib.Path(after) / "changelog").glob("*/turn-*.tsx"))) if (pathlib.Path(after) / "changelog").exists() else 0
    verdict("6. canvas 率下降（无反向对照，仅供参考）", None,
            f"Δ {cv.group(1)} ± {cv.group(2)}" if cv else "无配对（canvas 计数为 0）")
    print(f"         changelog 卡片 {ch} 张 —— 手数其中 canvas 的比例，阈值 ≤1/10 个 run 写文件")

    # 7-9. The three cases a resume folded into this round. Registered here while it was still
    # running and before any of their data existed — an unregistered read of a case added mid-round
    # would be indistinguishable from picking the threshold to fit.
    print("\n── 中途并入本轮的三个新用例，阈值同样先于数据写死 ──\n")

    hit, ran = case_canvases(after, "onboard-doc")
    # The control for the canvas/inline change, and the only case in the suite that ASKS for a file
    # ("我要存下来，之后每来一个新人都改改再用"). The rewrite was meant to stop canvases for
    # questions, not to abolish them; under 4 of 10 means it over-corrected and the canvas numbers
    # elsewhere are bought with a regression here.
    verdict("7. onboard-doc 仍然出文件（≥4/10）", hit >= 4 if ran else None,
            f"{hit}/{ran} 个 run 写了 canvas" + ("" if ran else " —— 该用例还没跑到"))

    hit_c, ran_c = case_canvases(after, "changelog")
    verdict("8. changelog 不出文件（≤1/10）", hit_c <= 1 if ran_c else None,
            f"{hit_c}/{ran_c} 个 run 写了 canvas" + ("" if ran_c else " —— 该用例还没跑到"))

    # The language rule is absolute — "every label, every button, every helper line" — but this is
    # its first measurement ever, so the bar is set on what would make it worth rewriting rather
    # than on a prior: above 20% and the rule does not survive contact with a Spanish conversation.
    sw = run("uv", "run", "eval/sweep.py", after)
    cjk = re.search(r"非中文对话里出现 CJK\s+(\d+) 张 / (\d+) 张", sw)
    if cjk and int(cjk.group(2)):
        n, total = int(cjk.group(1)), int(cjk.group(2))
        verdict("9. es-meal-plan 的卡片不夹中文（<20%）", n / total < 0.2, f"{n}/{total} 张卡带 CJK = {n/total:.0%}")
    else:
        verdict("9. es-meal-plan 的卡片不夹中文（<20%）", None, "该用例还没跑到，或本轮没有非中文用例")

    # 10. binary-forks. Descriptive, and that is not a hedge: this case has never run, so there is
    # no prior to set a bar against, and a threshold invented now would be a number picked to be
    # cleared. What it establishes is the baseline r008 gets compared to. `eval/twobuttons.mjs` was
    # written before this data existed and verified in both directions on hand-made cards — it
    # passes a plain two-button card and fails the same card wrapped in `rounded border`.
    tb = run("node", "eval/twobuttons.mjs", after)
    print("\n  binary-forks —— 首次测量，只立基线，不设阈值：")
    for line in tb.strip().split("\n"): print(f"    {line}")


if __name__ == "__main__": main()
