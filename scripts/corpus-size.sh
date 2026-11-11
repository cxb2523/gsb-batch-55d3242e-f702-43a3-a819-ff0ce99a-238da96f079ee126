#!/bin/zsh
# The corpus's current size, for anyone about to write "N of M" into CLAUDE.md.
#
# Twice today a measurement was recorded against a corpus that had since grown — "183 sessions"
# was true when written and wrong an hour later, and a search bounded to those 183 reported an
# absence that a full scan contradicted. The numbers below are the denominators every corpus
# claim in CLAUDE.md should be using; re-run this before quoting one.
set -e
root="${DSH_HOME:-$HOME/.dsh}/sessions"
[[ -d "$root" ]] || { echo "no session corpus at $root"; exit 2 }
sessions=$(find "$root" -name session.jsonl.zstd | wc -l | tr -d ' ')
echo "sessions: $sessions"
echo "(unique cards and fence counts change with the parser — derive those from a script that imports segments.ts,"
echo " never from a grep, because a fence's language and its closer are both things the parser decides)"
