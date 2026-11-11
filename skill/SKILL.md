---
name: generative-ui
description: Always load this skill first when a request might need an interface for any editable value, adjustable calculations, or unit conversion (including “5 英里是多少公里” and “98°F 是多少摄氏度”), a calculator or threshold such as BMI or mortgage, recommendations or option requests, a learning plan or checklist, or anything to save, reuse, or edit later, including saved checklists, reusable templates (“存下来”, “之后每次复用”, “改改再用”), or an expression to explore (cron, glob, regex, chmod). Use it even when the user asks for one number or expects prose, and without saying “canvas”. Do not load it for a fixed factual lookup such as “HTTP 状态码 418 是什么意思” or “今天星期几” unless the user explicitly asks for an interface. Choose one inline ui4a/tsx block, canvas file, or plain prose. Load it once before deciding; after it returns, read the needed reference, write the Canvas or emit the card, and do not call it again this turn.
---

# Building a generative UI

This skill is already loaded for the current turn. Once the skill tool returns this result, continue with the task: read the relevant references, use tools needed to build or check the card, and deliver the answer or canvas. Do not call the `generative-ui` skill again with the same name, even if you switch between prose and a card. If a topic guide applies, read its linked `references/*.md` file with the file-reading tool instead of reloading this skill.

### Output protocol

Treat the final handoff as the only user-visible part of the work. Do not narrate planning, reference reads, tool calls, checker output, compiler diagnostics, scratch files, or self-review. Fix issues silently; checker results are internal evidence, not reply content.

Honor explicit scope words such as “只含”, “仅包含”, “只有”, “only”, and “just” as a schema: include only the named data and controls. Do not add progress bars, editable labels, reset/undo panels, helper/status copy, or other fields unless the user asked for them or the stated contract requires them. For a reusable checklist or template, “save”, “reuse”, or “next person” requests persistence and reset semantics; it does not by itself request editable titles, add/delete controls, counters or progress, status prose, undo, restore-default controls, a confirmation/cancel panel, or a visible heading. If the request names one reset action, render that one action and run its persisted transform directly; do not wrap it in a confirmation flow unless the user asks for confirmation. Preserve those fields across reset internally, but do not render controls for them unless named. Keep required persistence and accessibility state internal when it does not belong in that schema.

For an inline result, make the first usable card the deliverable, then emit one short introduction, exactly one four-backtick `ui4a/tsx` fence, and at most one short closing sentence. For a Canvas, write the first usable file before optional polish and return only a short confirmation after the write succeeds.

## Authoring order

Follow this order before drafting source:

1. For any interactive card, read `references/lifetime.md` first and wait for the result; add `accessibility.md` when the card has selection, status, motion, or disclosure. Do not write a draft fence while those reads are pending.
2. Choose one surface before exploring. A request to save, reuse, or edit later starts with the first usable `.dsh/ui4a/canvases/<id>.ui4a.tsx` write and ends with a short prose confirmation; do not emit an inline fence or an export/re-export fence for that Canvas. An inline card writes no Canvas.
3. For an open answer space such as names, recommendations, meals, or other model-generated content, start the first generation on mount. A fixed seed or pool is not the answer; it is only an explicitly labelled fallback after a visible request error. Keep loading, empty, error, and retry states in the card.
4. Do not send interim assistant text while working. Assistant messages before the final handoff contain tool calls only; the first user-visible text is the completed answer. Keep reading, checking, writing, compiler output, and scratch-file cleanup silent. Before handing over, check the source and the complete visible reply. An inline reply has one exact four-backtick `ui4a/tsx` opener and closer; remove planning, scratch drafts, duplicate fences, and computed numeric prose outside the fence.
5. Run one finite source audit and the applicable checks. Fix real errors, and rerun a checker after changing checked source or correcting its invocation; do not repeat an unchanged check. If confirmed `$dsh/*` mapping diagnostics are the only remaining checker failures, verify those calls against installed declarations and the live card when available, note internally that static checking did not pass, and hand over once the request is met. Mention that concise limitation only when verification status is requested; never paste checker diagnostics into the normal handoff. Do not keep the user waiting for optional polish rounds.

## Trigger gate

Before the prose test, apply this gate:

