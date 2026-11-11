# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""What a round measured, without asking a model.

The judge panel's own spread is about 2.0 points (CLAUDE.md §6.6), so a two-point move in a mean
says nothing on its own. These counters do not have that problem: whether a click sent a message
is a fact, and so is whether a reload brought the card back answered. They are the half of the
result that can carry a small effect, and the panel's prose is the half that finds what to look at
next.

Every rate prints its denominator. Six times in this repo a rate has been reported over a
population that was not what it looked like — runs that never reached a model scored as the model
declining, canvases invisible to a fence count, a wave of 72 that was 26.

    uv run eval/score.py <round-dir> [<round-dir> ...]
"""
import json, pathlib, re, statistics, sys

# A reply that answered with a markdown table or list instead of a card. `fence=0` has two causes
# and only one is a model correctly judging that prose was enough — measured on a calorie-log turn,
# six runs across three models each answered with a 7-to-9-line table and none loaded the skill.
ROWS = re.compile(r"^\s*(?:[-*+]\s+|\d+[.)]\s+|\|)", re.M)
# Every `usePersistedState` key a run's cards declare. The skill's recipe now carries a literal
# example key, and a string literal inside a code block is the most copyable thing there is: two
# asks in one conversation sharing a key is a WORSE defect than the one persistence fixes, and it
# shows up in none of the counters — the second card silently opens already answered.
PERSIST_KEY = re.compile(r"usePersistedState\s*(?:<[^>]*>)?\s*\(\s*[\"'`]([^\"'`]+)")
# The literal key the skill's recipe carries. A string inside a code block is copied verbatim more
# often than anything else in it, so this is the one unambiguous way the edit can go wrong.
EXAMPLE_KEY = "ask:which-cloud-host"


def persist_keys(run: pathlib.Path) -> tuple[int, int, int]:
    """(cards that persist, keys shared by two DIFFERENT cards, cards copying the example key).

    Card identity is the filename WITHOUT its turn prefix: one canvas is re-snapshotted on every
    turn that edits it, and `turn-01.chuanxi-sept.tsx` … `turn-08.chuanxi-sept.tsx` are eight
    pictures of one card. Counting by file said 16 conversations reused a key; every hit read was
    that, or a diet log deliberately carrying one target across its own re-emissions. Sharing a key
    with yourself is what persistence IS.
    """
    seen: dict[str, set[str]] = {}
    persisting = copied = 0
    for card in sorted(run.glob("turn-*.tsx")):
        source = card.read_text(encoding="utf-8", errors="replace")
        keys = set(PERSIST_KEY.findall(source))
        if keys: persisting += 1
        if EXAMPLE_KEY in source: copied += 1
        identity = card.name.split(".", 1)[1]
        for key in keys: seen.setdefault(key, set()).add(identity)
    return persisting, sum(1 for holders in seen.values() if len(holders) > 1), copied




# Tags whose bounding box is not DOM overflow. Rounds already on disk were measured before
# `card-driver.mjs` learned to skip them, so the filter has to live here too — otherwise r005 and
# r006 would be counting different things and the one comparison this metric exists for is void.
SVG_TAGS = {"path", "svg", "g", "line", "circle", "rect", "polygon", "polyline", "text", "tspan", "ellipse", "use", "defs"}


def real_overflow(card: dict) -> bool:
    over = card.get("overflow")
    if not over: return False
    return not (isinstance(over, dict) and over.get("tag") in SVG_TAGS and over.get("tag") != "svg")


def facts(meta: dict, upto: int | None = None) -> dict:
    """`upto` truncates to the first N turns, for comparing rounds whose `floor` differs.

    Raising `floor` lengthens runs, and the turns it adds are exactly where a second clarification
    would live — so a counter that moves after a floor change could be the rule or could be the
    extra turns. Truncating both sides to the shorter floor removes that, at the price of not
    seeing the deep turns at all; the deep half is then read on its own, as description.

    `short` is the guard that makes it honest: a run that never reached N turns is NOT a truncated
    N-turn run, and averaging it in compares eight turns against five. Callers drop those pairs.
    """
    turns = meta["turns"][:upto]
    cards = [c for t in turns for c in t["cards"]]
    clicks = [c for t in turns for c in t["clicks"]]
    reloads = [t["reload"] for t in turns if t.get("reload")]
    text_only = [t for t in turns if not t["cards"]]
    return {
        "status": meta["status"], "turns": len(turns), "elapsed": meta.get("elapsed"),
        "short": upto is not None and len(meta["turns"]) < upto,
        # A run whose LAST turn came back empty on an upstream read timeout. `status` says
        # `complete` for these — the coroutine did return — so without this they average in as
        # ordinary zero-card runs, and a one-turn run that never got an answer weighs the same as a
        # twelve-turn one. Derived from the turn's own `reason` rather than `meta["cut"]` so the
        # rounds already on disk report it too.
        "cut": bool(turns and (turns[-1].get("reason") or {}).get("kind") == "error"),
        "cards": len(cards),
        "turns_with_card": sum(1 for t in turns if t["cards"]),
        "first_turn_card": bool(turns and turns[0]["cards"]),
        # The principle the old first-turn waves could not see: a NEW fork later in the
        # conversation deserves its own interface.
        "later_card": any(t["cards"] for t in turns[2:]),
        # Paint is measured over the blocks the RENDERER WOULD CLAIM. A `mistagged` block never
        # reaches it, so scoring one as an unpainted card blames the card for a fence-tag miss —
        # and scoring one as painted is worse. Reading all 13 in r001+r002 found something else
        # again: 11 belong to ONE model (`minimax-m3`, two runs) writing JSX FRAGMENTS interleaved
        # with its own prose ("Actually the cleaner approach is…"), which is reasoning debris, not
        # a card with the wrong tag. Three of those fragments compiled and scored `painted`.
        "claimable": sum(1 for c in cards if c["kind"] != "mistagged"),
        "painted": sum(1 for c in cards if c["painted"] and c["kind"] != "mistagged"),
        "painted_fence": sum(1 for c in cards if c["painted"] and c["kind"] == "fence"),
        "fences": sum(1 for c in cards if c["kind"] == "fence"),
        # Split out because the r001->r002 paint drop is almost entirely HERE: fences held at
        # 98%->97% while canvases went 100%->86%. Pooled as one rate the two cancel into a vague
        # -5.8pp that points at nothing.
        "painted_canvas": sum(1 for c in cards if c["painted"] and c["kind"] == "canvas"),
        # Content past the card's right edge, at the narrowest width. Counted rather than left to
        # the panel because the SHOT cannot show it — the clip ends at the card, so the overflowing
        # part is absent and absence reads as a design choice.
        # `measured` separately from `overflowing`: a round taken before this probe existed has no
        # `overflow` key at all, and reporting that as 0% is the shape §6.4 names — "no failures"
        # and "nothing was examined" printing the same number.
        "overflow_measured": sum(1 for c in cards if "overflow" in c),
        "overflowing": sum(1 for c in cards if real_overflow(c)),
        "overflow_worst": max((c["overflow"]["px"] for c in cards if real_overflow(c)), default=0),
        "mistagged": sum(1 for c in cards if c["kind"] == "mistagged"),
        "canvases": sum(1 for c in cards if c["kind"] == "canvas"),
        "skill": sum(1 for t in turns if t.get("skill")),
        "controls": [c["controls"] for c in cards],
        "clicks": len(clicks),
        # A click that fires the conversation immediately. Correct for a plain two-way choice,
        # wrong when the options needed explaining first — so this is a rate to read beside the
        # panel's `interaction` score, not a defect count on its own.
        "clicks_that_sent": sum(1 for c in clicks if c["sent"]),
        # **The population rule 2's own evidence uses, and the one to read it by.** The rule says
        # "108 of 161 RUNS never once got a result back out of the card"; `clicks_that_sent` pools
        # over clicks instead, where a run that fiddles thirty times and submits once scores 3%.
        # Most clicks are exploratory BY DESIGN — read the `why` fields and they are "复位视角",
        # "打开导航", "看看夜间模式" — so the pooled rate penalises exactly the preview-then-commit
        # shape the skill asks for. Measured r005→r006 the two disagree completely: pooled says
        # 13.1%→13.0% (0.0 SE, "flat"), per-run says 32.7%→42.5%. Neither is wrong about its own
        # population; only one of them is about the rule.
        #
        # `None` when the reader never clicked at all, so a run with no clicks is EXCLUDED rather
        # than counted as a failure to end the step — there was no step to end.
        "any_click_sent": None if not clicks else any(c["sent"] for c in clicks),
        # The shape the principles ask for: something was previewed, and a later control committed.
        "preview_then_commit": any(c["sent"] for c in clicks) and any(not c["sent"] and c["ok"] for c in clicks),
        "dead_clicks": sum(1 for c in clicks if not c["ok"]),
        "reloads": len(reloads),
        # Two halves of one rule, measured apart. The skill asks a card that is acted on to
        # "send the result AND record what was chosen", and a single boolean over two snapshots
        # scored the two failures identically: a card that came back remembering its answer and
        # one that never showed an answer at all both leave the text unchanged by a reload.
        #
        # Only a turn that actually COMMITTED can fail either half. An earlier version counted
        # every reload whose text moved and read 43.6%; every hit examined was a person expanding
        # a preview, and the reload correctly resetting transient state — the order-of-magnitude
        # over-report CLAUDE.md §6.1 says a first-pass detector always makes.
        "committed_reloads": sum(1 for t in turns if t.get("reload") and any(c["sent"] for c in t["clicks"])),
        "did_not_record": sum(1 for t in turns
                              if t.get("reload") and any(c["sent"] for c in t["clicks"]) and not t["reload"].get("recorded", True)),
        "did_not_persist": sum(1 for t in turns
                               if t.get("reload") and any(c["sent"] for c in t["clicks"])
                               and t["reload"].get("recorded", False) and not t["reload"].get("persisted", False)),
        # Not a defect, kept apart so the numbers above cannot quietly absorb it: a card that
        # resets its open tab or its expanded row on reload is behaving correctly.
        "reload_reset_preview": sum(1 for t in turns
                                    if t.get("reload") and not any(c["sent"] for c in t["clicks"]) and not t["reload"]["text_same"]),
        "reload_resent": sum(1 for r in reloads if r["resent"]),
        "markdown_instead": sum(1 for t in text_only if len(ROWS.findall(t["reply"])) >= 4),
        # A turn that ended `completed` with no text at all. Measured on glm-5.3-flash: 1172
        # reasoning chunks, one 429 retry, and not one content block — the model thought itself
        # out. Counted separately because it is not the model declining to build UI, and pooling
        # it into the card rate makes a flaky upstream look like a prompt that stopped working.
        "empty_replies": sum(1 for t in turns if not t["reply"].strip()),
        "turn_errors": sum(1 for t in turns if (t.get("reason") or {}).get("kind") == "error"),
    }


def summarise(rows: list[dict], label: str) -> None:
    if not rows: return print(f"{label}: no runs"); 
    n = len(rows)
    turns = sum(r["turns"] for r in rows)
    cards = sum(r["cards"] for r in rows)
    clicks = sum(r["clicks"] for r in rows)
    reloads = sum(r["reloads"] for r in rows)
    controls = [c for r in rows for c in r["controls"]]
    pct = lambda k, d: "  n/a" if d == 0 else f"{100 * k / d:5.1f}%"
    print(f"\n{label}  ({n} runs, {turns} turns, {cards} cards)")
    print(f"  turns that produced a card      {pct(sum(r['turns_with_card'] for r in rows), turns)}  of {turns} turns")
    print(f"  runs whose FIRST turn did       {pct(sum(r['first_turn_card'] for r in rows), n)}  of {n} runs")
    print(f"  runs with a card at turn 3+     {pct(sum(r['later_card'] for r in rows), n)}  of {n} runs")
    claimable = sum(r["claimable"] for r in rows)
    fences, canvases = sum(r["fences"] for r in rows), sum(r["canvases"] for r in rows)
    print(f"  cards that actually painted     {pct(sum(r['painted'] for r in rows), claimable)}  of {claimable} claimable cards")
    print(f"    …inline fences                {pct(sum(r['painted_fence'] for r in rows), fences)}  of {fences}")
    print(f"    …canvases                     {pct(sum(r['painted_canvas'] for r in rows), canvases)}  of {canvases}")
    measured = sum(r["overflow_measured"] for r in rows)
    if measured == 0:
        print(f"  cards overflowing at 380px        n/a  (not measured — this round predates the probe)")
    else:
        print(f"  cards overflowing at 380px      {pct(sum(r['overflowing'] for r in rows), measured)}  of {measured} measured, worst {max((r['overflow_worst'] for r in rows), default=0)}px past the edge")
    print(f"  blocks the renderer never sees  {sum(r['mistagged'] for r in rows):5}  (```tsx not ```ui4a/tsx — read them, most are not cards)")
    print(f"  clicks that fired the turn      {pct(sum(r['clicks_that_sent'] for r in rows), clicks)}  of {clicks} clicks")
    print(f"  clicks that did nothing at all  {pct(sum(r['dead_clicks'] for r in rows), clicks)}")
    print(f"  runs showing preview-then-commit{pct(sum(r['preview_then_commit'] for r in rows), n)}")
    committed = sum(r["committed_reloads"] for r in rows)
    print(f"  committed but never recorded    {pct(sum(r['did_not_record'] for r in rows), committed)}  of {committed} commits (the card still looks untouched)")
    print(f"  recorded but lost on reload     {pct(sum(r['did_not_persist'] for r in rows), committed)}  of the same {committed}")
    print(f"  reloads that reset a preview    {pct(sum(r['reload_reset_preview'] for r in rows), reloads - committed)}  (not a defect — transient state should reset)")
    print(f"  reloads that re-fired the turn  {pct(sum(r['reload_resent'] for r in rows), reloads)}  of {reloads} reloads")
    print(f"  text-only turns that were a list{pct(sum(r['markdown_instead'] for r in rows), turns)}")
    print(f"  turns that came back EMPTY      {pct(sum(r['empty_replies'] for r in rows), turns)}")
    print(f"  turns that ended in an error    {pct(sum(r['turn_errors'] for r in rows), turns)}")
    if controls: print(f"  controls per card               median {statistics.median(controls):.0f}, max {max(controls)}")
    print(f"  cards that persist their answer {pct(sum(r['persisting_cards'] for r in rows), cards)}")
    # Not a rate over cards: one collision inside one conversation is already a defect, and the
    # count is the number of conversations where a key was reused across two different cards.
    print(f"  one key across two DIFFERENT cards {sum(r['key_collisions'] for r in rows)}  (above 0 is a defect)")
    print(f"  cards copying the example key   {sum(r['copied_example_key'] for r in rows)}  (above 0 means the recipe's literal leaked)")
    print(f"  runs cut short by the timeout   {pct(sum(1 for r in rows if r['status'] == 'timeout'), n)}")
    print(f"  runs the model timed out under  {pct(sum(1 for r in rows if r['cut']), n)}  (last turn came back empty — these are NOT prose judgements)")


def main() -> None:
    for root in sys.argv[1:]:
        root = pathlib.Path(root)
        rows = []
        for meta_path in sorted(root.glob("*/*/meta.json")):
            meta = json.loads(meta_path.read_text())
            if meta["status"] not in ("complete", "timeout"): continue
            persisting, collisions, copied = persist_keys(meta_path.parent)
            row = facts(meta) | {"persisting_cards": persisting, "key_collisions": collisions, "copied_example_key": copied,
                                 "case": meta["case"], "model": meta["model"],
                                 "kind": "single" if meta["case"] in ("cat-names", "mortgage", "closure", "http418") else "multi"}
            rows.append(row)
        print(f"══ {root.name} ══")
        summarise([r for r in rows if r["kind"] == "multi"], "multi-turn")
        # The controls are the only thing separating "the rules improved" from "the rules now fire
        # on everything", so they are printed apart and never pooled into the headline.
        for case in ("cat-names", "mortgage"):
            hits = [r for r in rows if r["case"] == case]
            if hits: print(f"\n  positive control {case:11} produced a card in {sum(r['cards'] > 0 for r in hits)}/{len(hits)} runs (wanted: all)")
        for case in ("closure", "http418"):
            hits = [r for r in rows if r["case"] == case]
            if hits: print(f"  negative control {case:11} produced a card in {sum(r['cards'] > 0 for r in hits)}/{len(hits)} runs (wanted: none)")

        verdicts = root / "verdicts.json"
        if verdicts.exists():
            scored = [v for v in json.loads(verdicts.read_text()) if v.get("status") == "ok"]
            if scored:
                keys = ["trigger", "clarify", "interaction", "hierarchy", "craft", "overall"]
                print(f"\n  panel ({len(scored)} runs scored): " + "  ".join(f"{k}={sum(v['mean'][k] for v in scored) / len(scored):.2f}" for k in keys))


if __name__ == "__main__":
    main()
