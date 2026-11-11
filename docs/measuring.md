# What measuring this project established

Moved out of [CLAUDE.md](../CLAUDE.md) — the evidence behind its rules. You need this when you are
measuring something, writing an eval, or about to trust a number; not when you are editing a
component.

Where anything here disagrees with CLAUDE.md, CLAUDE.md wins.

## 6. What five days of measuring established

`docs/measurements-log.md` is the raw session-by-session record — 8,000 lines of it, kept for
provenance. This section is what survived: each lesson once, with the measurement that earned it.
**Add findings here, not as another dated section**; if a new one is a fresh instance of a lesson
already below, add its number to that lesson and stop.

### 6.1 Every measurement lied at least once

Twenty times a metric said something plausible and false. The failures share a shape worth
recognising before trusting any number in this project.

| what looked true                              | what was true                                                | the tell                                       |
| --------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------- |
| a rule failed, `fence=0`                      | it wrote a **canvas**                                        | count canvases too                             |
| a commit caused a regression                  | one flap in seven                                            | repeat the _old_ side as well                  |
| a rule did not generalise, 0/9                | the plugin symlink was dead                                  | check the subject ran                          |
| a rule was refused, six zeros                 | `QUOTA: Insufficient Balance`                                | short well-formed output is suspicious         |
| a card's state was broken                     | a bare `.click()` unlocks nothing                            | drive it as input                              |
| a card remounted while visible                | the probe matched any `return (`                             | a helper component has those too               |
| a gate was broken, exit 0                     | `cmd \| tail; echo $?` reads `tail`                          | never pipe when the code is the measurement    |
| sonnet refused a fixture                      | gateway 400, empty reply                                     | a transcript exists before the model answers   |
| the whole eval batch timed out                | the upstream stalled, `bytes=0`                              | `assistant/chunk` present or absent            |
| a verification run learnt the wrong rule      | it ran a build from two minutes earlier                      | `stat -f %Sm` session vs `lib/`                |
| a `min-width` fix did nothing                 | `<input>` sizes from `size`, not placeholder                 | construct the trigger, verify it triggers      |
| the panel found a redundant border            | light paints every layer `#fff`                              | render it before believing it                  |
| a whole wave of runs stalled upstream         | `$LITELLM_24000_API_KEY` was unset                           | a live process writing nothing                 |
| the wave was not running at all               | `find -newermt` errored, piped to `wc`                       | run the check unpiped, read its exit           |
| a card truncated with 800px to spare          | the ellipsis is in the DATA                                  | `scrollWidth > box`, not the pixels            |
| 4 of 6 sliders forgot their fill              | all four are "pick a value", which must NOT fill             | read what the number means                     |
| the canvas paint rate fell 100% -> 86%        | 5 canvases re-snapshotted 17 times, 2 of them my own harness | dedupe by (run, canvas id) first               |
| a negative control over-fires 30% of the time | two models card on it in every round, eight never do         | split a control rate by model before rewording |
| a rule banned `100vh` and the card obeyed     | it wrote `78vh` — the UNIT was the defect, not the number    | ban the unit, not the value you saw            |
| rule 2 changed nothing, 0.0 SE                | pooled over CLICKS; per RUN it landed at p=0.014             | count what the rule's own evidence counts      |

**A canvas is counted once per turn it changes, and three of the five ways to fail are not the
card's.** Reading r002's 17 unpainted canvases end to end: they are **5 distinct canvases**, each
re-snapshotted 3-6 times, so a 14-point "regression" in the pooled paint rate is four numbers wide.
Of the five, three are genuine model defects (`import { write } from "$dsh/state"` — an export that
does not exist; `low is not defined`; `@radix-ui/react-tabs` imported as `TabList` when it exports
`List`/`TabsList`) and **two are the harness**:

- `sort-compare.ui4a` imports `./quicksort-trace.ui4a`. Production inlines sub-pages into child
  blob URLs (§3); `eval/card-driver.mjs` mounts the source raw, so a split canvas can only ever
  score unpainted there. One card in three rounds, named here rather than special-cased in code.
- `diet-log.ui4a` imports `@number-flow/react` and scored unpainted on **four** consecutive turns
  with `errs=[]` — then painted 1434px within one second when re-mounted later on a machine that
  reached esm.sh. A bare specifier that fails to fetch kills the module graph silently (§4), which
  is indistinguishable from a card that renders nothing. **An unpainted card with an empty error
  list is network-suspect until re-mounted**; one with a message in it is the card's own fault.

So the paint rate splits the way the pooled number cannot: fences 98.3%->97%, canvases the rest. And
`eval/delta.py` reports the two arms separately for that reason — pooled it reads -0.054 ± 0.024 and
looks decisive, split it is -0.025 ± 0.023 and -0.137 ± 0.081 and neither arm clears 2 SE on its own.

**A sixth class, found by reading 29 cards' screenshots in one sitting: the pixels are real and
the intent is inferred.** Five times in a day I read a defect off a shot that did not survive one
look at the source — and the fifth time I nearly rewrote a working probe to match the misreading:

| what the shot showed                      | what it was                                               |
| ----------------------------------------- | --------------------------------------------------------- |
| a filled form with a disabled button      | four `placeholder="30"` on empty fields                   |
| five cards celebrating going over a limit | the user is eating UP TO a target — green was right       |
| `truncate` firing with 800px to spare     | the ellipsis is a literal in the data                     |
| a pending row logged as `0`               | `value=""` with `placeholder="0"` — the total was correct |
| 1100px of wasted width                    | a justified header reaching 704 of 720                    |

A CSS ellipsis and a typed one are the same pixels; a placeholder and a value are the same pixels;
correct green and wrong green are the same pixels. **When a shot suggests a defect whose evidence
is what the pixels IMPLY rather than what they ARE, the source or a DOM probe settles it in a
minute** — and a probe's silence is often the correct answer to the question it asks, not a gap.

Four properties they share: **the failure and the interesting result are identical at the metric**,
so repetition does not help; **the wrong answer is the alarming one**, which is the direction that
gets written up; **a check written for one has a blind spot for the next**; and **the tell is never
in the number** — it is in the byte count, the first line of the reply, whether a transcript exists.

Hence `scripts/eval.sh` prints `skill=`, `bytes=` and `tools=[]` beside every verdict. It derives the
assistant-visible reply with `scripts/visible-reply.ts`, so reasoning scratch text cannot inflate the
fence count. A zero is not evidence until the reply behind it has been read.

**A first-pass detector over-reports by roughly an order of magnitude, in the direction you
expected.** Six times: streaming guards 7→0, remounts 35→0, hardcoded colours 80→2, nested borders
130→unmeasurable, `UNREACHABLE-CONTROL` 41→18, `flex:1` rows 97→(unscreenable). The regex encodes
the shape of the mistake and knows nothing about the shapes of correct code around it. **Never
report a count from a new detector without reading every hit**, or a sample past a dozen.

