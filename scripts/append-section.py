#!/usr/bin/env python3
"""Append a dated section to `docs/measurements-log.md`, in date order.

The dated record lives there, not in CLAUDE.md — the design doc is `CLAUDE.md` plus the `docs/`
files that hold its evidence, and it keeps each lesson once rather than one section per session
(`test/record-structure.test.ts` polices that).

Written after making the same mistake twice in one session: inserting a section by anchoring on a
neighbouring heading, which puts a 2026-08-24 entry above 2026-08-23 ones and fails
`test/record-structure.test.ts`. The record is oldest-first; a new section goes after the last
section whose date is <= its own.

    python3 scripts/append-section.py 2026-08-24 "Title of the section" < body.md
"""
import re, sys

date, title = sys.argv[1], sys.argv[2]
body = sys.stdin.read().rstrip()
path = "docs/measurements-log.md"
text = open(path).read()

headings = [(m.start(), m.group(1)) for m in re.finditer(r"^### .*\((\d{4}-\d{2}-\d{2})\)$", text, re.M)]
if not headings:
    sys.exit("no dated sections found")
# The last section whose date is <= ours; the new one goes after its body.
after = None
for start, when in headings:
    if when <= date:
        after = start
if after is None:
    insert = headings[0][0]
else:
    nxt = text.find("\n### ", after + 5)
    insert = len(text) if nxt == -1 else nxt + 1

section = f"### {title} ({date})\n\n{body}\n\n"
open(path, "w").write(text[:insert] + section + text[insert:])
print(f"inserted at offset {insert}")
