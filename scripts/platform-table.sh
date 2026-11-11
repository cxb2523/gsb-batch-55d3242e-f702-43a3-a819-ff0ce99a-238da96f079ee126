#!/usr/bin/env bash
# Diffs the shell's real module table against PLATFORM_MODULES in scripts/platform.ts.
#
# §2.1 says the table changes and must be re-checked on every dsh upgrade, but not how:
# listed = resolved at runtime to the host's singleton, not listed = bundled into our output,
# listed but absent from the host = the require() fails and the whole client dies. The table is
# compiled into the shell's own frontend bundle, so the only way to read it is to serve the app
# and fetch that bundle.
set -u
port=${1:-47399}
log=/tmp/platform-table.log
html=/tmp/shell.html
js=/tmp/shell.js
DSH_HOME=${DSH_HOME:-$HOME/.dsh} dsh web --port "$port" --no-open >"$log" 2>&1 &
pid=$!
trap 'kill "$pid" 2>/dev/null' EXIT

# The URL carries a token (dsh 0.2.1-rc.3): a bare GET / answers 404, and the token-bearing URL
# answers 303 to a cookie the shell then needs — so follow it with a jar rather than curl -f.
url=""
for _ in $(seq 1 60); do url=$(grep -o "http://127\.0\.0\.1:$port/?token=[A-Za-z0-9_-]*" "$log" | head -1); [ -n "$url" ] && break; sleep 0.5; done
[ -n "$url" ] || { echo "PROBE BROKEN — no tokened URL in $log after 30s"; exit 2; }
curl -sfL -c /tmp/platform-cj -b /tmp/platform-cj "$url" -o "$html" || { echo "PROBE BROKEN — could not fetch $url"; exit 2; }

asset=$(grep -o 'assets/index-[A-Za-z0-9_-]*\.js' "$html" | head -1)
curl -s "http://127.0.0.1:$port/${asset:-nonexistent}" -o "$js"

host=$(grep -o 'return{react:[^}]*}' "$js" | head -1 | grep -o '"[^"]*"\|[,{][a-z][a-zA-Z-]*:' | tr -d '",:{' | sort -u | grep -v '^$')
ours=$(grep -o 'PLATFORM_MODULES = \[[^]]*\]' scripts/platform.ts | grep -o '"[^"]*"' | tr -d '"' | sort -u)

# A checker that passes when it is itself broken is worse than none: today an `rg` that was
# not on PATH made both sides empty and the diff reported a match.
count=$(echo "$host" | grep -c . )
[ "$count" -ge 5 ] || { echo "PROBE BROKEN — read $count entries from the shell bundle, expected at least 5"; exit 2; }
diff <(echo "$host") <(echo "$ours") >/dev/null && { echo "platform table matches ($(echo "$host" | wc -l | tr -d ' ') entries)"; exit 0; }
echo "MISMATCH — host vs scripts/platform.ts:"; diff <(echo "$host") <(echo "$ours")
exit 1
