# Pre-registered reads

Written _before_ the round's data exists. A round changes several rules at once, and after the
numbers land there is always a story that fits them — this file is what stops that story from being
written backwards. Each entry names the metric, the direction, and what would count as the change
having failed.

The threshold everywhere is the one `delta.py` prints: **2 standard errors on the paired delta**.
Nothing below that is a result, in either direction.

---

## r005 (against r004)

Frozen at `rounds/r005/plugin`, verified to contain all three rules before the first run.
`UI4A_TURN_DEADLINE=600` pinned to r004's, so the harness is not a second variable.

### What changed

| #   | Change                                                                                             | Where                  | Evidence it was written from                                                                                                                                                         |
| --- | -------------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Ask every turn whether the answer wants an interface, not once at turn 0                           | `prompt.ts` (resident) | 93 of 101 loaders decided at turn 0, 7 at turn 1, 1 at turn 2, **0 later**; 20 of 20 never-loaders produced 0 cards across 179 turns                                                 |
| 2   | Three shapes that hang off the column edge — `<svg width>`, an unwrapped `<pre>`, a `min-w-` table | `skill.ts`             | 12 of 60 sampled cards overflowed at 380px, worst 705px                                                                                                                              |
| 3   | A title or control above a long list is `sticky`                                                   | `skill.ts`             | **356 of 766 cards have a heading or control above a list; 3 pin it (0.8%)** — every case, every model. The rule IS in r005's frozen plugin; only this count was measured afterwards |

Not testable here: the `external` retry fix. The eval mounts each card once and never retries, so the
failure it repairs (a second React on attempt ≥ 1 → `Minified React error #31`) cannot occur in this
harness. Its evidence is a real session, not this round. **Do not credit r005 with it.**

### The reads, in order

1. **Skill-load rate per run** — rule 1 is the only change that could move it. Success is the share
   of runs that ever load the skill going up; the sharper read is whether ANY run loads it after
   turn 2, which happened 0 times in 101 runs before. One such run is qualitative proof the rule
   landed; none means it did not, whatever the panel says.
2. **Card rate per turn, paired.** Rate, never the total: r005 runs may be shorter or longer, and a
   total silently mixes "fewer cards" with "fewer turns".
3. **`cards overflowing at 380`** — rule 2. This is the first round where BOTH sides have the probe,
   so it is the first time this counter can be read at all.
4. **Panel `hierarchy` and `craft`** — where rules 2 and 3 would show up if a judge can see them.
5. **Panel `trigger`** — rule 1. It moved +0.44 ± 0.41 from r003 to r004 without clearing 2 SE; if
   the same size shows again on an independent round that is worth more than one round clearing it.

### What would mean the round is not readable

- **`cut` runs materially above r004's.** The prompt payload grew 4.6% (124,345 → 130,061 bytes),
  and a longer prompt that pushes more turns past the 600s deadline would depress every metric for
  a reason that has nothing to do with the rules. Check this **first**; if it moved, subtract it
  before reading anything else.
- **A large paired swing in turn count.** Shorter conversations mean fewer chances to card, and the
  persona agent is stochastic. Read `done` reasons before reading scores.
- **Any counter clearing 2 SE whose denominator differs between the rounds.** This already happened
  once: `cards overflowing at 380` read `+0.118 ± 0.044` against a round that had no probe, purely
  because the denominator was `claimable` rather than `overflow_measured`.

### Already known, so not a finding

- `floor: 8` will produce a spike at exactly 8 turns again (24 of 48 last round). It is a minimum
  that most runs land on. Raising it is an r006 change, deliberately not made mid-series.
- The two negative controls (`closure`, `http418`) will card in the same two models they always do.
  That is a model habit, not a rule that over-fires.

### r004 → r005 could not have cleared the threshold, whatever the rules did (2026-08-29)

Every registered read came back positive and none reached 2 SE. Before writing that down as "the
rules did nothing", the obvious question: **could this comparison have detected them?**

| Round | complete + timeout | error               |
| ----- | ------------------ | ------------------- |
| r003  | 160                | 0                   |
| r004  | **105**            | **115**             |
| r005  | 179 and rising     | 36 left, re-running |

r004 lost 115 of its 220 cells to the environment, so the paired set is capped at 105 and came out
at 85. From the observed per-pair spread:

| Read            | effect | sd across pairs | n needed for 2 SE | n available |
| --------------- | ------ | --------------- | ----------------- | ----------- |
| panel `overall` | +0.319 | 2.30            | **209**           | 85          |
| `hierarchy`     | +0.370 | 2.53            | **186**           | 85          |
| `interaction`   | +0.354 | 2.89            | **266**           | 85          |

So the panel half of this comparison was undecidable from the moment r004 finished. Not "the effect
was too small" — an effect of exactly this size, perfectly real, would still have printed a number
short of 2 SE. **The correct statement is that r005 is unreadable on the panel, not that it failed.**

Three things follow, and the third is the one that matters:

1. **r004 is not backfilled.** Re-running its 115 dead cells now would run them on today's harness —
   the playwright fix, the transport retry — while its surviving 105 ran on August's. A round half
   measured with one instrument and half with another is worse than a round that is honestly small.
2. **The deterministic counters are not in the same trouble.** `canvas 画出率` needs n≈9 and has 7;
   the click and persistence counters have spreads an order of magnitude below the panel's. Those
   are the reads to lean on while the panel is starved, which is what the file already says about
   reading counters before verdicts.