- A calculation with values the user may change is an inline card, including loan or mortgage calculations, BMI thresholds or calculators, and unit conversions. **Any unit conversion is still an inline card when the user gives only one input and asks “how much”** — for example, `98°F 是多少摄氏度`. Pre-fill that input and its derived value in two linked fields; do not answer with prose-only arithmetic.
- A request for several candidates, recommendations, or options is an inline card, even when it asks for only a few names.
- An expression-in-hand question (cron, glob, regex, chmod) is an **inline-only** exploration unless the user explicitly asks to save or reuse a tool. Do not write a Canvas for the one-turn explanation, and do not emit both a Canvas and an inline copy.
- Choose exactly one surface per turn. If you choose inline, do not create any `.dsh/ui4a/canvases/*` file in that turn; if the request is durable, write the Canvas and do not emit an inline fence. If an earlier step picked the wrong surface, correct that output instead of producing both.
- A disclosure is not a choice. `openId`, `aria-expanded`, and a `Disclosure.Button` only show or hide details; they must not be counted as selecting a file or option. For a browse or preview card, keep disclosure state separate from a persisted selected id/path, use a native radio for a pick-one field (or implement its full keyboard behavior), and make the selection handler write the persisted draft.
- In a preview choice card, the candidate handler must call the persisted draft setter; a read-only `picked`/`active` value or a disclosure/open setter is not selection. Keep the draft and submitted answer in separate persisted values. If an option's handler only calls `useState`, changes `openId`, or changes styling, the choice is not wired and the card fails the source check.
- Before writing **any interactive card** (recommendations, options, calculators, conversions, BMI, mortgage, sliders, toggles, or draft text), read `references/lifetime.md` and do not emit TSX until that read returns. If it has selected state, semantic status, motion or animation, or a disclosure, also read `references/accessibility.md`. **Source-check the card before sending:** a choice card must contain both `sendMessage` and `usePersistedState`; an instant choice sets and sends in the same handler, while a preview has a separately rendered, persisted Submit. Both forms must guard against a second send after the persisted answer (disable the control or return before sending). Start every uncommitted submitted choice as `null`: the first render must not claim that the user already chose one. A calculator mode or standard may use a sensible **persisted** default because it is an input to the calculation, not a submitted answer. Do not promise a control that the card does not render or trigger, and do not promise an automatic reply that it does not trigger.
- **Persist every card-owned value the reader can edit in an inline card.** This includes calculator and conversion inputs, selects, sliders, toggles, checkboxes, and draft text, not only a submitted choice. Use `usePersistedState` from `$dsh/state` for each such value with a stable key distinct from other cards; `useState` is only for transient UI or derived display. Do not mirror a persisted input or draft in a second local `useState` value — bind the control to its persisted value, or persist the raw editable string too when an invalid intermediate token must survive. Never import `usePersistedState` from `react` — React does not export it. A mortgage must persist principal, years, rate, and method separately. <!-- fs-persist -->
- **Keep displayed values live.** Every explanatory sentence inside a card that contains an editable or derived number must interpolate the same state or formatter that drives the value; never repeat the initial literal (for example, `{miles} miles = {format(km)}` , never `5 miles = {format(km)}`). A mortgage helper must derive its text from the current principal, years, rate, and method too; do not leave seed values such as `4.2% / 100 万 / 30 年` in prose after adding editable fields. Once you choose an inline calculation or conversion, do not output its computed answer or numeric summary anywhere outside the fence, before or after it; the framing line must not state an approximate equality or the initial converted result. For `98°F 是多少摄氏度`, the conversion result belongs inside the card; the prose may only introduce the editable pair or formula. This scan covers the whole reply, including the sentence before the fence and the closing sentence after it.
- **Keep units and formulas on the same scale.** The input label, conversion formula, and output formatter must agree: if a field is labelled `万元`, normalize that value exactly once before the loan formula and format the result in the unit you show. Keep separate names and formatters for each scale, such as `principalWan`/`principalYuan` and `fmtWan`/`fmtYuan`; a `万元` value must come from yuan divided by `10_000`, while a `元` value must use yuan directly. Never pass one unlabelled `total` to both scales or leave a unit implicit in a metric/helper sentence. A zero interest rate is valid: use principal divided by months instead of rejecting the case. Run one known sample through the displayed formula before sending; never label yuan as ten-thousands or apply the scale twice.
- **Keep status text readable in both themes.** Do not pair `bg-accent` or a bright success/warning fill with `text-white` or a bright semantic text token, and do not use `text-success` or `text-warn` as small body text directly on `bg-page`. For a filled control use `var(--dsw-alias-button-primary-fill)` with `var(--dsw-alias-label-primary-foreground)`; for a status on a neutral surface use `text-label` plus a semantic icon/word, or a tested foreground/background pair. Check small text at the actual rendered size. Do not use hex, rgb, or hsl utility colours for theme-facing fills or strokes anywhere: utility classes, constants, inline styles, and CSS all count. Category and status bands are theme-facing too. Reserve literal hues for subject identity, explicitly user-selected colours, or distinct chart series tested on both themes with a text legend.
- **A hover-only action must remain visible to keyboard users.** If an edit or delete button uses `opacity-0 group-hover:opacity-100`, add `focus-visible:opacity-100` and keep a focus ring, or leave the action visible.
- **Run this source gate immediately before sending or writing.** (1) Every card/canvas-owned editable value uses `usePersistedState` and has a stable, distinct key. If several independent rows, weeks, days, or sections each have a status or action, persist a set/map keyed by their stable ids rather than one scalar that overwrites the previous row. (2) Every sentence containing an input or result renders from current state; a mode/standard selector must drive the actual formula, thresholds, classification, and labels, not labels alone. Check a boundary example in each mode. (3) A submitted choice is persisted and sent once; a calculator mode/standard is also persisted, while only an uncommitted submitted choice must start at `null`. (4) Every `<button>` has `type="button"`; every `outline-none` control restores a `focus-visible` ring; pick-one fields use native radios or implement full arrow-key radio behavior, while independent toggles expose `aria-pressed`; click-to-edit headings and rows are keyboard-reachable controls or real inputs. (5) A reusable Canvas's reset-for-next-person or reset-progress action transforms the current persisted object; it cannot replace the whole template with defaults. A separately labelled restore-default-template control may do so. Progress totals must derive from the current item collection, and deleting an item must remove its id from completion or other per-item state. (6) Search class names for `bg-accent text-white`, `bg-accent` on a selected control, and small `text-success`/`text-warn` on `bg-page`; replace them with the theme-safe foreground/background pair or a readable neutral status. (7) Copy must match behavior: do not say “选完即自动回复” when a separate Submit is required, and a report/submit payload must include every user-editable field it claims to report. (8) If a parser returns an array, use array operations such as `includes`; use `.has` only when the value is actually a `Set`. Remove dead duplicate conditions and run one known input through the actual formula or parser; run the real checker for a long inline card or Canvas, and verify live paint when a panel is available. (9) If a card shows a glob, regex, or similar pattern containing `{}`, quote it as a JSX string expression; never place the braces directly in JSX text. (10) For a recursive workspace browse, prefer one bounded command listing when a command capability is available, or a shallow `readdir` with lazy expansion when it does not; use the exact `readdir` shape (`type: "file" | "directory"`, `size` on files), never invent `stat`, and never turn a failed directory read into an empty successful listing. Fix real source-audit findings before emitting; follow `checking.md` for checker-only mapped-import diagnostics.
- For a staged plan, check each selectable goal and time budget across every stage. Teach a prerequisite before a step uses it, and make the tasks in every stage match the selected goal and available time; if filtering for a shorter session removes a prerequisite, redesign that track instead of just dropping the step. Changing one label or one step is insufficient.
- For a cron explorer, reject malformed fields such as `*/` or `/5`, test stepped ranges with multiple expected matches, and refresh future-run previews as time advances without requiring another edit.
- For async file, command, web, or model results, include loading, empty, and error states and put `aria-live="polite"` on the results region. Write the attribute on the stable wrapper that is present before the result changes, for example `<div aria-live="polite">{loading ? <Spinner /> : <List items={rows} />}</div>`, then search the final source for that exact attribute. A top-level capability failure must render a visible error (including stderr/exit status when available); an empty `catch {}` or silent fallback to seed data is allowed only around parsing an incomplete streamed frame, never around the request itself. Abort errors from a superseded request may return quietly.
- If a Canvas says that a later selection will add, generate, submit, send, or otherwise change the workspace, the card must contain the real persisted draft plus the handler that performs that action. A local `useState` selector with copy such as “我来补” is not a feature. A feature picker is valid only when the selection immediately changes the artifact, invokes a capability, or sends a concrete request; for a durable checklist/template, choose sensible defaults and write the Canvas in the same turn instead of replacing the requested artifact with a local picker whose only effect is highlighting. If the card only highlights choices and has no action, say that plainly instead of promising a follow-up.
- Fixed factual lookups such as the meaning of an HTTP status or today's weekday remain prose. An expression in hand (cron, glob, regex, chmod) is an inline card for exploring its behavior, not a Canvas unless the user asks to save a tool.
- Once this gate selects inline, perform a final protocol pass on the complete reply, including any scratch examples or quoted drafts: the complete assistant message is user-visible, so remove planning, self-review, scratch code, “final code” labels, and duplicate drafts. Do not stream tool-use narration while building; those words cannot be removed by a final pass. Emit one short introduction, exactly one `ui4a/tsx` block, and at most one short closing sentence; never quote or repeat the block. Put the introduction on its own line, leave a blank line, then start the exact four-backtick `ui4a/tsx` opener at the beginning of the next line, and close it on its own line. The complete reply must contain one opener and one closer, with no three-backtick `tsx` fence, no computed result or numeric summary outside the fence, and no prose attached to either fence line. Never emit `。````ui4a/tsx`, put any prose on the opener line, or rely on a streaming fragment that will be fixed later; remove every extra fence before sending. Do not reload this skill.

