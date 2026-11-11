# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Score one wave, and — the point of it — say what the model did INSTEAD of a card.

`skill=no fence=0` is where every earlier eval in this project stopped, and it is the least
informative half of the result. Measured on wave 0: six runs across three models all answered a
calorie-log turn with a 7-line markdown table of per-item numbers and a total, and not one loaded
the skill. That is not a model failing to build UI; it is a model building UI in markdown. The
`md` column is what makes that visible, so a wave can distinguish "prose was right" from "a card
was written in the wrong language".
"""
import collections, json, os, pathlib, re, sys

# The wave directory is state, not source; it lives outside the repo and can be pointed elsewhere.
# Defaults under `~/.cache`, not `/tmp`: macOS reaps /tmp and took every wave from w001 to
# w019 with it — cards, screenshots and verdicts, all of it paid for in real model calls.
from wave_root import ROOT
W = int(sys.argv[1])
d = ROOT / "waves" / f"w{W:03d}"
# The wave's OWN snapshot, not the live file: see run-wave.py.
snap = d / "wave.json"
wave = json.loads(snap.read_text()) if snap.exists() else json.loads((ROOT / "waves.json").read_text())[W]

ROW = re.compile(r"^\s*(?:[-*+]\s|\d+[.)]\s|\|)")
# A run of PARALLEL ITEMS, each with its own explanation, is a card written in markdown — the
# shape is the tell, not the row count. `md >= 6` was the old threshold and it missed two thirds
# of them: measured on wave 7, six replies had this shape and only two reached six rows. Three
# books with a paragraph each, or one date span broken into years / weeks / hours, is four rows
# and unmistakably a list. Both spellings count: bulleted `- **Label:** …`, and bare `**Label**`
# followed by its own prose.
LABELLED_ROW = re.compile(r"^\s*(?:[-*\u2022]|\d+[.)])\s+\*\*", re.M)
LABELLED_RUN = re.compile(r"\*\*[^*]{2,40}\*\*[^\n]{20,}")
def is_list_shape(text: str) -> bool:
    return len(LABELLED_ROW.findall(text)) >= 3 or len(LABELLED_RUN.findall(text)) >= 3
rows = []
skipped = []
for f in sorted(d.glob("*.txt")):
    head = f.read_text().splitlines()[0] if f.read_text().strip() else ""
    # A run that never reached the model has no verdict in it, and every field below reads as a
    # confident zero: `skill=no card=no md=0`. Measured on wave 2 — 46 of its 72 files said
    # `stale  src/ is newer than lib/`, and all 46 were scored as the model declining to build a
    # card. The rates were computed against a denominator two thirds of which was the harness.
    # `skill=` is eval.sh's one success shape (run-wave.py caches on the same test).
    if not head.startswith("skill="):
        skipped.append(f"{f.stem} ({head.split()[0] if head else 'empty'})"); continue
    m = dict(re.findall(r"(\w+)=(\S+)", head))
    reply = m.get("reply", "")
    text = pathlib.Path(reply).read_text() if reply and pathlib.Path(reply).exists() else ""
    idx, model, samp = f.stem.split("-", 1)[0], f.stem.split("-", 1)[1].rsplit("-s", 1)[0], f.stem[-1]
    rows.append({
        "i": int(idx), "model": model, "s": samp,
        "skill": m.get("skill") == "yes",
        "card": (m.get("fence", "0") != "0") or (m.get("canvas", "0") != "0"),
        "md": sum(1 for line in text.splitlines() if ROW.match(line)),
        "listish": is_list_shape(text),
        "bytes": int(m.get("bytes", 0) or 0),
        # A hand-built wave (a targeted pool written straight into `wave.json`) carries the raw
        # corpus fields and no `fam`. Grouping by family is a nicety; crashing the whole score on
        # a missing label is not — this wave took 80 minutes to run.
        "fam": (wave[int(idx)].get("fam") or wave[int(idx)].get("cat") or "?") if int(idx) < len(wave) else "?",
    })

n = len(rows)
# Print what was excluded, by name. Every gate in this project that ever lied did it by omission,
# and a count can only be believed, where a list can be checked at a glance.
if skipped:
    print(f"EXCLUDED {len(skipped)} of {len(skipped)+n} runs (no verdict — the harness, not the model):")
    for x in skipped: print(f"    {x}")
if not n: print("no runs yet"); sys.exit()
card = sum(r["card"] for r in rows); skill = sum(r["skill"] for r in rows)
# A reply with six or more list/table rows is a card the model wrote in markdown. Six is where
# the skill's own long-list rule draws the line, so the two numbers are about the same thing.
# Split by whether the run loaded the skill. The rule that decides list-shape-means-card lives
# IN the skill, so a run that never read it is evidence about the trigger layer, not about the
# rule — exactly the distinction the `skill=` field was added for. Measured on wave 7: 9 replies
# had the shape, and 3 of them came from runs that never loaded the skill. Reporting one number
# overstates the rule's failure rate by half.
mdcard = sum(1 for r in rows if not r["card"] and r["listish"] and r["skill"])
mdcard_noskill = sum(1 for r in rows if not r["card"] and r["listish"] and not r["skill"])
withskill = sum(1 for r in rows if r["skill"])
print(f"wave {W}: {n} runs  skill {skill} ({skill/n:.0%})  cards {card} ({card/n:.0%})  "
      # A wave where NOTHING loaded the skill is not a divide-by-zero, it is the most important
      # result the scorer can print — every rule that lives in the skill was unreachable, and the
      # trigger layer is what needs looking at. Crashing there hides exactly that.
      f"list-shape-instead {mdcard} of {withskill} that loaded the skill"
      + (f" ({mdcard / withskill:.0%})" if withskill else " (no run loaded it — the rules were unreachable)")
      + (f"  [+{mdcard_noskill} more from runs that never loaded it]" if mdcard_noskill else ""))
for key in ("model", "fam"):
    agg = collections.defaultdict(lambda: [0, 0, 0, 0])
    for r in rows:
        a = agg[r[key]]; a[0] += 1; a[1] += r["skill"]; a[2] += r["card"]; a[3] += (not r["card"] and r["listish"])
    print(f"  by {key}:")
    for k, (t, s, c, mc) in sorted(agg.items(), key=lambda kv: -kv[1][2]):
        print(f"    {k:<26} n={t:<3} skill={s:<3} card={c:<3} md-instead={mc}")
# A 100% card rate is not automatically good news: a trigger rule can widen into "build one
# whenever a number appears". Turns short enough to be a clarification ("intendo di soldi", four
# words) are where over-firing shows first, so they are printed whenever they DID produce a card.
short = sorted({r["i"] for r in rows if r["card"] and len(wave[r["i"]]["q"].replace("用户：", "").strip()) < 25})
if short:
    print("  very short turns that still produced a card — check these are not over-firing:")
    for i in short: print(f"    [{wave[i].get('fam') or wave[i].get('cat') or '?'}] {wave[i]['q'].replace('用户：','')[:70]}")
missed = sorted({r["i"] for r in rows if not r["card"] and r["listish"]})
if missed:
    print("  turns answered as a markdown table by at least one run:")
    for i in missed: print(f"    [{wave[i].get('fam') or wave[i].get('cat') or '?'}] {wave[i]['q'].replace('用户：','')[:78]}")
