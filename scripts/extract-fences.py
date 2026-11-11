#!/usr/bin/env python3
"""Writes every ui4a fence in a reply out as a .tsx file.

The same six lines had been retyped in eval drivers four times, each with its own idea of how many
backticks a fence has — generated TSX contains triple-backtick strings, so the contract asks for
four and the pattern has to allow more.

Usage: extract-fences.py <reply-file> <out-dir> [prefix]
"""
import pathlib
import re
import sys

reply, out_dir = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
prefix = sys.argv[3] if len(sys.argv) > 3 else "fence"
out_dir.mkdir(parents=True, exist_ok=True)

written = 0
# The closing fence must be the SAME length as the opening one. `` `{3,} `` on both ends stops at
# the first triple-backtick *inside* the card — generated TSX puts them in template strings, which
# is exactly why the contract asks for four — and the file comes out one line long.
FENCE = re.compile(r"^(?P<ticks>`{3,})ui4a/tsx\n(?P<code>.*?)\n(?P=ticks)\s*$", re.S | re.M)

for index, match in enumerate(FENCE.finditer(reply.read_text(encoding="utf-8"))):
    (out_dir / f"{prefix}{index}.ui4a.tsx").write_text(match.group("code"), encoding="utf-8")
    written += 1
print(written)