## Is this a UI at all

An interface earns its place when the answer has a shape prose has to flatten: numbers to compare, a control to move, options to pick between, something that changes as the user pokes at it.

It does not earn its place when the answer is a sentence. A definition, a yes/no, a recommendation with a reason — wrapping those in a card adds a box and a heading around text that was already fine, and costs the reader a second to work out there is nothing to click. When you find yourself building a component whose whole body is one paragraph, write the paragraph.

Two specific traps:

- **Do not restate the reply as a card.** If the interface only repeats what the prose next to it already said, one of them is redundant, and it is the card.
- **Do not decorate an answer.** A metric with an icon and a border is still just a number. Ship the number.

**And a long answer is not automatically prose.** The trap above is a card whose body is one paragraph; the opposite trap is a wall of markdown that was a list of things to _do_. A recipe, a workout, a packing list, a set of steps — the reader works through those one item at a time, loses their place, and comes back to them. Ticking an item off is the whole interaction, and markdown cannot offer it. If you are about to write `- ` more than about six times and the items are actions rather than facts, that is the block, not prose.

Conversely: "visualise this", "show me a chart", "make it interactive", "let me try it" are unambiguous requests for the block. Build it directly — don't reach for `run_code` or an image; the fence renders in the browser.

## Inline or canvas

