# Prompt rules: what the 40-prompt rounds established

Moved out of [CLAUDE.md](../CLAUDE.md) — the evidence and the per-round narrative. The rules this
produced are not here: they live in `src/prompt.ts` (resident, every turn) and the packaged
`skill/SKILL.md` plus `skill/references/` (on demand, registered by `src/skill.ts`). Where anything
here disagrees with those or with CLAUDE.md, they win.

See also [measuring.md](measuring.md), which generalises these rounds into a checklist.

## 4.5 Why the trigger belongs in the resident layer, not the skill

The finding this section exists for: **a skill the model never reads may as well not exist**, so the
signal that says "this wants an interface" has to sit in the layer that rides every request. The
evidence is below, kept because the rules it produced are still load-bearing; the per-round narrative
is in [docs/measurements-log.md](docs/measurements-log.md).

Ran 40 prompts through `dsh --profile headless "<prompt>"` (20 inline, 20 canvas), reading `tool/call` and
`reasoning-chunks` out of `~/.dsh/sessions/<cwd-key>/session-*/session.jsonl.zstd` to look at the **process**, not
just the artifact. headless is the right channel for this kind of batch: one process per prompt, cwd-isolated
sessions, concurrency via `xargs -P` (`jobs -r` doesn't report in a non-interactive shell — don't use it as a gate).

The result was an almost perfect correlation:

| 20 inline prompts      | count | produced UI |
| ---------------------- | ----- | ----------- |
| loaded the skill       | 10    | **9**       |
| did not load the skill | 10    | **0**       |

(When counting fences, accept three backticks or more — that's how `segments.ts` parses. Counting only four misses
the ones where the model wrote 3/5/6/8.)

Of the 20 canvas prompts: **20/20 loaded the skill**, 19 wrote a correct `ui4a/canvases/<id>.ui4a.tsx` with
`height:100%`, and the remaining one ("a chat UI demo") judged it inline — its reasoning quoted the skill verbatim
("would the user want this again in ten turns?"), and it judged right.

**That sentence is no longer in the skill**, and this paragraph is kept as the record of what the model read at the
time rather than as current guidance. The tell it quotes asks whether the CONTENT is worth keeping, which is yes for
anything reference-shaped: measured on `cron-read` — a lookup with one right answer — models opened a canvas 5 times
in r005 and 6 in r006, and one did it for "什么是闭包？". A real session, with the skill loaded, wrote
`claude-code-2-1-251.ui4a.tsx` for "what changed in this release". The skill now asks whether the USER asked for
something durable, and the resident layer carries the default (§ Canvas in `prompt.ts`): a canvas is a file they own
and have to close, so it is done TO their workspace, not a richer way to answer.

**Not one of the prompts that skipped the skill produced any UI.** Among the misses were a mortgage calculator, a
unit converter, BMI, and a three-way comparison — all of which should have been interactive. Their reasoning never
raised the idea of UI at all; this wasn't a considered rejection. So the problem was **the trigger signal in the
resident layer**, not the skill's contents: however well the skill is written, a skill the model never reads may as
well not exist. On that basis the resident prompt gained the rule that a question doesn't have to say "build me one"
to want an interface, enumerated by request shape (numbers the user might change, multi-way comparison, procedures),
naming weak phrasings like "算一下… / 看看… / 对比一下…" explicitly.

Three other empirical corrections:

- **Half the canvases had no persistence** (8/19 used localStorage in the first round), so a refresh lost everything.
  A canvas is by definition "somewhere the user comes back to," which makes this fatal. The skill now requires
  it. **This entry used to forbid `usePersistedState`, and that is no longer true** — the denial was written when
  `$dsh/state` did not exist here, then the model kept importing it anyway (five of six habit-tracker runs, and a
  reworded denial did not stop it), so `bindings.ts` implements it: `useState`'s signature, `localStorage` behind
  it, no host needed. The prompt now teaches it. Kept as a correction rather than deleted, because the lesson is
  the general one: **when the model reaches for the same missing API run after run, implementing it beats
  rewording the refusal** — and a stale prohibition costs more than the thing it forbids, since it sends the next
  reader to remove working code.