### 6.2 What makes a prompt rule land

Measured across ~300 model runs. The pattern is consistent enough to use as a checklist.

- **Show the fix as code, not as a consequence.** Identical content, one variable: the undo rule as
  prose ran 0 of 2 eligible runs, as a code block **2 of 2**. Across the skill, rules shown as code
  land at 88–100% (`prefers-reduced-motion` 102/109, `:focus-visible` 100/113, `exitCode` 18/19)
  and rules described in prose land at 0–7% (`AbortController` on a poll: 0/11). If a rule is not
  landing, the question is not how to say it more clearly — it is whether the model must write
  anything to obey it that the rule does not already show.
- **Name a shape visible in the code being written**, not a property of the answer. `conditional
  background inside a .map` works; "a process rather than a rule" does not, because the model has
  to fetch the answer to apply it and by then the shape is decided. Two rewrites keyed on the
  answer were reverted for net-negative results.
- **A rule must not contain a recognisable negative.** Naming the phrasings that fail hands the
  model a rule for failing — `二分查找的原理` went 0/6 while the rule said that phrasing usually
  does not warrant a card, and 6/6 once the negative was removed. Same defect in a header: `**A
  border or a background, never both**` with the exception in the body was matched on the header
  by five judge models and would be by any reader.
- **A rule must not attach a small number to the behaviour it is asking for.** The `sticky` rule's
  evidence was rewritten from a session anecdote ending **"Zero occurrences of `sticky`"** to the
  corpus figure **"356 have the shape, and 3 pin it — 0.8%"**. The rule text was byte-identical
  across the two rounds; `sticky` usage fell **6.5% → 1.1%** (2.2 SE). Both sentences carry the
  same fact, and "353 of 356 let it scroll away" would carry it with the large number on the
  defect instead. Of the four rules r006 measured, the three phrased as _most cards fail this_
  landed or held; the one phrased as _almost none do this_ is the one that regressed. **n = 1, and
  registered as n = 1** — but it costs nothing to write the number on the failing side, and a base
  rate quoted at 0.8% tells the model what 99.2% of cards do. Related to but distinct from the
  negative-phrasing rule above: that one is about naming the failing SHAPE, this one is about which
  side of the count the small number lands on.
- **A recipe is followed as a recipe.** `display: block; width: 100%; text-align: left` was written
  for one layout; cards reaching for `display: flex` took none of the three, including the
  `text-align` that mattered. The rules that transfer name one property and why it is needed.
- **Widening the skill's own description does not widen what loads it.** Naming five concrete
  shapes in `SKILL_DESCRIPTION` — a markdown table, doses that vary by age, a numbered option set,
  anything the user is logging — moved the load rate on real questions from 3/11 to 2/10: nothing,
  or slightly worse. The description is what the model reads _while choosing among skills_; a
  question it never classified as UI-adjacent never gets that far. The lever is the resident layer,
  which is read on every turn.
- **Where a rule lives decides whether it is applied.** `aria-live` in `prompt.ts` alone: absent.
  The same text moved into the skill, next to the other JSX-attribute rules: present, replicated on
  two prompts. The resident layer is read before deciding _what_ to build; the skill is read while
  building.
- **A skill rule can only reach the runs that load the skill**, which was 62% until one sentence in
  the resident layer named what the skill carries _after_ the decision to build — then 17 of 17,
  and the residue on every screen went to zero. The skill-load rate is part of the measurement, not
  context: 4 of 4 runs that loaded it followed the rule; 0 of 2 that did not.
- **The cleanest flip this project has measured, and what made it measurable.** The rule "if your
  last answer restated a running total, the answer was already a card" went **0 of 18 → 5 of 8** on
  the same six conversations and the same three models, with the prompt as the only variable.
  Three things made that readable rather than suggestive:
  - **The baseline was an absolute zero, not a low rate.** 18 runs, 0 fences, 0 canvases, 0 skill
    loads — while 17 of those 18 replies carried a markdown list, half of them eight rows or more.
    A rate moving from 2 to 5 is noise; a rate moving off zero is not.
  - **One sample in the set was supposed to stay prose, and did.** `oki ha calorie?` — asking what
    a single food costs, in a conversation that happens to be tracking calories — stayed 0 of 3
    after the change. Without that control the result reads equally well as "the model now builds a
    card whenever it sees a number".
  - **The model quoted the mechanism back.** _"ya no necesitas que te vuelva a escribir toda la
    lista cada vez"_ — the rule's own sentence, in the model's words, in the reply that then built
    the canvas. §4.5 records the same tell on `v-bmi`; it is the difference between a rule landing
    and a rate drifting.
- **A trigger rule has a rate, not a verdict.** One run decides nothing (`98 华氏度` reads 0/1 and
  4/5). With ~30% of runs skipping the skill, a nominal three-run test yields about two eligible
  samples — enough to see never→always and nothing smaller.
- **Measure on the models dsh actually runs.** Every number in this section up to 2026-08-24 was
  taken on `macaron-v1-tall`, which is small; a rule that helps it may be patching around the model
  rather than teaching it anything, and is not worth carrying into the prompt for that. The models
  worth optimising for are `macaron-v1-venti`, `macaron-v1-coding-venti` and `glm-5.2`. One eval
  home per model (`~/.dsh-eval-<model>`), and check `settings.yaml` there is a real file rather
  than the symlink the bootstrap makes — otherwise every home shares one model and the comparison
  is between a model and itself.
- **Every rate above was measured on prompts written to test a rule, and real user questions are a
  different distribution.** 11 first-turn questions pulled from the warehouse — a recipe, period
  cramps, protein powder for a child, a comparison of two cell types, "what date was last week
  Thursday" — loaded the skill **3 times and produced one card**. Not one of them asks for an
  interface; they are short, multilingual, and conversational, and the model answers them in
  markdown without ever reaching the decision the skill exists to make. A rule measured at 100% on
  a written prompt can be at 0% here simply because nothing loads it. Sample the corpus, not the
  test set, before believing a trigger number.
- **A corpus turn is unintelligible without the turns before it, and so is the judgement about
  it.** `nah bro that is from today` is a diet-log correction only because the previous ten turns
  were adding up calories; `Yeah. What should Bailey eat?` looks like a nutrition question and is
  the tail of a conversation about complimenting someone's sister. Sampling first turns to dodge
  the problem measures a distribution no user is in — real turns arrive mid-conversation. The
  warehouse carries `previous_ten_turns_summary` beside every row; both the labelling and the eval
  have to use it, the latter as clearly-marked prior context rather than replayed as fake turns
  the model would then believe it had said.
- **`fence=0` has two causes and only one of them is a model getting it right.** Measured on a
  calorie-log turn: six runs across three models each answered with a 7-to-9-line markdown table —
  per-item numbers, a total, a range — and not one loaded the skill. That is not prose winning a
  judgement; it is a card written in the wrong language. `scripts/score-wave.py` counts list and
  table rows in the reply for exactly this reason, because every earlier eval here stopped at
  `fence=0` and recorded it as "no UI wanted".