They are not two sizes of the same thing; they have different lifetimes.

**Inline** is _one step of the conversation_. It lives in the message where it was said, it is read once, and it scrolls away. Use it when the UI is tied to what you are saying right now: the comparison you just described, the option set you need answered, a small live calculation.

**Canvas** (`.dsh/ui4a/canvases/<id>.ui4a.tsx`) is _a place the user comes back to_. It stays in the panel across turns, keeps state, and can hold several views. Use it when the thing has substance — a tool, a dashboard, an editor, anything with more than one screen or worth reopening tomorrow.

**The tell is not "would this be useful to keep".** That question is about the content, it answers
yes for anything reference-shaped, and it is how a changelog, a cron explanation and a definition of
closures all became files. Ask instead: **did they ask for a durable thing?** A canvas is a file in
their workspace that they now own and have to close — creating one is an action taken on their
behalf, and it needs their say-so:

- They named a lasting artifact — "make me a dashboard", "a page I can share", "save this as", "a
  tool for…", "画板", "报告" — or asked to keep or come back to something. → **canvas**
- They asked a question, even a large one whose answer is long and well-organised. → **inline**,
  every time. "What changed in 2.1.251" is a question; 71 items of answer does not make it a file.
- The thing genuinely has more than one screen, or holds state the next turn needs. → **canvas**,
  and say in one line that you opened it.

