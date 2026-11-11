#!/bin/zsh
# Does a prompt that SHOULD produce a card produce one?
#
# The nine trigger rules are the only ones with nothing behind them — a screen asks whether a card
# is wrong, and these ask whether there should have been a card at all. The only way to answer is
# to run the prompt and count fences.
#
# Not part of `bun run check`: each case is a real model turn, minutes each.
#
# ONE RUN PER CASE DOES NOT MEASURE A RULE. `98 华氏度是多少摄氏度` — quoted verbatim in its own
# rule — came back as prose once and as a card on the next four runs. The trigger decision is a
# model judgement, so it has a RATE, not a verdict, and a single miss is evidence of nothing.
# Pass a repeat count to get one:
#
#     zsh scripts/triggers.sh            # every case once — a smoke test, not a measurement
#     zsh scripts/triggers.sh 换算       # only cases whose rule or prompt matches
#     zsh scripts/triggers.sh "" 5       # every case five times, reporting each rate
set -u
d=${0:a:h}
filter=${1:-}
repeat=${2:-1}
hits=0; misses=0; failed=0
while IFS='|' read -r rule prompt seed; do
  [[ -z "$rule" || "$rule" == \#* ]] && continue
  [[ -n "$filter" && "$rule$prompt" != *"$filter"* ]] && continue
  cards=0; runs=0
  for _ in {1..$repeat}; do
    out=$(bash "$d/eval.sh" "$prompt" ${seed:+"$d/../$seed"} 2>&1) || { failed=$((failed+1)); continue }
    # A canvas counts: the rules ask for an interface, not for a fence specifically.
    fence=$(print -r -- "$out" | grep -o 'fence=[0-9]*' | cut -d= -f2)
    canvas=$(print -r -- "$out" | grep -o 'canvas=[0-9]*' | cut -d= -f2)
    (( fence + canvas > 0 )) && cards=$((cards+1))
    runs=$((runs+1))
    last=$out
  done
  (( runs == 0 )) && { printf '%-34s %s\n' "CRASH" "$prompt"; continue }
  out=$last
  fence=$cards; canvas=0
  if (( cards == runs )); then printf 'card    %-30s %s\n' "${rule:0:30}" "$prompt"; hits=$((hits+1))
  elif (( cards > 0 )); then printf 'card %d/%d %-30s %s\n' "$cards" "$runs" "${rule:0:30}" "$prompt"; hits=$((hits+1))
  else
    # A miss is the only outcome worth reading, so keep the path — the reply is the evidence for
    # whether the rule is wrong or the prompt merely did not need a card.
    reply=$(print -r -- "$out" | grep -oE 'reply=[^ ]+' | cut -d= -f2 | head -1)
    printf 'PROSE   %-30s %s\n         reply: %s\n' "${rule:0:30}" "$prompt" "$reply"
    misses=$((misses+1))
  fi
done < "$d/trigger-cases.txt"
echo
echo "$hits card(s), $misses prose, $failed crashed"
(( misses > 0 )) && exit 1
exit 0