### 6.3 What the cards get wrong

Screens are pure text predicates over a card's source; `scripts/corpus-rates.ts` prints every rate,
which is why none are transcribed here. The distribution is the finding:

**Two thirds of defective corpus cards fail on accessibility and nothing else** — 117 of 178. The
rest is a long tail of one card each. Cards were rarely broken; they were routinely unusable
without a mouse, because a card is written as a _picture_ of an interface and the author has a
mouse and eyes.

The largest single delta after the rules landed: `:focus-visible` appears in **0 of 378** corpus
cards and in 66 of the first 77 written after. A behaviour absent from an entire prior distribution
cannot appear by sampling luck. `prefers-reduced-motion` went 7/130 → 52/52.

Three things the model has always got right, before any rule existed: capability failure handling
(39/39), `sendMessage` recording its own result (31/31), and never using `100vw` or `position:
fixed` (0 of 378). **The gap was never structure or plumbing** — it was people not looking at the
screen or not holding a mouse.

### 6.4 A checker that has not been fooled is not a checker

Every gate here has been wrong in a way that reported success:

- **`compile-cards.ts` counted failures and never exited on them**, while pointing at a directory
  that no longer existed — crashing with ENOENT and reporting ok.
- **`smoke.ts` registered six effects and ran none of their disposers**, then reported "4 of 6"
  because it counted the two that could not run there as clean.
- **`paint-cards.ts` skipped 120 of 378 cards** for unresolvable imports and printed `ok`, one of
  them a reference card inside `bun run check`.
- **`mutation-audit.sh` could not see a third of the source** (a two-directory glob, `.ts` only)
  and printed "every condition is constrained".
- **`compiler.test.ts` never imported `compiler.ts`** — it re-assembled the pipeline and asserted
  a re-implementation agrees with itself. Blanket-mutating every `return` left it green.
- **A traversal test that could not reach a file** passed with the fence deleted.

So each screen now answers three questions, one test apiece: does it fire on the defect
(`test/cards-negative/`), does it stay quiet on the fix (`screens-quiet-on-fix.test.ts`), and does
any real card exercise it (`screens-exercised.test.ts`). **"No failures" has two causes that look
identical** — nothing is wrong, or nothing was examined.

Two rules fall out. **Write the count of what you skipped next to the result**: every gate that
ever lied did it by omission, never by a wrong answer.

The judge panel's own image budget was a fresh instance, and the worst-shaped one yet: `judge.py`
took the first `MAX_IMAGES` screenshots in order, so on **12% of r002's runs it dropped 148
pictures and left 25 turns with none at all** — every one of them a LATE turn (3, 6-9), because
first-come spends the budget at the start. That is exactly where "a new fork later in the
conversation deserves its own interface" is judged, and the runs that overflow are the longest
ones, so the panel saw least evidence where the model had done most work. Neither the judge nor
the scorer could tell a missing picture from a card that was never built. Fixed by allocating one
picture per carded turn before filling in order (25 blind turns -> 0) and by telling the judge, in
the message, which turns are shown at fewer widths. And **an exemption should be a consequence
of something, not a claim about it** — where that is impossible, print the exempted items, because
a name can be checked at a glance and a number cannot.

### 6.5 Verification has to take the path production takes

Twice the checker and the runtime diverged, once in each direction, and neither showed up as a
wrong answer: `compile-cards.ts` was **stricter** than production (no streaming fallback, so a
working card read as FAIL) and `paint-cards.ts` was **looser** (no normalize, so 18 cards that only
import because normalize repairs them were never rendered). `test/mirrors-production.test.ts` now
fails if a script compiles a whole card without `compileSettled`.

**When a checker and reality disagree, suspect the checker.** An hour went into bisecting a card
that was never broken.

**The screenshot pipeline can only measure a card whose content is in its source**, and that
fraction is falling because the skill is working. Wave 2 was 100% literal data; wave 3 is 5 of 11,
the rest reaching for `usePersistedState` or `$dsh/ai` as the skill asks. A persisted card's shot
is its genuine first-run screen, which is fair. A streaming card's is not: `surface-harness.ts`
now forwards `$dsh/ai` to a real model (501, never a canned success, when no key is configured),
but the shot is taken a second after mount and glm-5.2 spent **7432 reasoning characters before
its first content token**, so the picture is the loading state. Two settle heuristics were tried
and both reported success on the spinner — three equal heights (the loading panel is the same
height as the list that replaces it) and height+text-length (nothing had started, so stillness
before and stillness after are identical samples). `judge-cards.py` therefore skips any card
importing `$dsh/ai`, by name. Canned data is worse than exclusion, not better: these cards feed
the stream to a `partial-json` parser against a schema their own prompt declares, so a generic
`{items:[…]}` fills one field per row and photographs as a layout defect.

The layers, and what each can see:

|                                       | catches                             | cost                   |
| ------------------------------------- | ----------------------------------- | ---------------------- |
| screens (`screens.ts`)                | known defect shapes in source       | 0.27ms for all of them |
| `compile-cards.ts`                    | syntax the model cannot ship        | ~2s / 378 cards        |
| `paint-cards.ts` (`react-dom/server`) | 7 of 9 blank-render causes          | ~2s, no browser        |
| `render-cards.ts` (Chromium)          | the other 2 — React #321, effects   | minutes                |
| `mount-card.sh`                       | what a card _announces_ (a11y tree) | ~15s / card            |
| `judge-cards.py` (5 vision models)    | **what it looks like**              | ~2min / card           |

The expensive one is what proves the cheap one looks at the right thing. Compiling proved 375 of
378 fine; mounting found 10 failures; a screenshot found a reference card whose 4×4 board had every
cell overlapping the next by 91% — clean under 30 screens, painting, announcing correctly.

### 6.6 The judge panel is a source of hypotheses

Five vision models grading six screenshots per card (320/440/720 × light/dark) plus the TSX.
**No card scored above 6 of 10.** They agree on rankings, and on 2048 all five independently found
the overlapping board, three of them finding more than I had.

Of their four recurring criticisms, **one survived checking**:

| theme                            | verdict                                                  |
| -------------------------------- | -------------------------------------------------------- |
| the slider is unstyled           | **right** — 43 of 52 corpus cards, and no rule existed   |
| border + background is redundant | wrong for these tokens — light paints every layer `#fff` |
| 720 is a dead single column      | sampling — the set had nothing to put in columns         |
| dark is light inverted           | false premise — cards reference tokens, not palettes     |