3. **r005 → r006 does not inherit this.** Both rounds will have ~215 usable runs on one harness, so
   the pairing lands near 200 — inside the 186-209 band the panel needs. The r006 read will be the
   first one with the power to resolve an effect this size, and if r006's changes produce the same
   +0.3 they will clear it.

Recorded before r006 runs so that a positive r006 read cannot later be sold as "the rules finally
started working" when part of it is simply the first round that could see.

**And the obvious fix — more judges — would do nothing.** Splitting r005's 217 verdicts into
within-run and between-run variance settles where the noise actually lives:

| Dimension   | sd between judges on one run | sd between runs | judge noise in the mean of 4 | real run-to-run |
| ----------- | ---------------------------- | --------------- | ---------------------------- | --------------- |
| `overall`   | 0.82                         | 2.26            | 0.41                         | **2.22**        |
| `hierarchy` | 1.00                         | 2.07            | 0.50                         | **2.00**        |
| `trigger`   | 0.82                         | 2.92            | 0.41                         | **2.89**        |

The panel agrees with itself. Four judges reduce their own disagreement to 0.41-0.50, and **97-99%
of what is left is the models genuinely producing different conversations run to run**. With an
infinite panel the paired sd falls from 2.30 to 2.22 and the n needed drops from 209 to 195 — a 3%
gain for unbounded cost. Judge count is not the lever; pairs are, and repeated runs per cell would
be, at double the price. Do not spend the round's budget widening the panel.

**Nor is a composite score.** The other free-looking idea — average the five dimensions instead of
reading `overall`, on the theory that per-dimension noise partly cancels — makes it worse:

| estimator                   | r004→r005 effect | SE multiple |
| --------------------------- | ---------------- | ----------- |
| `overall` alone             | +0.434 ± 0.235   | **1.85**    |
| mean of the five dimensions | +0.378 ± 0.244   | 1.55        |
| mean of all six             | +0.388 ± 0.241   | 1.61        |

Two reasons, both visible in the per-dimension table: the dimensions are strongly correlated, so
averaging removes little noise, and `clarify` is a null (+0.115, 0.45 SE) that dilutes the signal
without contributing any. `overall` is already the best single estimator available. **Read it, and
stop looking for a cleverer summary of the same 105 verdicts.**

### Read #1 came back, and it retired its own sharp predictor (2026-08-29)

The registered read for the per-turn decision rule was the skill-load rate, with a sharper backup:
_"whether ANY run loads it after turn 2, which happened 0 times in 101 runs before. One such run is
qualitative proof the rule landed; none means it did not."_

|                                 | r003              | r004             | r005              |
| ------------------------------- | ----------------- | ---------------- | ----------------- |
| runs that load the skill at all | 124 / 155 (80.0%) | 85 / 105 (81.0%) | 147 / 175 (84.0%) |
| first load on turn 0 / 1 / 2    | 118 / 5 / **1**   | 78 / 7 / **0**   | 141 / 5 / **1**   |

Paired on the 85 common cells, the rate is **+0.059 ± 0.045 — 1.3 SE**, short of the threshold.

And the sharp read does not rescue it, because **the "0 in 101 runs before" was measured on r004
alone**. r003 has exactly one run loading at turn 2 (`api-shape/macaron-v1-venti`), and r005 has
exactly one (`sql-tune/macaron-v1-venti`). One versus one versus zero, on n≈1, is not a signal in
either direction — and a predictor whose whole force came from a baseline of exactly zero loses all
of it the moment the baseline is one.

**The predictor is retired, not re-scoped.** Widening the denominator to r003+r004 and declaring
"1 in 260 before, 1 in 175 now" would keep a test that cannot resolve anything at these counts.
The honest version of this read is the rate, and the rate says the round did not clear 2 SE.

Recorded because the mistake is easy and one-directional: a baseline that happens to be zero on the
subset in front of you makes any single instance look like proof, and the check that catches it is
looking at the round BEFORE the one you drew the baseline from.

### The sticky read at 143 of 220, and why it is not readable yet (2026-08-29)

`eval/sticky.mjs` reads the trigger shape off the syntax tree — a `.map()` list with a heading or
control above it in the same parent — so "above" is a sibling relation rather than a regex guess.
Three numbers on the same instrument, and they disagree in a way that matters:

| Read                                            | r004    | r005 (partial)                       |
| ----------------------------------------------- | ------- | ------------------------------------ |
| pooled, any card containing `sticky`            | 1.9%    | **7.4%**                             |
| paired by (case, model), per-card               | 1.2%    | 4.6% — **+0.047 ± 0.027, 1.7 SE**    |
| paired, restricted to cards that HAVE the shape | 0 / 251 | 2 / 245 — **+0.017 ± 0.017, 1.0 SE** |

The pooled number is four times the paired one and neither clears 2 SE. Reading the hits explains
the gap: the runs where r005 pins — `diet-log/macaron-v1-venti`, `diet-log/step-3.7-flash`,
`palette/macaron-v1-coding-venti` — are runs where **r004 produced no cards at all**. r004's
`diet-log/macaron-v1-venti` directory holds zero `.tsx` files. Those cells are excluded from the
pairing, correctly, and what is left is the 59 cells where both rounds carded.

So the improvement visible in the pooled number may not be the sticky rule at all: it is equally
consistent with cells that used to produce nothing now producing something, which is a different
rule's win. **Do not attribute it until the round completes** and the pairing has the cells back.
The usages themselves are right — `sticky top-0 z-10 bg-layer border-b`, a pinned header over a
scrolling list, which is exactly what the rule asks for — so this is a question of attribution, not
of whether the models understood it.