When the user explicitly asks to save, reuse, or edit the result later, the request is already
specific enough to build. Load this skill, choose sensible defaults, and immediately write the
first usable file to `.dsh/ui4a/canvases/<id>.ui4a.tsx`; do not replace the write with a prose plan,
a temporary `.tsx`, or another design/planning skill. Read the relevant references while building
if needed, then keep the canvas visible and editable. The write is the action that creates the
canvas, so it must happen in the first turn that accepts the durable request.

Natural phrases count as an explicit durable request even when the user never says “canvas”:
“存下来/保存起来”, “以后还要用”, “之后每次复用”, “每来一个新人都改改再用”, and “留着以后
修改” all require the first write to that canvas path. An empty workspace does not change this
decision — it means create the first canvas, not fall back to an inline fence or localStorage-only
card. The same rule applies to checklists, templates, plans, and other artifacts the user says they
will reuse. For a reusable checklist or template, a “reset for the next person” action may clear
completion or other transient state only; it must preserve edited titles, added items, and saved content instead of replacing the persisted object with fresh defaults. Do not promise to preserve edits unless the reset handler actually does so.
Implement that reset as a transform of the current persisted value: clear only explicitly per-person
or transient fields and map the existing phases/items to `{ ...item, done: false }`, preserving every
id, edited title, template-owned field, and added item. An `owner` or `note` may be cleared only when
the UI defines it as per-person data. `setBoard(cloneFresh(DEFAULT_BOARD))`, `setBoard(DEFAULT_BOARD)`, or any reset that
replaces the whole object from an initial constant is wrong for the “next person” action; reserve that
behavior for a separately labelled “restore default template” control.
After creating a durable Canvas, keep the reply as a short description of the opened file; do not
also emit an inline `ui4a/tsx` fence or an export/re-export fence for that file. The Canvas write is
the deliverable, and a second fence creates a duplicate surface or renders source instead of the
saved panel.

Measured: on `cron-read` — _"`*/17 3-5 * * 2` 这个 cron 到底几点跑？"_, a lookup with one right
answer — models opened a canvas **5 times in one round and 6 in the next**, and one opened a canvas
for _"什么是闭包？"_. Nobody asked for a file in any of them.

When it is genuinely borderline, inline is the cheaper mistake: it is one message, not a file the
user now owns.

## Ask with an interface when the request is underspecified

"Build me a tool", "show me the data" — several plausible readings, no default. Guessing wastes a build; asking in prose makes the user type the answer back.

Ask with an **inline** block instead: one short line saying what you need to know, then 2–4 concrete options as clickable cards, each wired to `sendMessage` so a click _is_ the reply:

```tsx
import { sendMessage } from "$dsh/chat";
import { usePersistedState } from "$dsh/state";

export default function Pick() {
  const [picked, setPicked] = usePersistedState<string | null>("ask:which-cloud-host", null);
  const choose = (id: string) => {
    setPicked(id);
    sendMessage(id);
  };
  // the key names THIS question — two asks in one conversation must not share it
  // picked === null → the options; otherwise just the chosen one, still highlighted
}
```

**When the two answers need no explaining, they are two buttons in a row — not two cards.** The
shape to match is in the question: `Postgres or SQLite?` / `公制还是英制？` / `要我先跑测试吗？` are
answered by the label alone, and a bordered tile with a description under each says the choice is
weightier than it is. Same `choose`, same key, one row:

```tsx
<div className="flex flex-wrap gap-2">
  {OPTIONS.map((o) => (
    <button
      type="button"
      key={o.id}
      onClick={() => choose(o.id)}
      aria-pressed={picked === o.id}
      className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-hover
                 aria-pressed:bg-[var(--dsw-alias-button-primary-fill)] aria-pressed:text-[var(--dsw-alias-label-primary-foreground)] aria-pressed:border-transparent
                 aria-pressed:hover:bg-[var(--dsw-alias-button-primary-fill)]"
    >
      {" "}
      {/* or the selection vanishes under the pointer */}
      {o.label}
    </button>
  ))}
</div>
```

Give each option a description and you have built the card version above; the descriptions are
what earn the tiles. Two labels that stand on their own take the row.

Rules for that move:

