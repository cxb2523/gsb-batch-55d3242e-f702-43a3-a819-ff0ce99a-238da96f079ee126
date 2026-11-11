# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Did the prompt change anything? Read the two rounds PAIRED, per (case, model).

The panel's own spread is about 2.0 points, and two rounds asking different questions have been
measured 0.5 apart in the pooled mean with nothing changed at all. So a pooled before/after mean
cannot see an effect this size. What can is the paired delta: the same case, the same model, one
variable, and a standard error taken over the pairs.

The deterministic counters are read the same way, and they are the ones that carry a small effect
— whether a click sent a message is a fact, not an opinion.

Nothing here says "significant" below 2 standard errors. That threshold is why the `text-base` fix
was readable at +0.45 while its own pooled mean said +0.23 and meant nothing.

    uv run eval/delta.py <before-round> <after-round> [--upto=N]
"""
import json, math, pathlib, statistics, sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from score import facts, persist_keys

KEYS = ["trigger", "clarify", "interaction", "hierarchy", "craft", "overall"]
# The counters worth a paired read. Each is (label, numerator, denominator) over one run.
COUNTERS = [
    ("turns with a card", lambda f: f["turns_with_card"], lambda f: f["turns"]),
    ("card at turn 3+", lambda f: int(f["later_card"]), lambda f: 1),
    ("clicks that fired the turn", lambda f: f["clicks_that_sent"], lambda f: f["clicks"]),
    # Rule 2's OWN population, and the one to judge it by. The line above pools over clicks, where
    # a run that explores thirty times and submits once scores 3% — and exploring is what the skill
    # asks a card to let the reader do. Read r005→r006 both ways: pooled says 13.1%→13.0% and looks
    # flat; per run says 32.7%→42.5%. The rule's own evidence counts runs ("108 of 161 never once
    # got a result back out"), so the pooled line was never the read, it was just the one that
    # existed. `den` is 0 for a run with no clicks, which the loop below skips — a reader who never
    # clicked did not fail to find the ending.
    ("runs that ended a step", lambda f: int(bool(f["any_click_sent"])), lambda f: int(f["clicks"] > 0)),
    ("preview-then-commit", lambda f: int(f["preview_then_commit"]), lambda f: 1),
    ("committed but not recorded", lambda f: f["did_not_record"], lambda f: f["committed_reloads"]),
    ("recorded but lost on reload", lambda f: f["did_not_persist"], lambda f: f["committed_reloads"]),
    # Denominator is what the probe MEASURED, not what was claimable. With `claimable` a round
    # taken before the probe existed contributes 0/claimable = 0.0 — a clean zero — and the round
    # after it contributes its real rate, so the pair reports the probe's arrival as a regression.
    # It did: `+0.118 ± 0.044`, the only counter in the r003→r004 read to clear 2 SE, and entirely
    # an artefact. `score.py` already guards this (it prints `n/a (not measured)`); the guard just
    # had not reached here. The `db == 0` skip below then drops the pair, which is the honest
    # answer — the comparison does not exist yet.
    ("cards overflowing at 380", lambda f: f["overflowing"], lambda f: f["overflow_measured"]),
    ("cards that painted", lambda f: f["painted"], lambda f: f["claimable"]),
    ("  …inline fences", lambda f: f["painted_fence"], lambda f: f["fences"]),
    ("  …canvases", lambda f: f["painted_canvas"], lambda f: f["canvases"]),
    ("cards that persist an answer", lambda f: f["persisting_cards"], lambda f: f["cards"]),
    ("list instead of a card", lambda f: f["markdown_instead"], lambda f: f["turns"]),
]


def clean(meta: dict) -> bool:
    """No turn errored and none came back empty, and the run was not cut short.

    A round is not only its prompt: r003 had 24 empty replies against r002's 13, and 11 of the 24
    were ONE model. An empty reply is a turn with no card, a shorter conversation, and a judge
    reading an exchange where the assistant said nothing — so it moves every number at once, in
    the direction that reads as a regression. Pooled, r002->r003 showed trigger -0.80 and overall
    -0.53, both past 2 SE; on the 122 pairs where neither side had one, nothing cleared 2 SE and
    the card rate was -0.004. The dirty pairs were the whole result.

    This is reported BESIDE the full read rather than replacing it: dropping runs is how a
    measurement flatters itself, and the two numbers together say which kind of round it was.
    """
    return meta["status"] == "complete" and not any(
        (turn.get("reason") or {}).get("kind") == "error" or not (turn.get("reply") or "") for turn in meta["turns"])


def load(root: pathlib.Path, upto: int | None = None) -> dict[tuple[str, str], dict]:
    out = {}
    for path in sorted(root.glob("*/*/meta.json")):
        meta = json.loads(path.read_text())
        if meta["status"] not in ("complete", "timeout") or not meta["turns"]: continue
        persisting, collisions, copied = persist_keys(path.parent)
        out[(meta["case"], meta["model"])] = facts(meta, upto) | {
            "persisting_cards": persisting, "key_collisions": collisions, "copied_example_key": copied,
            "clean": clean(meta)}
    verdicts = root / "verdicts.json"
    if verdicts.exists():
        for v in json.loads(verdicts.read_text()):
            key = (v["case"], v["model"])
            if key in out and v.get("status") == "ok": out[key]["panel"] = v["mean"]
    return out


def report(label: str, deltas: list[float]) -> None:
    if len(deltas) < 2: return print(f"  {label:30} {len(deltas)} pair(s) — too few to read")
    mean = statistics.fmean(deltas)
    se = statistics.stdev(deltas) / len(deltas) ** 0.5
    # `se == 0` means every pair moved by exactly the same amount — including "not at all", which
    # is the common case and which `abs(0) >= 2*0` was happily marking as a significant result.
    mark = "  ←" if se > 0 and abs(mean) >= 2 * se else ("  (identical)" if mean == 0 else "")
    print(f"  {label:30} {mean:+6.3f} ± {se:.3f} (n={len(deltas):3}){mark}{sign_test(deltas)}")


def sign_test(deltas: list[float]) -> str:
    """For a counter that is 0-or-1 per run, the exact paired test, printed beside the SE.

    The mean-and-SE above assumes a distribution the data does not have when every pair moved by
    -1, 0 or +1, and it is optimistic in exactly the direction that matters: `runs that ended a
    step` read **2.1 SE** on r005→r006, which reads as "cleared the bar", while the 20-up / 9-down
    split it came from is p = 0.061 — under the bar. Same numbers, and only one of them is a test
    of the hypothesis. Printed rather than substituted because the effect SIZE is still the SE
    line's; this only says how much of it to believe.
    """
    disc = [d for d in deltas if d]
    if not disc or any(abs(d) != 1 for d in disc): return ""
    up, n = sum(1 for d in disc if d > 0), len(disc)
    p = min(1.0, 2 * sum(math.comb(n, i) for i in range(min(up, n - up) + 1)) / 2 ** n)
    return f"   [符号检验 {up}↑/{n - up}↓ p={p:.3f}]"


def main() -> None:
    argv = [a for a in sys.argv[1:] if not a.startswith("--upto")]
    upto = next((int(a.split("=")[1]) for a in sys.argv[1:] if a.startswith("--upto=")), None)
    before, after = (load(pathlib.Path(p), upto) for p in argv[:2])
    pairs = sorted(set(before) & set(after))
    if upto:
        # Dropped, not truncated-to-what-they-have: a run that stopped at turn 5 is a five-turn run,
        # and reading it as a truncated eight-turn one is the same error as comparing a cut run to a
        # whole one. How many were dropped is printed because a truncation that throws away half the
        # round is not a cleaner read, it is a different and much smaller one.
        full = [p for p in pairs if not before[p]["short"] and not after[p]["short"]]
        print(f"truncated to the first {upto} turns; {len(pairs) - len(full)} of {len(pairs)} pairs "
              f"dropped for not reaching it")
        pairs = full
    print(f"{len(pairs)} paired runs ({len(before)} before, {len(after)} after)\n")
    if not pairs: return

    tidy = [p for p in pairs if before[p]["clean"] and after[p]["clean"]]
    # The panel is NOT truncatable. A verdict is one number for one whole conversation; the judges
    # read every turn and the deep turns are usually the ones they comment on. Printing it beside
    # counters that stop at turn N labels it with a range it was never scored over — the counters
    # would say "first 8 turns" and the panel would silently mean "all of them".
    if upto:
        print("panel: not shown — the verdicts scored whole conversations, not the first "
              f"{upto} turns. Read it from the untruncated run.\n")
    else:
        print("panel, paired (← marks a move of at least 2 standard errors):")
    for key in ([] if upto else KEYS):
        deltas = [after[p]["panel"][key] - before[p]["panel"][key] for p in pairs
                  if "panel" in before[p] and "panel" in after[p]]
        report(key, deltas)

    if not upto: print(f"\npanel again, over the {len(tidy)} pairs where NEITHER side errored, came back empty, or was cut short:")
    for key in ([] if upto else KEYS):
        deltas = [after[p]["panel"][key] - before[p]["panel"][key] for p in tidy
                  if "panel" in before[p] and "panel" in after[p]]
        report(key, deltas)

    print("\ncounters, paired (rate after − rate before, per run):")
    for label, num, den in COUNTERS:
        deltas = []
        for p in pairs:
            db, da = den(before[p]), den(after[p])
            if db == 0 or da == 0: continue   # a rate over nothing is not a zero
            deltas.append(num(after[p]) / da - num(before[p]) / db)
        report(label, deltas)

    print("\nboundary (the controls decide whether the rules improved or just widened):")
    for case in ("cat-names", "mortgage", "closure", "http418"):
        want = "card" if case in ("cat-names", "mortgage") else "prose"
        rows = [(p[1], before[p]["cards"] > 0, after[p]["cards"] > 0) for p in pairs if p[0] == case]
        if not rows: continue
        # NAMED, not counted. Pooled, `closure` reads "3 of 10 carded" — a rule that over-fires 30%
        # of the time. Per model it is two models carding on both negative controls in all three
        # rounds, 6 of 6 each, while the other eight are prose almost every time. Those are
        # different findings: no rewording fixes a model that builds a card for "什么是闭包？", and
        # the eight that get it right are evidence the rule is not the problem.
        flipped = [m for m, b, a in rows if b != a]
        after_set = [m for m, _, a in rows if a]
        print(f"  {case:11} wants {want:5} — before {sum(b for _, b, _ in rows)}/{len(rows)} carded, after {sum(a for _, _, a in rows)}/{len(rows)}")
        if after_set: print(f"              carded after: {', '.join(after_set)}")
        if flipped: print(f"              changed side: {', '.join(flipped)}")


if __name__ == "__main__":
    main()
