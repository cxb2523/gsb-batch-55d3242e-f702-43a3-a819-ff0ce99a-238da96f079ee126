#!/usr/bin/env bash
# Reports which packages a finished eval run reached for. Takes eval.sh's output line on stdin (or
# as $1) plus package names to look for, and reads both the reply and any canvas the run wrote.
#
# Exists because the same two-line loop was retyped six times in one afternoon and broke twice on
# the same thing: `$d/.dsh/ui4a/canvases/*.tsx` is an unmatched glob when the run answered inline,
# and under `set -e` — or zsh, where an unmatched glob is a hard error — that ends the whole report
# rather than the one file. `nullglob` is the fix, and it belongs in a script rather than in every
# ad-hoc loop that needs it.
shopt -s nullglob
line=${1:-$(cat)}; shift 2>/dev/null || true
d=$(printf '%s' "$line" | grep -oE '/var/folders[^ ]*' | head -1)
r=$(printf '%s' "$line" | grep -oE 'reply=[^ ]*' | cut -d= -f2)
for f in "$r" "$d"/.dsh/ui4a/canvases/*.tsx; do
  [ -f "$f" ] || continue
  out=""
  for p in "$@"; do out="$out $p=$(grep -c -- "$p" "$f")"; done
  echo "$(basename "$f")$out"
done