- **Do it before you explore.** Listing the workspace tells you what is there, never what the user wants. Stalling in tool calls is not a step.
- **Real options, not a form.** Each card is a thing you could go build right now. "Something else" belongs at the end as a plain text field, not as one of the cards.
- **One ask per question, and their answer settles that question.** Take it and build: a detail they left open takes your sensible default, named in one line. A choice their answer just _opened_ is a different question, and it takes this same move — they told you the language, so formal-or-casual is a question that did not exist a turn ago.

Don't ask when the request already names the thing, when there is one obvious reading, or when building it is faster than asking about it. Plain conversational questions get plain answers.

## Frame the final handoff

A reply that is nothing but an interface reads like a document that is nothing but a code block — it arrives with no warning and the reader has to work out what they are looking at. Put the framing in the final handoff, together with the card or Canvas confirmation.

- **Before an inline fence** — one line saying what the user gets. For a Canvas, write the file first and use a short prose confirmation instead.
- **After** — one or two lines: what it does, plus the one thing worth pointing out (a control that isn't obvious, an assumption you made, what to say to change it).

Both short. Two or three sentences total. Don't narrate tooling ("now I'll write the file") or diagnostics ("the checker passed") — say what the user gets.

**Write the card in the language they wrote to you in — every label, every button, every helper line.** This is not a preference, it is whether they can use it: a Spanish speaker handed a card labelled 日常休闲 / 户外运动 got no answer at all. It is easy to miss because the card is a separate act of writing from the reply, and the reply is usually right; measured, a card for `Suggest an outfit that matches the occasion and weather` came back entirely in Chinese. The corpus is **en 39% / es 31% / fr 12% / it 9% / pt 5%, and Chinese 0.2%** — so Chinese is the wrong default in almost every turn, and if you find yourself typing a CJK label, check what language the question was in.

## Emit the inline block with the exact fence

When you choose an inline card, put the short introduction on its own line, leave one blank line, then start the block at the beginning of a new line with **exactly four backticks followed by `ui4a/tsx`**. Close it with exactly four backticks on its own line. Do not use three backticks, put prose on the opener line, attach the opener to the introduction, or use `tsx` as the info string. The card renderer and the reader both depend on this shape.

## Read the relevant reference before writing TSX

The instructions below live beside this file in `references/`. Before writing any interactive card, read `references/lifetime.md` and wait for that read to return; if the card has selected state or semantic status, read `references/accessibility.md` too. Only then read other topic guides needed by the card. Use the entrypoint rules directly for a small noninteractive card that needs no topic-specific guide. The entrypoint is not the complete authoring guide.

Use the file-reading tool with its required `file_path` argument set to the resolved absolute path of the reference (for example, `<skill base>/references/layout.md`). `file_path` is the only valid argument: make one read with that path, never issue `{}` or an empty read call, and do not make speculative parallel reads. `sendMessage` is a capability imported inside the TSX card, not a host tool call. The skill resource base above is the package directory: `skill/` and `skill/references/` are read-only installed resources, never a destination for generated `.dsh` or `.tsx` files. Write Canvas files only at `.dsh/ui4a/canvases/<id>.ui4a.tsx` in the current session workspace; an inline card writes no temporary Canvas file.

When two fields are linked, initialize every value that is visible on the first render. If one field
starts with a value such as `98°F`, compute and show its paired value such as `36.7°C` immediately;
do not initialize the derived field to `""` and wait for an effect or the first edit.

- For state, a submit/preview flow, undo, or a canvas that survives edits: [lifetime.md](references/lifetime.md) (**mandatory before any interactive card**). There is no `references/canvas.md`; do not try to read it.
- For framing, spacing, scrolling, responsiveness, and theme tokens: [layout.md](references/layout.md).
- For controls, keyboard and screen-reader access, selected state, and motion: [accessibility.md](references/accessibility.md).
- For audio or waveform UI: [sound.md](references/sound.md).
- For hooks, timers, animation loops, or overlapping async work: [runtime.md](references/runtime.md).

<!-- web-reference -->
<!-- files-reference -->
<!-- ai-reference -->

- Before handing over a long inline card or canvas: [checking.md](references/checking.md).
- When choosing an npm library or checking an export: [imports.md](references/imports.md).

<!-- exec-reference: included only on hosts where the command route is enabled -->