### Baselines measured after r005 was frozen

Corpus counts over r003+r004's 766 cards, measured after r005 had already started. The `read`
column is the round that can actually move each one — getting this wrong is how a round later takes
credit for a rule that shipped before it.

| Metric                                                          | Baseline                                                 | Rule that targets it                               | Read in                                     |
| --------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------- |
| cards with a heading/control above a list that pin it           | **3 / 356 (0.8%)**                                       | sticky trigger                                     | **r005** — the rule is in its frozen plugin |
| `hover:` and a selected-state variant colliding on one property | **308 in 193 cards**                                     | pressed-and-hovered pair                           | r006                                        |
| runs where the reader clicked and nothing ever sent             | **108 / 161 (67%)**                                      | one control ends the step                          | r006                                        |
| `useEffect` timers with no cleanup                              | **0 / 39**                                               | none — already correct, and a crude regex said 212 | never                                       |
| cards carrying a `@container` breakpoint                        | **591 / 766 (77%)**                                      | already landed; was the top panel criticism at 76% | already read                                |
| cards stacking three box recipes                                | **216 / 755 (29%)**; four or more **41 (5.4%)**, worst 5 | countable nesting check                            | r006                                        |
| submissions that left the card looking untouched                | **36 / 105 (34%)**                                       | record-then-show, three statements                 | r006                                        |
| submissions recorded but lost on reload                         | **20 / 105 (19%)**                                       | `usePersistedState`, not `useState`                | r006                                        |
| reloads that re-fired the turn by themselves                    | **0 / 105**                                              | none — the opposite mistake does not happen        | never                                       |

### r005 mid-flight, after the TCC block (2026-08-29)

The round lost its Desktop permission grant 42 runs in — `dsh` could not read its own overlay and
173 of 220 runs died at 0.1s with `EPERM`. Wave stopped, permission restored by hand, relaunched
from the 42 cached runs. The frozen plugin was verified byte-intact across the interruption.

Two things read on the surviving 42 before the relaunch, recorded here so neither can be quoted
later as a finished result:

- **The sharp predictor failed: still 0 runs load the skill after turn 2**, in both rounds. But the
  42 that survived are the wrong population to test it on — the six deep cases where r004's
  never-loading runs live (`sql-tune` 5, `css-layout` 4, `formula-derive` 2, `arch-draw` 2,
  `svg-badge` 2, `chess-open` 1 — 16 of 20) had **not run at all**. On those 42, r004's own load
  rate was 93% against 80% for the whole round: they are the cases where the skill was already
  being loaded, so the rule has nothing to do there. Not evidence against the rule.
- **Sticky, pooled, looked like a 10x move** — 0.5% (r003) → 1.3% (r004) → 12.8% (r005). **Paired,
  it is `+0.059 ± 0.043` on 21 pairs and does not clear 2 SE.** The pooled number is a denominator
  effect: r005's completed cards come from cases r004 has no completed run for. Two runs improved,
  zero got worse, nineteen unchanged — the right direction with nowhere near the sample to say so.
  This is the same trap as `cards overflowing at 380` earlier today, caught by the same rule:
  **a counter whose denominator differs between the rounds is not a result.**

## The prompt budget, and why nothing was trimmed (2026-08-29)

Every round so far has only ADDED rules, and the payload the model carries shows it:

| round               | prompt + skill bytes | vs previous | largest block (the skill) |
| ------------------- | -------------------: | ----------: | ------------------------: |
| r003                |              121,622 |           — |                    58,896 |
| r004                |              124,345 |       +2.2% |                    61,272 |
| r005                |              130,061 |       +4.6% |                    63,578 |
| r006 (current tree) |              136,156 |       +4.7% |                    68,759 |

That is +12% in three rounds and +16.7% on the skill. A loop that only adds eventually stops
working, so two things were checked before deciding to carry it:

- **Is any of it duplicated between the layers?** `prompt.ts` rides every request; `skill.ts` loads
  on demand, so a sentence in both is pure waste. Measured with a similarity sweep over 186 + 306
  sentences: **2 near-duplicates, 201 characters.** The split is clean. The growth is real content.
- **Can a rule whose defect now measures at zero be dropped?** No — and this is the trap worth
  naming. `useEffect` timer cleanup measures **39 of 39 correct**, and the 4,498-character section
  teaching it is the most likely REASON it does. Absence of a defect is evidence the rule works,
  not evidence it is unnecessary. Removing it would be an A/B with no control.

So nothing was trimmed. What is recorded instead is the number and the next move: if a round ever
shows the skill being skimmed rather than followed — a rule near the END of the file failing while
one near the top holds — that is the signal to spend a round on length, with the trim as the single
variable and the removed rule's own counter as the read.

---

## r006 (against r005)

Written before the round exists. Six rules, plus a fixture change that has to be read separately
from them or it will be mistaken for them.

### What changed