**Wave 2 is 26 runs, not 72, and they are all one family.** `score-wave.py` counted files, and 46
of that wave's 72 said `stale  src/ is newer than lib/` — runs that never reached a model, each
scored as `skill=no card=no`, i.e. as the model deciding against a card. Corrected, the wave reads
**26 runs, skill 100%, cards 100%, markdown-instead 0%, turns 00-03, every one of them 饮食**. So
no cross-family or trigger-rate claim can come out of wave 2 at all; what survives is everything
derived from the 26 cards themselves (the panel below, the screenshots, the paired `text-base`
delta, the reflow ratios). Both the runner and the scorer now test for eval.sh's one success
shape (a line starting `skill=`) rather than enumerating failure strings — the leak that started
this was `bash: ./scripts/eval.sh: Operation not permitted`, which is on nobody's refuse-list —
and the scorer prints every excluded run by name, because a count of skipped runs can only be
believed where a list can be checked.

**Second run, wave 2** (24 cards, 117 scored verdicts, mean 5.45 sd 0.94). No ranking claim:
the three generators land at 5.12–5.67 with SE ≈0.15, judge self-variance is ≈2.0, and 6 of the 8
overflowing cards belong to the lowest-scoring family, so its mean is confounded with a defect
that turned out to be mine. What the panel was worth was its _prose_:

| theme                                                   | verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bg-layer-2` melts into the card in light, fine in dark | **right, and not a card defect** — measured `#ffffff` for all three background tokens in light. Recorded in §3.7; the model cannot know it                                                                                                                                                                                                                                                                                                                                                                          |
| `max-w-[34rem]` wastes 180px at 720                     | **half right.** Four judges got the fact from the SOURCE while I read the same screenshot and saw a full-bleed form — the clip is taken at the host width, so unused width has no visible edge, and `shot-card.mjs` now reports `UNUSED`. But the _verdict_ was wrong on the card I then looked at: five meal rows stretched full-bleed put a name and its number a screen apart, which is exactly what §Width's `max-w-[28rem]` rule exists to prevent. Unused width is a signal to look, not a defect to minimise |

**The `text-base` fix, measured against its own control.** Re-shot and re-judged wave 2 — same 27
cards, same source, same five models, only the rendering fixed — and split the cards by whether
they write `text-base`:

|                              | n   | mean delta       |      |
| ---------------------------- | --- | ---------------- | ---- |
| cards that write `text-base` | 12  | **+0.45 ± 0.16** | 8 up |
| cards that do not            | 10  | −0.01 ± 0.08     | 4 up |

The control group did not move at all, and several of its cards drew the _identical_ score from
every judge twice. That is what makes the +0.45 readable: the panel's spread is ~2.0 and the
pooled delta was a meaningless +0.23, but paired and split by exposure it separates cleanly.
`scripts/judge-delta.py` does the paired read and refuses to call anything significant below 2 SE.

**A row split wide is not a defect — measured, and it looked like one.** Two cards for the same
food-log turn, from two models, both 5.5/10, both put a meal name at one edge and its kcal at the
other with 400px of 720 between them. That is the failure §Width already names, so it read as a
rule that exists and is not landing. `shot-card.mjs` grew a `STRETCHED` probe to count it, and the
count says otherwise: of wave 0's 22 cards the 9 it fires on average **6.08** and the 13 it does
not average **5.96**. The widest split in the wave — 4 rows at 567px of 720 — scored 6.62, above
the median; the wave's worst card at 1.25 is not flagged at all, because it threw before rendering
anything to split. An ingredient table at 455px reads fine, because its quantities line up as a
right-aligned column the eye runs down; a food log at 407px does not, because there is nothing to
run down. Geometry cannot separate those, and the two cards that started this were marked down for
empty vertical bands and thin content — the stretch came along for the ride. The probe stays as a
signal to look at, on the same footing as `UNUSED`; it is not evidence for a prompt rule.

**Which judge, measured — the panel is four rulers, not four opinions.** Waves 0 and 1 on the
rebuilt corpus (45 cards with all four judges, 180 scored verdicts) give a mean of 6.01 and 6.50.
The between-wave gap is the noise floor, not a result: same prompt, different questions, 0.5 apart.
What is stable is the _offset_ — every pair holds its direction on 38 to 43 of the 45 cards:

| pair                                 | mean delta | sd   | same direction |
| ------------------------------------ | ---------- | ---- | -------------- |
| `claude-opus-5` − `grok-4.6`         | −0.11      | 0.71 | 38/45          |
| `claude-opus-5` − `gpt-5.6-sol`      | −0.62      | 0.82 | 42/45          |
| `claude-opus-5` − `gemini-3.7-flash` | −1.11      | 0.92 | 42/45          |
| `grok-4.6` − `gpt-5.6-sol`           | −0.51      | 0.69 | 43/45          |
| `grok-4.6` − `gemini-3.7-flash`      | −1.00      | 0.88 | 43/45          |
| `gpt-5.6-sol` − `gemini-3.7-flash`   | −0.49      | 0.73 | 40/45          |

Strictness runs `claude ≈ grok < gpt < gemini`, and it is a property of the judge, not of the card.
So a wave whose per-card spread is 2.0 is not a wave of controversial cards — reading it that way
was a wrong call made here once. The number that carries information is the PAIRED delta, whose sd
is 0.7–0.9 against a between-wave swing of 0.5 in the pooled mean: with the panel held fixed, a
paired read sees effects the pooled mean cannot. Absolute scores are worth nothing on their own.

The panel's cache used to key on `md5(model + card + SOURCE)`. That is wrong for a check whose
whole input is the images: the `text-base` fix changed how every card rendered without touching a
byte of source, so a rerun would have replayed 117 stale verdicts at full confidence and I would
have compared a fix against itself. Keyed on the image bytes now.

Four probes now report what the eye cannot, in `shot-card.mjs`: `OVERFLOW` (content past the
card's right edge), `CRUSHED` (a control narrower than its own label), `UNUSED` (width the card
declined to paint), and `FLUSH` (text sitting against the host edge — a card whose root has no
padding, where the other three are all silent because nothing goes PAST the host, the content is
flush TO it). `FLUSH` measures **text-bearing leaves only**: the first version measured every
element and fired on the control too, because a card's own root div is supposed to fill the host
and a perfectly-padded card still has a 0px-from-edge container. **Each was verified to fire on a case that should fire AND stay silent on one
that should not** — the first `UNUSED` was silent on the very card four judges flagged, because
`.ui4a-root` is a full-width wrapper and "furthest painted right edge" always found it at the host
edge. A probe that reports nothing looks identical to a clean wave.

The general lesson is the one the second row states: a screenshot clipped at the host width cannot
show overflow (the lost strip is absent, not cut) and cannot show unused width. Reading the images
myself and having five models read them is not redundant — they fail differently.

**Two of wave 2's three biggest defects were in my own config, not the model.** `box-sizing` was
missing from the scoped preflight (every text field 10px past its own edge, at _every_ width — the
tell that it was never a breakpoint bug), and the colour named `base` was shadowing `text-base`
(§3.7). Both times my first instinct was to write a prompt rule teaching the model to work around
it. A defect that reproduces identically at 320, 440 and 720 is nearly always infrastructure;
check the config before spending prompt budget on it.