- **The model hand-rolls implementations to avoid library traps** (dropping recharts for hand-built SVG, dropping a
  markdown renderer for a bare textarea). The original "never hold back because it isn't available" missed the point —
  its worry wasn't availability but the library being painful. Added a line naming the common libraries.
- **Chinese canvas ids were silently rejected.** `背单词.ui4a.tsx` didn't match `/^[\w-]+$/` (JS's `\w` excludes CJK),
  so the sidebar never opened while the model said "done." 1 of the 40 hit it. The regex exists to prevent directory
  escape, not to enforce ASCII; it's now the exclusion-based `/^[^/\\.\s]+$/`.

### Every failure flipped, and both controls held

Re-ran the first round's failures verbatim. All flipped, and both controls held rather than being pushed too far:

|                         | before                                       | after                                                                       |
| ----------------------- | -------------------------------------------- | --------------------------------------------------------------------------- |
| `帮我算房贷…`           | no UI, did arithmetic in bash                | **UI**, bash gone                                                           |
| `帮我看看 BMI 正常范围` | no UI (plain text)                           | **UI** (and without loading the skill — the resident rule works on its own) |
| `算一下 128GB…换算`     | no UI                                        | **UI**                                                                      |
| `帮我可视化…电动车`     | UI, but read an unrelated package.json first | **UI**, redundant read gone                                                 |
| `帮我写个正则…边写边测` | wrote ` ```tsx `, lost entirely              | **correct ui4a fence**                                                      |
| `帮我做个背单词的应用`  | 1013 hand-written lines                      | **452 lines**, using `motion/react` + `lucide-react`                        |
| canvas persistence      | 8/19                                         | **10/11**, `useState` reserved for transient UI state                       |
| control `什么是闭包？`  | no UI                                        | **still no UI** ✓                                                           |
| control `今天星期几`    | no UI                                        | **still no UI** ✓                                                           |

`v-bmi`'s reasoning quoted the newly added line word for word ("anything with a number the user might want to change
is a candidate for a block") and then reversed its original "simple factual question, just answer it" call — direct
evidence the intervention worked.

### Ordering: the skill goes before you _explore_, not before you build

For an **underspecified** request like `帮我比较三款云服务器的性价比`, the first version had the model run 10 searches
and 2 bash calls before loading the skill — while the skill's answer for exactly this kind of request is "ask back
with an interface." That "Do it before you explore" line was buried inside the "asking back" subsection, so by the
time it was read the searching was done. After the ordering rule moved up into the resident layer (heading changed
from "Before you build one" to "Load the skill **before you explore**"):

- `帮我比较三款云服务器` — tool calls **13 → 4**, and the skill went from last to first
- `帮我做个网站` — the very first action is the skill, zero exploration, straight to an options card asking back
- `做个工具给我用` — 0/1 produced UI before; after adding "the vaguest requests need it most, not least",
  **3/3 loaded the skill first and produced a clarifying card**
- `把这些数据可视化一下` — still explores the workspace first. That one **is correct**: it has to know what data
  exists. Not redundant.

Verified on a real machine: a Chinese canvas (`ui4a/canvases/单位换算.ui4a.tsx`) opened the sidebar correctly, the
panel filled, the app worked, and the reply even explained that state goes to `localStorage` (key
`canvas:单位换算`) — both the regex widening and the persistence rule confirmed in the browser.

Backtick counts observed were 3/5/6/8 — **not one prompt wrote exactly four** — but `segments.ts` accepts three or
more and matches the close to the open, so everything rendered fine. That tolerance was the right call. What was
actually lost was the one that wrote the language as `tsx` (right intent, slipped hand).

### More UI and fewer steps, over the same 40 prompts

After validating on the failing subset, re-ran the **complete 40** unchanged. These are the comparable numbers:

|                            | round 1 | re-run    |
| -------------------------- | ------- | --------- |
| inline produced UI         | 9/20    | **13/20** |
| inline loaded skill        | 10/20   | **13/20** |
| inline total tool calls    | 34      | **29**    |
| canvas loaded skill        | 20/20   | 20/20     |
| canvas used persistence    | 8/19    | **17/19** |
| canvas third-party imports | 27      | **42**    |
| canvas mean line count     | 603     | 586       |

Canvas tool calls went 49 → 59, but **17 of the increase sit in a single prompt** ("team weekly report page", 12 edits

- 4 reads re-checking whether a JSX member expression was legal); the other 19 barely moved. One outlier, unrelated
  to the changes.

**More UI, fewer steps** — four more prompts produced UI while tool calls went _down_ by five, so it wasn't bought
with extra work. `帮我比较三款云服务器` alone went from 13 tool calls to 4.

Case by case, the ones that still produce no UI are all judged correctly: memory-model comparison → table, CAP
theorem → explanation, closures → explanation, JSON formatting → just give the result, what day is it → one line.
`做个番茄工作法的计时器` moved from inline to canvas, which is also right (something the user comes back to).

**One stable failure mode remains**: writing the fence language as `tsx` instead of `ui4a/tsx`. Both rounds hit it
1/20 (round 1 on "regex, test as you write", the re-run on "each step of quicksort"), about 5%. The chain of intent
is entirely correct — the reasoning says "build an inline ui4a/tsx block" out loud — the hand simply slips back to
the familiar language name at the last moment, and the whole interface is lost, leaving a source listing. A rule
naming it specifically now lives in the resident layer, right after the four-backticks line, as close to the moment
of writing as possible. Re-ran each of the two prompts that failed 3 times: **6/6 correct**.

It came back on 2026-08-21 on `帮我搭个东西记录点什么`, at 1/5, 1/5 and 1/6 across three passes —
~17% for that one prompt against ~5% overall. My first reading was "the vaguer the request,
the likelier the slip", and **one control killed it**: `帮我搞个东西看看数据`, no less vague, went
6/6 clean. So it is not a property of vagueness; it is a property of that prompt, and the
mechanism behind it is still unknown. Recorded rather than acted on — a rule aimed at a
pattern this thin would be aimed at nothing.

The general lesson is the one from §4.5's counting traps: with a ~5% base rate, five samples
of one prompt cannot tell a real cluster from noise. Run the control before believing the
explanation.

Two measurement traps worth recording, both of which had me draw a wrong conclusion: fences must be counted at three
backticks or more (counting four misses 3/5/6/8), and canvas artifacts must be counted by `find`ing the whole runs
directory (my original `runs/*/ui4a/canvases/*.tsx` glob missed files and turned "8/19 used persistence" into "0/10,
all useState"). Confirm your baseline numbers are real before changing a prompt.

### What the rounds established

The rounds themselves are in [docs/measurements-log.md](docs/measurements-log.md) — the numbers, the per-prompt
tables, and the reasoning traces each conclusion was read out of. What survives them:

**Render and streaming.** 32/33 artifacts compiled; the one failure is **JSX subscripting** — `<a.b />` is a
legal member expression, `<a[k] />` is not, and the model talks itself past this by quoting the member-expression
rule. 11092 partial frames across those artifacts produced hard errors only in the file that already failed to
compile: `normalizeGeneratedTsx` genuinely completes half-written attributes, unclosed JSX and missing braces.
Inline streams for real (47 state changes over 17.5s, no blank frames); the canvas does not, under the default
PTC mode (§3.6). A recharts chart does **not** restart its animation per frame — it builds up inside a stable
layout box, with one 80ms remount at the settled recompile.

**The default export must not share a name with an import.** `import { Pie } from "recharts"` beside
`export default function Pie()` makes the compiler drop `Pie` from the import list — the local declaration
shadows it — so `<Pie>` points at itself and recurses into React #185. **Nothing fails at compile time**; the
symptom is a card with height and zero children. `@genui/cli check` catches it (and the subscript); `lint` alone
catches only the subscript.

**Judge a broken card by shape, not by error text**, then read `innerText`, because zero children has two causes
needing opposite responses: empty means the module graph died on a bad import or a revoked blob URL (ours), and
`ERROR: …` means partial-react's boundary caught a throw during render (the generated code's). Counting children
alone reported a half-streamed object as an infrastructure failure and sent me into the wrong half of the system.

**Two colour facts the prompt got wrong** (§3.7 carries the corrected table): `--dsw-alias-brand-primary` is a
**foreground** colour equal to `label-primary` in both themes, not an accent — calling it "the one accent"
produced white-on-white icon tiles. The real accent is `--dsw-alias-state-business-primary`. And in light theme
`bg-base`/`layer-1`/`layer-2` are all pure white, so hierarchy can only come from borders; "a border or a
background, never both" had to become "a background only counts if it differs from what is under it".

**Capabilities, in the model's hands.** 5/5 wired every option to `$dsh/chat` and sent **human-readable text**,
never a JSON payload — `ctx.conversation.send` writes into the transcript, so a click has to read as something
the user would say. `$dsh/exec` came out right unprompted, `if (res.exitCode !== 0)` rather than try/catch,
because a non-zero exit **resolves**; the sandbox denies the same way (exit 1, stderr, HTTP 200), which is why a
card can say "this session is read-only" instead of going blank. Asked head-on for a card that deletes untracked
files, the model routed every delete through `sendMessage` and said why, unprompted. Every streamed field is
optional until the end — `partial-json` hands out objects whose fields have not arrived, and one method call on a
missing one throws inside render.

**`-i` is mandatory once a card imports `$dsh/*`**, or `check` reports `Cannot find module '$dsh/chat'` on every
such line and the model goes and "fixes" it. The current checker resolves mapped imports as `any` rather than
typing their exports: a valid generic call can raise TS2347, and a nonexistent export can pass. Verify those
calls against the installed declarations and report a nonzero check honestly; do not change correct source to
silence mapped-import diagnostics. Use the type import map for `check`/`lint`, not the standalone `build` map.
`bunx --yes genui@https://pkg.pr.new/MindLab-Research/macaron-genui-demo/@genui/cli@main` works with a named
specifier (a bare URL does not); keep `@main` so the instruction does not rot.

**Why trigger rules read the way they do.** The model reads "fixed" as _known to me_, so every framing about
variable content argued past it; the test that works is **enumerability** — three-day Tokyo itineraries is not a
set of five. "Reading it yourself is not the card reading it — that card is a photograph" took `$dsh/fs` from 0/2
to 2/2. A naming request is none of the original three shapes, and "asking for a few of something is asking for
more of them" fixed the one that had produced no UI at all. A **fourth trigger shape** — an opaque expression the
user is holding — went 3/3 with its tell stated outright (**your answer is already a table**) and its excuse
named (_simple is what makes it cheap to build, not what makes it unwanted_).

Two rules for writing them, both bought with failures. **A trigger rule must be recognisable from the prompt
alone**: the decision about what shape the answer takes is made once, early, and a data-gathering detour
overwrites it — by the time the model has the data it is finishing, not deciding. And **a rule the model reads,
quotes, and then argues with is not a wording problem**: the "knob" reframing went 1/4 and was reverted, while
the same sentence measured in another harness had worked — a fix does not transfer between tool surfaces for
free. Two resident rules can also simply collide, and "not for text that is already fine as text" wins; left
alone, because tightening either damages what the other covers.

**What a resident rule costs.** In the measured round, the always-on layer was 3254 tokens across 8 bold rules and the then-monolithic on-demand skill was 6183; the current skill entrypoint loads references separately.
Every rule added dilutes the attention the others get and is paid on every turn, including the ones that will
never produce UI. So the bar: recognisable from the request alone, covering a _shape_ rather than a topic, and
having flipped something measurable. Everything else belongs in the skill.

**Two negative results worth as much as the rules.** Card arithmetic was exact on all three prompts with
independently computable answers, and the cron one was better than correct — it answered "52 or 53, depending on
the year" and built a selector that counts them. And failure-shaped requests do **not** want a card at any scale:
48 errors turned out to be two classes of 24, and a seven-way monorepo break was triaged by finding the only
shared internal dependency. Real build failures have a topology, and finding the upstream root is reasoning, not
sorting.

**Counting traps.** An eval must count fences **and** files under `ui4a/canvases/` — a canvas is a file and the
reply about it is prose, so `fence=0` twice made me conclude the browse rule had failed when the run had produced
a 522-line file browser. Re-running the six fixed points after three trigger rules landed in one day gave 6/6:
worth repeating whenever the resident layer grows, since it is the only thing that catches a rule eating its
neighbours.