| #   | Change                                                                                          | Where       | Baseline it is aimed at                                                                                                                                                      |
| --- | ----------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `aria-pressed:hover:*` in the button recipe                                                     | `skill.ts`  | **308 collisions in 193 cards** — `:is()` makes `hover` and the pressed variant both `(0,2,0)`, `hover` is written last, so the selection repaints neutral under the pointer |
| 2   | Exactly one control ends the step                                                               | `skill.ts`  | **108 of 161 clicking runs (67%) never sent anything**, 468 dead clicks                                                                                                      |
| 3   | The nesting check made countable — walk up and count ancestors repeating border+rounded+padding | `prompt.ts` | **216 of 755 (29%)** stack three, **41 (5.4%)** stack four or more, worst 5 — read off the syntax tree after two cheaper methods gave 33% and 60.7%                          |
| 4   | Record _and render_ — three statements, `usePersistedState`                                     | `skill.ts`  | **36 of 105 (34%)** looked untouched after submitting, **20 (19%)** lost it on reload                                                                                        |
| 5   | Hand-rolled `<pre>` named as the thing to stop doing                                            | `skill.ts`  | **182 of 194 cards showing code hand-roll a `<pre>` (94%)**; only 4 use `shiki`, and they are the same blocks as the widest overflows                                        |
| 6   | `drive.py` keeps the turns when the transport drops                                             | `eval/`     | not a prompt rule; it stops a dropped channel from being scored as a model that produced nothing                                                                             |

### The fixture also changed, and that is a confound

`floor` 8 → 10 on the six deep cases, and four new cases at `floor: 10`. Raising the floor is what
the goal asks for and r004's spike says is needed — **24 of 48 healthy runs stopped on exactly 8**,
so the declared minimum was acting as a ceiling and turns 9-10 barely existed. But turns 9-10 are
also exactly where a clarification would have to surface a SECOND time, which is what rules 2 and 4
are about. A rate that moves could be either.

**So the paired read truncates.** r006's six deep cases are compared to r005's on their **first 8
turns only** — identical floor pressure on both sides, confound removed. The turns past 8 are read
on their own, against nothing, as description rather than as a delta. Any claim of improvement on
these six comes from the truncated read; if the two disagree, the truncated one is the result.

The four new cases (`orbit-3d`, `log-dig`, `game-tune`, `shift-plan`) are paired against nothing and
**cannot show improvement this round**. They exist to reach shapes the first six never ask for: a
thing in space, a card that runs something, a control whose only verification is playing with it,
and a list long enough for the sticky rule to bite. Their numbers are r007's baseline.

### The per-run timeout goes 1800 → 2700, measured rather than guessed

Read off r005's deep cases before launching, because `cut` being the first read is worth nothing if
the round is launched into a configuration already known to cut. Those six currently time out **0
times in 26 results**; median 412s, p90 950s against the 1800s cap. Adding two turns at each run's
OWN measured seconds-per-turn puts p90 at **1610s and 2 of 26 over the cap** — so `floor: 10` at
1800s would have manufactured an ~8% cut rate on exactly the cases the round is about, and the
first read would have called the round unreadable for a reason that was set at launch.

2700s clears the projected p90 by 1090s. It cannot bias the paired read in the optimistic
direction: a longer cap only lets more runs REACH turn 8, and a pair is only read when **both**
sides reached it, so r006 runs with no r005 counterpart are dropped rather than averaged in.
`UI4A_TURN_DEADLINE` stays at 600 — it is paired across every round so far and is not a free knob.

### The reads, in order

1. **The `cut` rate first.** If runs are being cut by the deadline more than r005, nothing below is
   readable — a truncated run produces fewer cards for reasons that have nothing to do with a rule.
   `floor: 10` and four 14-turn cases both push runtime up, so this is the read most likely to
   invalidate the round.
2. **Dead clicks per run** (rule 2). The sharp form: share of runs where the reader clicked at least
   once and nothing ever sent. 67% → below 40% is the win. This is the one metric with a large
   enough baseline that 2 SE is easy to clear.
3. **Submissions the card kept** (rule 4), two numbers that must move together: looked-untouched
   34% → under 15%, and lost-on-reload 19% → under 5%. The second moving without the first means
   the card is persisting into state nothing renders — the exact failure the rule names.
4. **Hover/pressed collisions** (rule 1), counted in the generated CSS rather than the source: a
   card is a hit when one property is set by both a `hover` and a pressed selector of equal
   specificity. 308 → under 50.
5. **Nesting depth** (rule 3), from `eval/nesting.mjs`, which reads the syntax tree — the regex and
   indentation versions of this counter were both wrong by more than 5x, in opposite directions.
   Three-stacks 29% → under 15%; four-or-more 5.4% → under 2%. The second is the one the rule
   actually names, and it is small enough that 2 SE will be hard to clear — so a null there is not
   evidence the rule failed, only that this round could not see it.
6. **Hand-rolled `<pre>`** (rule 5). 94% → under 60%, read together with the overflow counter: these
   are the same blocks, so if `<pre>` falls and overflow does not, the replacement is also too wide.
7. **The panel, last.** It has never been the thing that decided a round and is not going to start.

### Which r006 rules can actually be proven, computed before the round

Same exercise as the panel power check, on the deterministic counters. Per-pair spreads are r005's;
the minimum detectable effect is `2·sd/√n` at the n each counter will realistically have.