**Reading all 29 wave-2 cards myself found what five vision judges did not: a contrast failure.**
20 of 29 write `bg-accent text-white` — the primary button, every badge. Measured on the live
harness in both themes, that is **2.66:1 in dark**, against 4.5 for the 10px text it is usually
applied to. No judge mentioned it in 117 verdicts; they grade composition, and contrast is
arithmetic on two computed colours. It is also invisible to all four probes.

The cause is structural, and the host had already solved it: `accent` flips WITH the theme (dark
gets the _lighter_ blue), so any foreground that also flips with the theme moves the same
direction and the gap closes. `--dsw-alias-label-primary-foreground` flips against it — 4.23
light / 7.11 dark — and a tinted ground (`state-business-tertiary` + `label-primary`) does better
still at 16.04 / 9.79. `test/probes/badge-contrast.ui4a.tsx` renders all four spellings side by
side so the claim is checkable by eye.

**I found that only after reading the token table instead of my own notes.** The authority is
`@deepseek-ai/dsh-client-ui-theme/lib/styles/` — `design-platform.css` carries **162 colour
aliases** (`body` = light, `body[data-ds-dark-theme]` = dark, over a static scale), and the **30-step
type scale is in `gradient-shadow-text.css`**, a filename that says nothing about it. `uno-config.ts`
maps **12 of the 162**. Whole groups are unreachable from a card: the host's own button recipes
(15), the secondary and tertiary steps of every status colour (7), `label-tertiary`/`caption`
(7), `markdown-*` prose styling (8). Checked the harness fixture against that table: the 162 agree
exactly, so every contrast figure here stands, and none of the five sheets styles a bare element
— which is why a harness screenshot is faithful on colour and type. **Before reasoning about a
design system, read its table**; I spent an hour computing against 13 values transcribed from
memory and was one edit from inventing a name for a token the host already publishes.

One more, from the same read: Wind4's line-height for `text-sm`/`text-xs` is **2px tighter** than
the host's own (20 vs 22, 16 vs 18), and those two sizes are **74% of all font-size uses** in
wave 2. Fixable in `theme.font.*`, no prompt rule needed.

One in four is the hit rate a first-pass regex gets here, for the same reason: a criticism is
generated from a principle, and the principle assumes a context. Still worth its cost — the one
that was right had gone unnoticed through 378 cards and 30 screens.

**The slider criticism outlived the rule written for it, twice.** A rule teaching the overrides in
a `<style>` block produced a card that put the class on the `<input>` and wrote
`.r input[type=range]` — asking for an input inside the input, so nothing matched and the OS-blue
track shipped anyway. The utility syntax fixed that by attaching the selector to the element, and
then the SAME control failed a third way: the model correctly wrote both `-moz-` and `-webkit-`
prefixes, UnoCSS merged them into one rule, and Chromium discarded the pair (§2.5). Three
mechanisms, one symptom, and each one only visible in a screenshot or a `getComputedStyle` call.
**When a defect survives the rule aimed at it, the next question is whether the rule was even
reaching the element** — not how to word it better.

### 6.7 Traps that stayed true

Audited the whole of §4 against reality. **Every rotted citation was an identifier** — a package
name, an error code, a slot name, a number — and every entry that survived cites a _behaviour_ you
can reproduce with a build, a fetch, or a type query. An identifier goes stale silently; a
behaviour cannot rot without something breaking. When writing one down: **name what you did and
what happened, and cite the identifier only as a pointer to it.**

Two were simply wrong. The `console.error` refcounting trap **cannot happen** (no yield point
between the swap and the `finally`), and the wasm leak is **~16MB per HMR round, not 2.5MB** — that
figure was `tsx_bg.wasm`'s size on disk standing in for a memory measurement, off by six times and
in the direction that makes the leak look tolerable. **An unreproduced trap is a standing
instruction to do unnecessary work.**

### 6.8 Working on this project

