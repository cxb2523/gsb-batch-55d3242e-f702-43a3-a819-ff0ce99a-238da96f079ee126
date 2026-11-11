#!/usr/bin/env python3
"""Print every screen rate quoted in CLAUDE.md that no longer matches the corpus.

`audit-record.py` does this for the N/M prompt scores. This does it for the `N of 378` screen
rates, which are the other kind of number the record quotes as measured fact.

A rate in prose cannot be re-derived, so a widened screen silently invalidates every sentence
citing its old value — `every screen reports 0-3 of 378` was true when written and false the
same day. The policy is to cite `corpus-rates.ts` by name rather than transcribe it; this
catches the sentences that transcribe it anyway.

Usage: scripts/audit-rates.py < a `bun scripts/corpus-rates.ts` run >
       bun scripts/corpus-rates.ts | python3 scripts/audit-rates.py
"""
import glob, re, sys, io

actual = {}
for line in sys.stdin:
    m = re.match(r"([A-Z][A-Z-]+)\s+(\d+) of (\d+)", line)
    if m: actual[m.group(1)] = (int(m.group(2)), int(m.group(3)))
# The corpus lives outside the repo (378 cards extracted from `~/.dsh/sessions`), so this cannot
# be an unconditional check step — on a machine without it, `corpus-rates.ts` prints nothing and
# there is nothing to compare. Skipping is the honest answer; failing would train people to
# ignore it.
if not actual:
    print("no corpus rates on stdin — skipping (extract the corpus to check quoted rates)")
    sys.exit(0)

# The design doc is CLAUDE.md plus the docs/ files that hold its evidence — a split in two cannot
# mean a rate stops being checked. `measurements-log.md` and `examples.md` are deliberately left
# out: they are raw provenance and card samples, where the same number may legitimately appear at
# several times in its life, and flagging those would be the over-reporting that gets a checker
# ignored.
DESIGN_DOC = ["CLAUDE.md", *sorted(p for p in glob.glob("docs/*.md") if not p.endswith(("measurements-log.md", "examples.md")))]
text = "".join(io.open(p, encoding="utf-8").read() for p in DESIGN_DOC)
stale = 0
for name, (count, total) in sorted(actual.items()):
    # The screen name and a rate on the same line. A rate further away belongs to something else.
    #
    # Not every `N of 378` near a screen name IS that screen's rate: one line reads "SHADOWED-
    # EXPORT knew only `export default function X`. 377 of 378 corpus cards write that", which
    # counts a SYNTAX FORM, not hits. A sentence about what cards write is not a rate claim, and
    # flagging it every run is how a checker gets ignored.
    for m in re.finditer(rf"^.*`?{name}`?[^\n]{{0,80}}?(\d+) of {total}.*$", text, re.M):
        if re.search(r"cards (write|use|do|spell)|corpus cards write", m.group(0)): continue
        if int(m.group(1)) != count:
            stale += 1
            print(f"{name}: record says {m.group(1)}, corpus says {count}\n    {m.group(0).strip()[:110]}")

# The fresh-card total moves every time a batch lands, and it appears in prose in several places
# ("Sixty-seven cards is not a rate", "in 60 of the 67 written"). Revised by hand six times on
# 2026-08-24 and briefly wrong twice. `fresh-rates.ts` knows the real number; this checks the ones
# written down against it.
# `bun run audit` writes this first; it is a file rather than a second stdin because the corpus
# rates already own stdin. Absent on a machine with no generated cards, and skipped there.
#
# Only the DENOMINATOR is checked. "43 of 67" passes with the right total and a wrong count,
# because nothing here knows what 43 was counting — it came from an ad-hoc script that no longer
# exists. That is the honest boundary: a total moves every time a batch lands and is worth
# automating, while a one-off count has to be re-derived by whoever doubts it. Caught a real stale
# figure on its first run ("43 of 60" after the set reached 67).
import os
fresh_total = None
if os.path.exists("/tmp/fresh-total.txt"):
    for line in io.open("/tmp/fresh-total.txt", encoding="utf-8"):
        m = re.match(r"(\d+) of (\d+) clean", line)
        if m: fresh_total = int(m.group(2))
if fresh_total is not None:
    for m in re.finditer(r"^.*?(\d+) of (\d+) (?:written|fresh cards|generated).*$", text, re.M):
        if int(m.group(2)) != fresh_total:
            stale += 1
            print(f"fresh set: record says {m.group(2)}, the set holds {fresh_total}\n    {m.group(0).strip()[:110]}")

print(f"\n{stale} stale rate(s)" if stale else f"\nevery quoted rate matches the corpus ({len(actual)} screens)")
sys.exit(1 if stale else 0)