| Counter                         | pairs it will have | per-pair sd | smallest move it can resolve | r004 baseline | rule       |
| ------------------------------- | ------------------ | ----------- | ---------------------------- | ------------- | ---------- |
| clicks that fired the turn      | ~120               | 0.312       | **5.7pp**                    | 11.5%         | 2          |
| cards per turn                  | ~200               | 0.346       | 4.9pp                        | 47.8%         | 1 (r005's) |
| cards that painted              | ~130               | 0.182       | 3.2pp                        | 91.6%         | —          |
| overflowing at 380px            | ~110               | 0.297       | 5.7pp                        | 13.3%         | 5          |
| preview-then-commit             | ~200               | 0.422       | 6.0pp                        | 17.6%         | 2          |
| **committed but not recorded**  | **~35**            | 0.530       | **18pp**                     | 42.5%         | 4          |
| **recorded but lost on reload** | **~35**            | 0.461       | **16pp**                     | 27.5%         | 4          |

**Rule 4 is the one at risk, and not because of the round size.** Its denominator is turns where a
click actually SENT something, and only **16-24% of runs have one** (r003 18%, r004 24%, r005 16%).
Reload frequency is not the cause — `drive.py` reloads after every carded turn already. The cause
is that most clicking never commits, which is rule 2's target.

**The dead clicks split two ways, and only the big half is the models'.** Of 171 runs where the
reader clicked, **117 (68%) never sent anything** — and reading the card sources rather than the
click log says why:

|                                                             | count  | share of dead |
| ----------------------------------------------------------- | ------ | ------------- |
| the card's source contains **no `sendMessage` call at all** | **90** | **77%**       |
| it has one, and the reader never reached it                 | 27     | 23%           |

Three quarters of them cannot send because nothing in the card is wired to send. The reader clicks
`RESTful (JSON)`, `下一步 →`, `2. 尺度缩放 / √d` — real controls that flip internal state and
nothing else — and the conversation simply stops there. That is the defect rule 2 names, and it is
not an artefact of the persona: an agent cannot click a control that was never written.

The remaining 23% is a different problem (the card offers a way out and the user agent does not
take it) and rule 2 does not address it. **If dead clicks fall from 68% to around 16%, that is the
whole of the addressable half and a complete success** — quoting a target of 0% would be quoting
the persona's share as the models'.

So the two are linked: **rule 2 succeeding is the precondition for rule 4 being measurable at all.**
If dead clicks fall, more runs commit, the persistence denominator grows and rule 4 gets its pairs.
If rule 2 does nothing, rule 4 arrives at ~35 pairs and needs an 18pp move to register — its
registered prediction (34% → under 15%) would just barely clear that, with no margin.

Written down now so the failure mode is named in advance: **a null on rule 4 next to a null on rule
2 is one result, not two.** Reporting them as two independent failures would double-count a single
cause.

### What would make r006 unreadable

- `cut` rate up by more than 2 SE — runtime ate the round; drop `floor` back to 9 and re-run.
- Any of the six rules missing from `rounds/r006/plugin` — verify before the first run, not after.
  r005 shipped three rules while the corpus sweep had produced five, and only checking the frozen
  copy made that visible.
- The four new cases erroring out at a higher rate than the twelve — a fixture that does not run is
  not a fixture. `log-dig` was the suspected risk, and the suspicion was checked rather than left
  standing: `$dsh/exec` **is** reachable from the eval homes, and cards already use it in **9 files
  in r004 and 9 in r005**. That is also the argument for the case. Against `$dsh/chat`'s 256 files
  and `$dsh/state`'s 294, exec is the least-exercised capability the plugin offers, and until now no
  fixture asked for it — so its 4% share measured the fixtures, not the models.

---

## r006, read (2026-08-30)

260 cells, 257 complete + 3 timeout, zero errors. **217 paired runs** — the first comparison with
the power the r004→r005 analysis said was needed.

**Read #0 first: the round is readable.** On the shared cases, cut went 13/180 (7.2%) → 20/180
(11.1%), a difference of 0.039 ± 0.030 — **1.3 SE**, inside the noise and short of the 2 SE that
was registered as the condition for calling the round invalid.

### Cleared 2 SE

| Read                                          | before → after | delta              | SE  |
| --------------------------------------------- | -------------- | ------------------ | --- |
| cards that persist an answer (rule 4)         |                | **+0.195 ± 0.044** | 4.4 |
| …the same, truncated to the first 8 turns     |                | **+0.213 ± 0.061** | 3.5 |
| committed but not recorded (rule 4)           | 42.5% →        | **−0.245 ± 0.096** | 2.6 |
| recorded but lost on reload (rule 4)          | 27.5% →        | **−0.156 ± 0.073** | 2.1 |
| cards with a hover/pressed collision (rule 1) | 38.0% → 24.4%  | **−0.198 ± 0.046** | 4.3 |
| panel `interaction`, clean pairs              |                | **+0.527 ± 0.186** | 2.8 |
| panel `overall`, clean pairs                  |                | **+0.329 ± 0.130** | 2.5 |
| preview-then-commit                           |                | +0.074 ± 0.028     | 2.6 |
| cards that painted                            |                | +0.045 ± 0.020     | 2.3 |

Rule 4 surviving the 8-turn truncation is the load-bearing part: the effect is not the two extra
turns `floor: 10` bought. And rule 4 is the rule whose _mechanism_ was corrected the day before —
from "nobody writes the third line" (false: 91 of 93 render the value) to "they render it as a
highlight and say nothing in words".

### Did not move

**Rule 2 — one control ends the step — is flat.** `clicks that fired the turn` is −0.001 ± 0.029 on
113 pairs. This was the largest baseline in the round (77% of dead clicks have no `sendMessage` in
the source at all) and the rule was rewritten into a grep the model can run on itself. It changed
nothing. The four new cases agree: `orbit-3d` sent 2 of 35 clicks, `game-tune` 6 of 41.

> **Corrected 08-31 — this section read the wrong population, and rule 2 is not flat.**
> `clicks that fired the turn` pools over CLICKS. Reading the 321 clicks whose card contains no
> `sendMessage` at all, almost none of them are submits: the reasons the user-agent recorded are
> "复位视角", "复制命令", "打开导航", "切到用满模式", "先看看内容少的时候", "清空示例". They are
> preview clicks, and a card that fired the turn on any of them would be interrupting a reader who
> is still deciding — **the pooled rate penalises exactly the preview-then-commit shape the skill
> asks for.** No rewrite of the rule can move a denominator.
>
> Read over the population the rule's own evidence uses — runs, not clicks — the same 113 pairs say:
>
> | read                                               | r005 → r006   | delta              | sign test             |
> | -------------------------------------------------- | ------------- | ------------------ | --------------------- |
> | `preview-then-commit`, the shape `/goal` asks for  |               | **+0.074 ± 0.028** | 27↑/11↓ **p = 0.014** |
> | `runs that ended a step`                           | 32.7% → 42.5% | +0.097 ± 0.047     | 20↑/9↓ p = 0.061      |
> | `clicks that fired the turn` (what was read above) | 13.1% → 13.0% | −0.001 ± 0.029     | —                     |
>
> **The right number was already in the table above**, listed under "Cleared 2 SE" as a generic win
> while the conclusion was drawn from the row beside it. Rule 2 worked; the read did not.
>
> Two instrument fixes came out of this and both are in `delta.py`: `runs that ended a step` is now
> a counter, and every 0-or-1 counter prints an exact sign test beside its SE. `runs that ended a
> step` marks `←` at 2.1 SE while the sign test says p = 0.061 — the normal approximation is
> optimistic on binary paired data in exactly the direction that turns "suggestive" into "cleared".
>
> Also corrected: **"dead" means two different things in this project.** `score.py`'s `dead_clicks`
> counts clicks where the driver could not resolve the control — a harness failure. The "117 of 171
> dead" in the shipped rule 2 counts RUNS that never once sent. r006 has **zero** dead clicks by the
> first meaning.

**Rule 3 — countable nesting — went the wrong way**, 4.1% → 6.0% of cards stacking four or more.

### A regression, and why it cannot be attributed

`sticky` usage on the 142 paired cells fell **6.5% → 1.1%** (−0.048 ± 0.022, 2.2 SE). The rule's
text is byte-identical between the two frozen plugins and sits in the same place. What changed is
its evidence paragraph: a concrete session anecdote containing the literal phrase **"Zero
occurrences of `sticky`"** was replaced with an aggregate ("356 of 766 have the shape, 3 pin it").

That is a hypothesis and this round cannot test it. **r006 changed six rules and grew the prompt by
9KB**; any of that could be responsible, and a round that moves six things cannot say which one
moved a seventh. Registered for r007 as a single-variable round: restore that sentence, change
nothing else.

### Baselines for r007, from the four new cases (10 runs each, unpaired by design)

| case         | mean turns | cards per turn | clicks sent | reached its shape                            |
| ------------ | ---------- | -------------- | ----------- | -------------------------------------------- |
| `orbit-3d`   | 8.6        | 51%            | 2 / 35      | 7 of 10 used 3D or animation                 |
| `log-dig`    | 11.7       | 39%            | 12 / 43     | 2 read the fixture log, 1 called `$dsh/exec` |
| `game-tune`  | 9.1        | 66%            | 6 / 41      | 1 used animation                             |
| `shift-plan` | 9.6        | 56%            | 10 / 23     | —                                            |

## r007 — pre-registered 08-31

### The single-variable round registered above did not happen, and could not have

r006's read ends "Registered for r007 as a single-variable round: restore that sentence, change
nothing else." That was written without checking what was already committed. By the time r007 was
composed the tree held **seven** prompt/skill commits made after r006's freeze (`117452d`):

| commit              | what it moves                                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| `8f980b5`           | nesting figures: the shipped 33% and its seven-deep example were both wrong (29% / 5.4%, max 5) |
| `b87b49b`           | rule 1: the other three selected-state spellings                                                |
| `f723e46`           | rule 2: rewritten as a grep — 77% have no `sendMessage` at all                                  |
| `3924bc8`           | rule 4: mechanism corrected — 91 of 93 DO render the value                                      |
| `95fbccc`           | rule 5: `<code>` is the element that overflows, a third of all of them                          |
| `7d9638b` `bc26009` | canvas/inline: ask whether they wanted a file, not whether the content looks keepable           |

Five of those correct statements the shipped prompt makes that measurement showed to be false.
**Holding a known-false number in the prompt to protect an experiment is not a trade this project
makes** — the prompt is the product; the round is the instrument. So r007 is a corrections round
that also carries one designed intervention, and it is registered as such rather than dressed up as
the clean test it is not.

### The intervention: no rule attaches a small number to the behaviour it is asking for

r006's regression note blamed "concrete anecdote replaced by aggregate". Re-reading `b48e64c`
against the four rules whose outcome r006 measured gives a sharper candidate — **which side of the
comparison the small number lands on**:

| rule             | how r006 phrased its evidence                                         | number sits on              | r006 outcome          |
| ---------------- | --------------------------------------------------------------------- | --------------------------- | --------------------- |
| 4, persist       | "36 (34%) left the card unchanged … 20 (19%) lost it on reload — 53%" | the defect                  | **+0.195**, 4.4 SE    |
| 1, collisions    | "raised in 22% of its verdicts"                                       | the defect                  | **−0.198**, 4.3 SE    |
| 2, ends the step | "108 of them — 67% — never once got a result back out"                | the defect                  | flat                  |
| sticky           | "356 have the shape, and **3 pin it — 0.8%**"                         | **the behaviour asked for** | **regressed**, 2.2 SE |

Same corpus, same fact, opposite rhetoric: "3 of 356 pin it" makes pinning look like a three-instance
curiosity, where "353 of 356 let it scroll away" puts the large number on the defect. `b48e64c` also
deleted the one bolded clause naming the literal token — **"Zero occurrences of `sticky`"** — which
was the only place in the paragraph that told the model what to type.

**This is n = 1 and is registered as n = 1.** One rule in one round is a coincidence until it
repeats; what makes it worth acting on is that the rewrite costs nothing and loses no information.
Both halves go back: polarity flipped, bolded token restored, corpus statistic kept.

### Predicted, with the threshold that decides each

1. **`sticky` recovers — read on `eval/sticky.mjs --paired`, not on a grep.** Two instruments
   exist and the r006 read above quoted the looser one. Both are registered so the read cannot pick
   afterwards:

   | instrument                                       | population                                 | r005 → r006     | r007 clears at |
   | ------------------------------------------------ | ------------------------------------------ | --------------- | -------------- |
   | `sticky.mjs --paired` (**the one that decides**) | pinned / cards with a heading-above-a-list | 3.2% → **0.0%** | **≥ 2.0%**     |
   | grep for the token, all cards                    | any `sticky` / all cards                   | 6.5% → 1.1%     | ≥ 4.0%         |

   The AST instrument is the one that matches the rule, and it is the harsher read: **on the 121
   shared cells r006 pinned nothing at all** — its 16 pinned cards are entirely in cells r005 never
   ran. The absolute series is r004 0/298 → r005 19/549 → r006 16/703, so r005 is the only round
   that moved this off the floor and r007 is asking whether the sentence r005 had is why. Below 2 SE
   of movement on the AST read, the polarity hypothesis is dead and the r006 regression was
   something else — most likely the 9KB of growth, which r007 does not undo.

2. **Rule 2 is read on `preview-then-commit` and `runs that ended a step`, never again on
   `clicks that fired the turn`.** The premise this prediction was first written on — "rewritten
   twice and measured flat" — was a population error, corrected above: rule 2 landed in r006 at
   p = 0.014 on the shape `/goal` actually asks for. So the prediction is not "does it move at
   last" but **does it hold**: `preview-then-commit` stays positive or flat, and `runs that ended a
   step` clears p < 0.05 on the sign test now that r007 supplies more pairs than r006's 113. A
   fall on either is the first evidence that rule text can be undone by a round that never touched
   it.
3. **Rule 3 stops going the wrong way.** r006 shipped a 6x-wrong figure and nesting got worse;
   r007 ships the measured one. `cards stacking four or more` back under 4.1%.
4. **Rules 1 and 4 hold.** Both landed decisively and neither had its text weakened. A loss here
   is evidence that round-to-round drift swamps rule text, which would put every read above in
   doubt.
5. **Panel `overall` does not fall.** r006 gained +0.329 ± 0.130 and r007 adds no new rule — the
   canvas/inline change is the only thing that could plausibly cost prose quality.
6. **The canvas rate falls, and `changelog` is where it should show.** r006 wrote a canvas for
   **29.2% of cards** and **32.0% of runs**, so there is room to move; `changelog` ("TypeScript 5.9
   相比 5.8 更新了什么") is new in r007 and designed as the discriminator — a long, well-organised
   answer to a question that asked for no file. **≤ 1 of its 10 runs should write a canvas.**

   > **Corrected mid-round: `onboard-doc` IS in r007, and so are the other two new cases.** r007
   > died at 24/270 when the Desktop grant vanished, and the process that resumed it re-imported
   > `cases.py` — which by then held the three cases added while it ran. The round is **30 cases ×
   > 10 models = 300**, its `manifest.json` was rewritten to match, and the paragraph below is
   > wrong about the control being absent.
   >
   > **The effect is benign and the mechanism is not.** Adding cases is additive: the other 27 are
   > untouched, every case runs against the same frozen plugin, and r006↔r007 pairs are an
   > intersection so they do not move. Had the edit CHANGED an existing case, r007 would have run
   > some cells against one version of it and some against another, with nothing in the output
   > saying which. **The freeze covers what the model reads (`lib/`); it does not cover what the
   > harness spawns (`card-driver.mjs`) or what defines the round (`cases.py`).** Both gaps are
   > now recorded in CLAUDE.md; neither is fixed.

   **This round has no control in the other direction, and the read must say so.** Every case in
   the r007 suite is one where inline is correct or where it does not matter; not one asks for a
   durable artefact. So a round that simply stopped writing canvases would improve every number
   here and nothing would catch it — the §6.2 lesson about the sample that was supposed to stay
   prose, missing. `onboard-doc` ("我要存下来，之后每来一个新人都改改再用") is added for r008 as
   exactly that control. Until it has run, **a falling canvas rate is suggestive and not a result**.

   **And it was already falling before the change existed.** r005→r006 reads `…canvases` at
   **−0.053 ± 0.020** (2.6 SE) with nothing in that round touching the canvas decision. So r007
   inherits a downward drift, and a fall of that size in r007 is the drift continuing, not the rule
   landing. Registered so the r007 read cannot claim it: **the change is credited only if the fall
   is larger than r006's, and `changelog` clears its ≤1-of-10 bar.**

### How to read r007: the counters decide, the panel describes

Measured on r005→r006's 217 pairs, per-cell `overall` differences have **sd = 2.30**, and it is
spread evenly — by case it runs 0.92 (`http418`) to 3.78 (`sort-learn`), by model 1.33 (`kimi-k3`)
to 3.55 (`grok-4.6`), with no cell dominating. So there is no cheap variance win available: no
handful of unstable cells to repeat, and dropping the noisy ones would be selecting on the outcome.

What that sd buys at ~250 pairs is **SE ≈ 0.145**, so the panel can only see effects of about 0.3
and up. The counters are two to three times better on the same round:

| read                                   | r005 → r006    | SNR        |
| -------------------------------------- | -------------- | ---------- |
| panel `overall`, all pairs             | +0.208 ± 0.156 | 1.3 SE     |
| panel `overall`, clean pairs           | +0.329 ± 0.130 | 2.5 SE     |
| `cards that persist an answer`         | +0.195 ± 0.044 | **4.4 SE** |
| `cards with a hover/pressed collision` | −0.198 ± 0.046 | **4.3 SE** |

Bringing the panel to the counters' power needs each cell run **twice** (sd 2.30 → 1.63, SE → 0.11),
which doubles an 8.5-hour round to 17. Not worth it while the counters carry the signal — so
**a round is judged on its counters, and the panel is reported beside them as description.** A
round whose only evidence is a panel move under 2.5 SE has not shown anything, and this is
registered here so r007 cannot be declared a success on the panel alone.

### A defect class nothing in the skill addresses, found while r007 ran

Mining r006's 1031 judge `worst` fields turned up a complaint no counter here could see: **a control
that is there, is clickable, and is wired to nothing.** "Clicking the style filters and 换一批 did
not actually update or filter the list"; "点击 OAuth 后预览内容完全没有变化"; "the in-card attempt
to fix 300 never took". This is **not rule 2** — rule 2 is a card with no way to finish; this is a
card whose controls do not work.

It needs no new probe. The harness already shoots each card before the reader touches it and again
after, so an inert control is a byte-identical PNG pair. `eval/inert.py` reads it, and the number is
**stable and untouched by either round**:

|                      | clicking turns | inert             | paired                       |
| -------------------- | -------------- | ----------------- | ---------------------------- |
| r005                 | 352            | 60 (17.0%)        |                              |
| r006                 | 517            | 74 (14.3%)        |                              |
| the 105 shared cells | 309 → 343      | 15.9% → **16.0%** | −0.016 ± 0.039, **not 2 SE** |

The apparent r005→r006 improvement is the case mix, not a change: on the same cells it is flat.
About **one clicking turn in six** hands the reader a control that does nothing, and it is spread
across every model (18 for the worst, then 15, 14, 9, 8…).

**The raw rate is roughly 13% high and that is measured, not assumed.** Four false-positive classes
were removed by reading hits — a click that sent the turn, a copy button, a click on an input or a
slider (the driver clicks; it does not type or drag), a card at the screenshot cap — and reading 38
of the survivors found 5 that are still the third kind. So the defect is near **12%**, and `inert.py`
says so in its own docstring rather than leaving a future round to quote the headline.

Registered as an **r008 candidate, not an r007 read**: r007's plugin was frozen before this existed,
so r007 can only supply a third baseline. If it lands near 16% again on paired cells, that is three
rounds of a defect nothing has addressed, and it earns a rule.

### A rendering change that lands in r008, not r007

Found from a screenshot, not from a counter: a band of empty space above every card's title. The
scoped preflight normalises `box-sizing`, list markers and form controls, but **not headings or
paragraphs** — so the browser's own margins were still standing. Measured on the surface:

| tag                   | UA margin, top and bottom   |
| --------------------- | --------------------------- |
| h1 / h2 / h3 / h4     | 21.4 / 19.9 / 18.7 / 21.3px |
| p, blockquote, figure | 16px                        |
| pre                   | 13px                        |
| **ul**                | **0**                       |

`ul` reading 0 is what makes the rest evidence rather than a guess: the existing line works, and
these tags were simply not in it. A card's first child is almost always a heading, so it pushed
itself down by more than the card's own padding — the real card that prompted this went from a
**25px** top gap to **12px**, which is exactly its `p-3` and nothing else.

**This changes how every card lays out, so r008 inherits a rendering variable r007 did not have.**
Two counters could move for reasons that have nothing to do with any rule: `cards overflowing at
380` (less vertical space consumed, so less chance of a clipped bottom) and the panel's
`hierarchy`, which is what a judge scores when spacing reads as deliberate. Registered here so
neither is claimed for a prompt change. `sticky`, the collision counters and rule 4 are untouched
by it.

### Not touched, deliberately

The live-region rule quotes **"0 of 64 corpus cards announce their results"** and **"8 of 23"** —
both the same small-number-on-the-desired-behaviour shape as `sticky`, and both left alone. A new
counter in `eval/sweep.py` measures _presence_ of any live region on a fetching card (r005 1 of 15,
r006 6 of 33) and that is a **floor on the defect, not the defect rate**: it cannot tell a live
region on the results container from one on an unrelated toast, and 149 of r006's 943 cards carry
`aria-live` for other reasons. Rewriting a claim this instrument cannot check would be restating a
number as if it had been re-measured. It waits for a probe that reads placement.