The six general process rules live in [CLAUDE.md](../CLAUDE.md#working-on-this-project) — commit as you verify, mechanise anything you have done twice, name and close what you start, keep evals at concurrency ≤3, never let a fixture supply its own subject, and read one card by hand before believing a surprising result. What follows here is the rest: the eval- and wave-specific rules, each with the measurement that earned it.

- **Order the refusals by what they cost, not by where the thing they protect lives.** The
  stale-`lib/` check was written directly above the snapshot it guards, which reads well and put
  it AFTER the live probe — so a tree that could not be measured still spent one real model call
  per upstream before being turned away, which is the exact waste the guard exists to prevent. It
  costs two `stat()`s; it belongs beside the other millisecond refusals. Two smaller things from
  the same edit: the mtime was being `stat()`ed inside the comprehension, once per source file for
  a value that never changes, and the FIRST read of `lib/` in the script is the fingerprint, not
  the guard — so an existence check added later in the file still crashed with a bare
  `FileNotFoundError` on a fresh clone, where `lib/` legitimately does not exist yet because it is
  built by `prepare` and not in git. **A precondition has to sit before the first use, not before
  the use you were thinking about.**
- **A guard that cannot pass is indistinguishable from a subject that is broken.** `eval.sh`'s
  staleness check read the profile symlink with `readlink`, which returns the target VERBATIM —
  and pnpm writes a RELATIVE one, relative to the symlink's own directory. Resolving it against
  the CWD therefore failed silently: `cd` errored, `pwd -P` produced an empty string, and the
  comparison could never match, so a correctly-linked checkout reported `stale` and every eval
  exited 4. The suite's own timeout test had been failing on it. Resolve a symlink from the link,
  never from wherever the script happens to run. The general shape is the one 6.4 states from the
  other side: a gate that always fires and a gate that never fires are both gates that measure
  nothing, and only the first one announces itself.
- **A measurement in flight owns its inputs, and this is the easiest rule here to break.** Broken
  three times in one session: `waves.json` regenerated while a wave was reading it (48 of 72 runs
  lost, and the surviving 24 looked like a complete wave), `lib/index.js` rebuilt mid-A/B by a
  stray `bun test`, and a `pkill` aimed at one batch's leftovers that killed the batch that had
  just started — five runs cached as `crash/nosession`, which reads exactly like the real
  "0 cards" answer. Each one is invisible in the numbers. The three defences that work:
  **snapshot the inputs into the run's own directory**, **fingerprint `lib/index.js` and
  `lib/client.js` separately** (a prompt change invalidates the run, a render change only means
  re-shoot), and **never cache a result whose text says the process died**.

  Broken a fourth, fifth and SIXTH time since, and the escalation is worth following because each
  fix was correct and each was too shallow. First: **`bun run build` refuses while a wave runs**
  (`--force` to override) — which stops the rebuild but not the EDIT, and `eval.sh`'s mtime check
  then calls every in-flight run stale. Wave 5 lost 27 of 72 that way while `$dsh/web` was being
  written in another window, with the build guard working perfectly the whole time. So the real
  fix is one level down: **a wave now FREEZES the plugin into its own directory** (`waves/wNNN/
  plugin`) and repoints each eval home's symlink at it, restoring them in a `finally`. `src/` is
  then free to move — the thing the wave reads is a copy nothing writes to. `eval.sh` recognises
  such a link and skips both mtime checks (a frozen copy cannot go stale) while still refusing a
  link to any OTHER checkout, which is the failure that guard was written for.

  The general shape: when a guard keeps firing correctly and work keeps being lost anyway, the
  guard is on the wrong noun. Guarding the ACTION (building) needed a list of every way to reach
  the artefact; guarding the ARTEFACT (what the run reads) needed one copy.

  **The freeze covers what the MODEL reads, not what the HARNESS reads, and the second gap is
  still open.** `drive.py` spawns `REPO/eval/card-driver.mjs` — the live file, respawned for every
  run — so an edit to the probe mid-round measures the remaining cells differently from the ones
  already done. Met once for real: an SVG-overflow fix landed while r006 was running and had to be
  reverted, because 26 of 208 cells would have been measured by a different instrument than the
  rest. Until the driver is frozen too, the rule is simply **do not touch `card-driver.mjs` while a
  wave runs** — and note which harness files are safe, because most are: `wave.py` imports `cases`,
  `drive` and `judge` once at start, so Python has them cached and editing those three mid-round
  changes nothing. Only the file that is _spawned_ per run is live.

  The fix is deferred rather than forgotten, and the reason is worth keeping: implementing it means
  editing `card-driver.mjs`, which is the one file the rule forbids touching while a wave runs. It
  also cannot be a plain copy — the driver locates playwright relative to its own `import.meta.url`
  (§6.1), so a copy landing anywhere without the right `node_modules` neighbour fails inside
  chromium, which is the bug that has already been fixed twice.

  **A third gap, found by walking into it: a RESUME re-reads `cases.py`.** The safety above —
  "`wave.py` imports `cases`, `drive` and `judge` once at start, so editing them mid-round changes
  nothing" — is true only of the process that is running. r007 died at 24/300 and the process that
  resumed it imported the case list as it stood then, which by that point had three cases added
  while the round ran. The round silently became 30 cases instead of 27, and rewrote its own
  `manifest.json` to agree. Adding was harmless; **changing an existing case would have split the
  round between two versions of it with nothing in the output naming which cells got which.** So
  the rule for a resumable round is stricter than the rule for a running one: **the case list is
  part of the round, and belongs in the freeze beside `lib/`** — until it is, do not edit
  `cases.py` between a round's start and its final read, not merely while its process is up.

  Also still true: **`bun run build` refuses while a wave is running** (`--force` to override). Both later breaks
  were the same shape — an unrelated edit, a reflexive rebuild, and a wave whose verdicts mix two
  prompts. Note the second-order effect the first time you meet it: with the build refused, `lib/`
  stays at whatever it was, so a _test_ failure or a smoke error right after an edit may be
  reporting the OLD bundle. Read the build's own output before diagnosing the failure.

- **A wave that cannot measure anything must refuse to start, not finish instantly.** `eval.sh`'s
  guards exit 4 in milliseconds, so waves 5-9 once reported `WAVE DONE … 72 runs` across four
  seconds — 360 files all reading `stale`, and a reflection written about them. `run-wave.py` now
  probes before spending anything, and the probe is a **real turn against each model home**, not a
  stubbed one: the static guards only check that the credential variable is _set_, and a key that
  is set but rejected produces `AUTH: 401` on all 72 runs while the wave still reports DONE.

  **It has to keep refusing after it starts, and that half paid off first.** r007 was 24 runs in
  when macOS revoked the Desktop grant mid-round: `dsh` could no longer read the overlay file in
  `eval/`, and three runs died in 0.1s each without reaching a model. `wave.py`'s in-flight guard —
  three quick deaths in a row aborts the round — stopped it there instead of burning the remaining
  246 cells into `error`, finished the four runs already in flight, and left 21 cached. Resuming
  cost nothing: `complete` and `timeout` are cached, so the restart picked up at 21 with the frozen
  plugin untouched.

  The weak link was the cleanup, not the guard. `finally` ran `lock.unlink()` FIRST, that raised
  `PermissionError` from the same revocation, and everything after it — restoring ten model homes
  from the round's frozen plugin — never ran. Two rules follow, both now in the code: **restore in
  order of what is expensive to get wrong** (a stranded symlink silently changes what every later
  `dsh` loads; a stranded lock only refuses to start and says why), and **guard each cleanup step
  separately**, because one raising skips all the rest.

  **A fix that slows a failure down disables every guard that keyed on how fast it was.** The
  in-flight guard above counted a run as stillborn when `elapsed < 1` — true of a dead boot that
  returned in 0.1s, and the natural way to write it. Then `drive.boot` learned to retry a boot that
  dies before announcing a port, which turned the same failure into a 30-second one. The guard
  stopped counting them, and the next Desktop-grant outage — thirteen minutes, not the seconds the
  retry was sized for — **burned 85 cells with nothing stopping it**. Both halves were mine, an hour
  apart, and each was correct alone.

  The guard now keys on `turns == 0`: the model was never reached, which is what "stillborn"
  actually means and is the one thing no retry can change. **When you add a retry, go and read
  every guard that watches that failure** — a retry does not only change how often a failure
  happens, it changes its shape, and anything downstream that recognised the old shape is now
  blind. The retry itself was resized to ~90 seconds, which is the honest split: absorb a flap,
  and let the guard abort an outage.

- **An eval home reads its gateway key from an env var, and unset it hangs rather than fails.**
  `apiKeyEnv: LITELLM_24000_API_KEY` in each `~/.dsh-eval-<model>/settings.yaml`; with it unset,
  dsh starts, opens a session and sits there — process alive, connection open, nothing returned,
  nothing logged. A wave of 72 spent itself that way and was diagnosed as the upstream stalling,
  which looks identical. `eval.sh` now refuses with `nocreds`, alongside its two existing guards.
  The key is the `master_key` in `~/litellm_config_24000.yaml` on sd (`m sd` prints the ssh line);
  it is **not** the `:4000` one, and it lives in the shell that launches the wave, nowhere else.
- **A multi-turn case runs as long as its persona WITHHOLDS, not as long as its script.** Every
  case in `eval/cases.py` declares `turns: 10` and the median run is **6**; the spread across
  cases is 3 to 10 and it lines up with one property of the opening line. `cron-read` opens with
  the whole problem in it (`*/17 3-5 * * 2 这个 cron 到底几点跑？`) and scripts two later forks —
  median **3 turns, 0% reach 10**, on 8 of 10 models. `resume-fix` opens with `帮我改改简历`,
  naming neither the job nor the résumé, and scripts one fork — median **10, 74% reach 10**. So
  the lever is not more scripted beats; it is an opening the assistant cannot act on without
  asking. The five cases to rewrite are the ones below median: `cron-read` (3), `aa-split` (5),
  `palette` (6), `sort-learn` (6), `api-shape` (7).

  Two things this also says about the numbers already taken: a per-case turn count is a property
  of the FIXTURE, so comparing models on it measures nothing — and `later_card` ("a card at turn
  3+") is scored against conversations that mostly end at 6, which is a much weaker test of the
  "a new fork deserves its own interface" principle than it reads as.

### 6.85 Match the host, and measure it rather than assuming it

Three "looks bolted on" complaints in one session all turned out to be one thing: the card is
styled against a design language nobody measured. The host publishes the answer; read it.

- **Weight.** dsh web uses exactly two: measured on a live window, **54 of 61 visible text nodes
  at 400 and 7 at 500, none at 600 or above**. The generated corpus does the opposite —
  `font-semibold` **246 times**, `font-bold` 6. A card therefore lands a whole step heavier than
  every surface around it, which is most of what "inconsistent" means here. The prompt now says
  body default, `font-medium` for emphasis, and that `font-semibold`/`font-bold` have no
  counterpart in this app at all.
- **Hairlines the host does not draw.** The panel had a `border-l1` under its title bar and under
  its tab strip. dsh web's own conversation header (`wSkVaW_header`) computes
  `border-bottom-color: rgba(0, 0, 0, 0)` on a transparent background with no box-shadow — it
  separates itself with 76px of height and nothing else. Two lines across a panel inside that same
  frame read as chrome the app does not have.
- **`bg-base` is the page's own colour.** Light `#fff`, dark `#151517` — the same value the
  transcript behind the card is painted with. A wrapper painted with it draws nothing visible: an
  invisible 16px inset and a rounded corner nobody can find, while the `bg-layer-1` blocks inside
  read as the real frame. A frame inside an invisible frame.
- **A rule in the skill only fires where the skill is loaded.** The `Sparkles`-is-slop rule has
  been in the skill for a while; a real dsh web session still produced a `Sparkles` header, because
  the model never loaded the skill (the `skill` tool call landed at seq 190, after the user asked
  for a card in so many words). Measured: `icon`, `lucide`, `Sparkles` appeared **zero times** in
  the prompt. Anything decided in the first thirty seconds belongs in the prompt, with the
  reasoning left in the skill.

  This also explains a corpus rate that looks like a dead rule: an AI-slop icon rendered beside a
  heading is **1 of 378 cards (0.3%)**. The corpus is Macaron production, where the skill is always
  loaded — the population where the rule fires is the one the corpus does not contain. Do not read
  a low corpus rate as "the rule does nothing" without asking which environment the corpus samples.

**After the three rules shipped**, wave 5 measured the same corpus questions on the same three
models — 45 verdicts:

| wave     | `font-medium` | `font-semibold` | `font-bold` | semibold share |
| -------- | ------------- | --------------- | ----------- | -------------- |
| w000     | 33            | 26              | 0           | 44%            |
| w002     | 67            | 54              | 3           | 44%            |
| w003     | 117           | 80              | 2           | 40%            |
| w004     | 102           | 118             | 2           | 53%            |
| **w005** | **76**        | **0**           | **0**       | **0%**         |

Over the same 45 cards: AI-slop icons rendered **0**, wrappers painted `bg-base` with a radius
**0**. So all three went from a stable 40-53% (or a known-present defect) to absent — which is
what a rule looks like when the model simply did not know the constraint, as opposed to one it
keeps breaking under pressure. Worth remembering which kind this was: the earlier design rules
that needed eight rewrites were fighting a habit; these three were filling a gap.

Two process notes from the same wave. **27 of 72 runs were `stale`** because `src/` was edited
mid-wave (again — see 6.8), so the measurement is 45 verdicts and not 72. And **40 runs were kept
that the old guard would have discarded**: the split stale check reported them as
`note: src/client/ …`, a render change that leaves the verdict standing.

### 6.86 Sampling more models, and what the gateway will not give you

A wave sampled three models from two families, which makes every result a claim about those
families. It now samples six across six upstreams — `macaron-v1-venti`,
`macaron-v1-coding-venti`, `glm-5.2`, `gemini-3.7-flash`, `grok-4.6`, `gpt-5.6-terra` — for two
reasons, and the second is the one that matters. **Throughput**: `macaron-v1-*` share a backend
capped at 3 concurrent, so a wave whose work is mostly theirs runs 3-wide however many workers
exist (wave 5's retry: 27 macaron jobs, ~25 minutes, every other slot idle). One semaphore per
upstream and `3 × len(upstreams)` workers took in-flight calls from 6 to 18. **Evidence**: the
weight rule going to zero on three models was suggestive; holding on Gemini, GPT, Grok and GLM
too — measured on wave 6's first 21 verdicts, `font-medium` 75/3/12 and `font-semibold` **0**
everywhere — is a rule about the constraint rather than about one family's habits.

Three things this cost, all worth knowing before adding a model:

- **Each model needs its own eval home** (`scripts/eval-home.py <model>`), whose `settings.yaml`
  is a REAL FILE naming one model. Symlinked back to the shared home, setting one home's model
  sets every home's and the wave measures one model N times while reporting N.
- **No Anthropic model can be sampled here.** The headless profile composes `tool-web`, and every
  `claude-*` on this gateway answers a request carrying it with
  `The use of the web search tool is not supported` (400). Measured on sonnet-5, sonnet-4-6 and
  opus-4-8 — a gateway capability gap, not a model one.
- **`reasoningEffort: low` does not work yet, and would be worth having.** dsh rejects the field
  with `UNSUPPORTED_REASONING_EFFORT` unless the model ENTRY declares `reasoningEfforts`, and none
  of the seven do. Declaring them means writing each provider's own wire value, and a wrong one
  sends the gateway a parameter it will not understand. `EVAL_EFFORT=…` is wired and off.

  The probe that "confirmed" all six supported it was measuring nothing: it used `timeout 60`, and
  **macOS has no `timeout(1)`**, so every command failed at the shell and every model came back
  `ok`. Same class as the build-vs-test artefact confusion in 6.8 — a plausible result from a
  measurement that never ran. `command -v` the tool before trusting a loop built on it.

### 6.87 Errors that reach only the reader teach the model nothing

`onError` had no consumer: a card that failed to compile painted a red panel and the model never
learned anything. Measured on a real session — the surface reported _"'modern-monaco' has no
export named 'MonacoEditor'; module exports: Workspace, errors, hydrate, init, lazy"_, which
contains the fix, and the records after that point mention `MonacoEditor` six times and
`no export named` **zero**. The reader saw the answer; the one party who could act on it did not.

`report-error.ts` now sends it back through `conversation.send`, and the constraints are all
load-bearing: only errors that survived settling and retries (`GenUISurface` already separates
those), **once per message** (a settled card that fails re-renders on every later frame, and a
message per render is a loop the user has to kill), **announced as automatic** (the model is
about to read a user-role message nobody typed; without saying so it apologises to a person who
said nothing), and **only for the transcript's last ui4a segment** — an earlier card that cannot
render keeps failing for the rest of the session and the model cannot edit a reply it has sent, so
`isLastSegment` gates both the report and the retraction. Same predicate on both: a card that may
not report a failure may not clear someone else's either. Verified end to end in a browser: the card failed, the `[自动]` message appeared
16.5s later, and the model replied _"its actual exports are Workspace, errors, hydrate, init, and
lazy … instead of using the named import I assumed existed"_.

### 6.88 A repaint is not a recovery, and a cancelled report must stay reportable

The reporting above shipped with two defects that cancelled each other into silence, and both were
found by review rather than by use — which is the point: the failure mode is _nothing happening_.

- **`partial-react` answers a render throw by repainting the LAST GOOD component**
  (`runtime.ts:416-419`, whenever `preserve` is on — which is every INLINE card, since
  `GenUISurface` defaults `preserveState` to true; canvases pass `false`, so the bug was invisible
  there). That repaint fires `onRendered` about 16ms later, and `cardRendered()` treated it as the
  card being fine — cancelling the report the very same throw had armed. So the one case the
  feature exists for, a card that worked and then broke on an edit, showed the reader stale content
  and told the model nothing. `cardRendered(restored)` now takes the distinction, and
  `GenUISurface` sets it from a ref the render throw wrote a tick earlier.
- **The dedup key was claimed when the timer was ARMED, not when the message was sent.** Cancelling
  is the normal path, so a cancelled report still burned its key: the same failure on a later edit
  reported nothing at all, twice. Claim it inside the timer.

Both are the same shape as §6.4's rule about gates — _"no failures" has two causes that look
identical_ — one level down: **a callback named for the happy path will be called on the sad one
too, if the recovery goes through the same code.** Ask what the library does about an error before
deciding what its success callback means.

### 6.89 What dsh gives you, and one seam that does not fit

Read `deepseek-ai/deepseek-harness/docs` before hand-rolling: `capability-seams.md` is the index of
every `ctx.*` service, and `defensive-patterns.md`'s first rule ("report orthogonal outcomes
independently — `timedOut`, `signal`, `exitCode`") is the same bug class as the card that renders
"no matches" for a search that was killed at 15s.

- **Settings are a seam, not a config field.** `installSettingsSection(ctx, ns, schema, entry,
  hooks)` from `@deepseek-ai/dsh-settings`, with `Config` a **schemastery** `z.object(...)` — not a
  TypeScript interface, which compiles to nothing and leaves the host with no schema to validate
  or render. The whole helper sits inside `ctx.inject(["settings"])`, so on a host without that
  service `onChange` never fires: mount once explicitly as well, and dedup so a host that _has_
  settings does not mount twice. `dsh --profile headless` is such a host, and getting this wrong
  costs the entire plugin there.
- **`ctx.approval` is the right question and the wrong seam for a card.** It answers "may this
  specific action proceed?", `tool-bash` consumes it, and it fails closed. But `request()` takes an
  `agent` and throws outright without an open turn — _"approval.request() outside an open turn …
  Ask from inside the turn that needs the decision."_ A card's command fires on the reader's
  keystroke, long after that turn ended. `ctx.userQuestions.ask()` does work outside a turn (its
  `agent` is optional), so a per-command prompt is buildable — what stops it is that a card runs
  one command per keystroke, and a dialog per keystroke is not a safety feature. Hence a
  capability-level setting plus the session's own sandbox policy per command.

### 6.90 The canvas tab, measured

This table used to claim `conversation.view` as a "Canvas view tab". **That row never existed in
code** — measured 2026-09: `ctx.slots` appears **zero times** under `src/`, and `dsh-client-ui-slots`
was a peer dep nobody imported. Canvases were a DOM portal instead (§3.6). The row is gone rather
than corrected, because the claim was load-bearing for a reader: it said the canvas was already a
first-class host surface, which made the hand-rolled column look like a stopgap nobody got round to
replacing rather than the only thing on offer at the time.

**What the old panel had to do by hand, and no longer does.** Three entries below used to be traps
in their own right; each is now the tab system's job rather than ours, kept here so the next reader
recognises why the code that answered them is gone.

- _File links go to the OS._ They used to: `workspaces.openPath` opened a canvas in an editor, so we
  wrapped it. Measured 2026-09 on 0.2.x: `dsh-client-ui-chat` routes file links to
  `ctx.sidebarRight.openResource(url)`, so the wrapper is deleted — the host now opens the canvas as
  a tab, which is what the wrapper was faking.
- _Closing must leave a way back._ A panel fed by the transcript stranded every canvas it did not
  show, so there was a `CanvasLauncher` listing workspace ids. Tabs persist and the file tree lists
  `.dsh/ui4a/canvases/`, so reopening is a click on the file.
- _The panel cannot be a flex child of AppFrame._ True and load-bearing while we drew the column: the
  host's widths fill the viewport exactly, so an inserted column laid out offscreen. It is moot once
  the host draws the panel — the sidebar is its own flex participant.

**Verified end to end on 2026-10-14, on 0.2.x.** The one thing static analysis could not settle was
whether `sidebarRight` / `sidebarRightTabs` / `slots` reach a _third-party_ client ctx at all — §4's
`settings` is exactly the service that exists for built-ins and is withheld from us. They do, and
the measurement is the plugin's own startup: `dsh-generative-ui/client.js` and its
`tsx_bg.wasm` both load, the 5-second "no right Sidebar" warn **does not fire**, and the tab type
takes effect. Then a real `label-audit.ui4a.tsx` in the workspace's `.dsh/ui4a/canvases/` opened
from the **host's own file tree** into a tab named `label-audit` beside `文件` — and the body
rendered the live app (its stats, its filter tabs), not documentpreview's source listing. So the
`extension` band does beat the product's `fallback` catch-all in a real host, which is the whole
reason to register as a tab type rather than keep drawing a column.

**Auto-open has two paths, and only the first one was obvious.** A canvas the transcript names — a
`write` whose arguments carry a canvas path — is opened from `collect.ts`. But 29 canvas writes in
the corpus are made by _executed code_ (`p.write_text(src)` with the path built from a variable), so
`collect.ts`, which classifies by argument shape, cannot see any of them; in 27 the path is a
variable. Those go through `OPAQUE_WRITE` — the code text mentions `canvases` — and the sweep asks
the directory listing again, opening whatever **appeared** since the last one. The first listing is
a BASELINE and opens nothing: a workspace already holding seventeen canvases must not get
seventeen tabs. The 17-canvas case is real, and it is what the old `CanvasLauncher` was listing.
