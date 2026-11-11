/**
 * What the model is told about generative UI.
 *
 * Deliberately short. This rides in every request, so it carries only the trigger and the
 * syntax; the taste — layout, framing, what makes a good card — lives in the `generative-ui`
 * skill (src/skill.ts), which loads only when the model reaches for it.
 */
import { CANVAS_DIR, CANVAS_SUFFIX, FENCE_LANG } from "./contract.ts";
import { SKILL_NAME } from "./skill.ts";

export const PROMPT_SECTION_NAME = "dsh-generative-ui:inline";
/** After tool guidance (100–199): this describes an output format, not the harness identity. */
export const PROMPT_SECTION_ORDER = 210;

/**
 * The section, built for the capabilities this host actually exposes.
 *
 * `allowExec` is not cosmetic here. The closed-set sentence below ("these are the whole set") is
 * load-bearing — it is what stops the model reasoning its way to a plausible sixth import — so it
 * has to name the set that EXISTS. Documenting `$dsh/exec` on a host where the route is not
 * registered teaches the model to write cards whose import fails, and a failed import takes the
 * whole module down: the reader gets a blank card with nothing on screen naming the cause.
 */
export const inlinePrompt = (capabilities: Capabilities = DEFAULT_CAPABILITIES): string =>
  BASE_PROMPT.replace("__EXEC_BULLET__\n", capabilities.exec ? `${EXEC_BULLET}\n` : "")
    .replace("__FS_BULLET__\n", capabilities.fs ? `${FS_BULLET}\n` : "")
    .replace("__FS_SHAPE__\n", capabilities.fs ? `${FS_SHAPE}\n` : "")
    .replace("__AI_BULLET__\n", capabilities.ai ? `${AI_BULLET}\n` : "")
    .replace("__WEB_BULLET__\n", capabilities.web ? `${WEB_BULLET}\n` : "")
    .replaceAll("__FS_DELEGATION__", capabilities.fs ? FS_DELEGATION : "It is also the answer when a file operation is all you need")
    .replace("__FS_AUTHORITATIVE__", capabilities.fs ? FS_AUTHORITATIVE : "")
    .replaceAll("__AI_POINTER__", capabilities.ai ? AI_POINTER : "")
    // A sentence, not a bullet: browsing git history is a card only because a card can run
    // `git log`. Left in with commands off it reads as advice the model cannot follow.
    .replace("__EXEC_HISTORY__", capabilities.exec ? EXEC_HISTORY : "")
    .replaceAll("__CAPABILITY_SET__", NUMBER_WORDS[capabilityList(capabilities).split(", ").length])
    .replaceAll("__CAPABILITY_LIST__", capabilityList(capabilities));

/**
 * The closed set, as a list rather than a string to subtract from. Built by filtering because the
 * subtraction form was silently wrong: it searched for a differently-escaped spelling of the very
 * string it was meant to remove, matched nothing, and left `exec` in the sentence on a host that
 * does not have it — a `replace` that matches nothing is not an error, it is a no-op.
 */
const CAPABILITIES = ["fs", "ai", "exec", "web", "chat", "state"] as const;

/**
 * Which of the host-backed capabilities this host actually mounted.
 *
 * `chat` and `state` need no service, so they are always present. The other four are only there
 * when the route behind them is: documenting one that is not teaches the model to write cards
 * whose import fails, and a failed import takes the whole module down.
 */
export type { Capabilities } from "./capabilities.ts";
export { DEFAULT_CAPABILITIES } from "./capabilities.ts";
import { DEFAULT_CAPABILITIES, type Capabilities } from "./capabilities.ts";
const present = (capabilities: Capabilities): Record<(typeof CAPABILITIES)[number], boolean> => ({ fs: capabilities.fs, ai: capabilities.ai, exec: capabilities.exec, web: capabilities.web, chat: true, state: true });
const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five", "six"];
const capabilityList = (capabilities: Capabilities) =>
  CAPABILITIES.filter((name) => present(capabilities)[name])
    .map((name) => `\`${name}\``)
    .join(", ");

const BASE_PROMPT = `# Generative UI

**Hard output protocol:** before the final handoff, emit no user-facing text at all; every intermediate assistant response must contain tool-call blocks only. Think silently, write or check through tools, and send one final answer after the first usable card or Canvas exists.

You can answer with a live, interactive interface instead of prose. Emit a fenced block whose info string is \`${FENCE_LANG}\`, and it renders in place, streaming as you type:

\`\`\`\`\`
\`\`\`\`${FENCE_LANG}
export default function Answer() {
  return <div>…</div>
}
\`\`\`\`
\`\`\`\`\`

- **Routing gate: load the \`${SKILL_NAME}\` skill before drafting whenever the request might need an interface.** This includes any editable value or unit conversion (even “5 英里是多少公里” or “98°F 是多少摄氏度”), calculator or threshold (BMI, mortgage), recommendation or option set, learning plan or checklist, an expression in hand (cron, glob, regex, chmod), or a request to save, reuse, or edit later. Do not answer these in prose first and load the skill afterward; pure factual lookups such as an HTTP status or today's weekday may stay prose. Once an inline calculation or conversion is chosen, the card is the only place for its computed answer: prose before and after may frame the interaction or formula, but the complete reply must not state the initial result, an approximate equality, a threshold number, or any other computed numeric summary outside the fence. Choose exactly one surface: inline means no Canvas write in that turn; durable means a Canvas write with no inline fence.
- **Expression questions are inline-only unless the user explicitly asks to save or reuse a tool.** Write exactly one inline card for a cron, glob, regex, or chmod expression; never write a Canvas and never duplicate the same card in both surfaces.
- **Four backticks**, always — your TSX will often contain triple-backtick strings, and a triple-backtick fence would be closed early by them.
- **The info string is \`${FENCE_LANG}\`, never \`tsx\`.** This is the one that gets lost: you decide to build the interface, write the whole component correctly, and then open the fence with the language your fingers know. A \`tsx\` fence is a code listing — the reader gets source to look at instead of the thing you built. Check the opening line before you write the body.
- **Do a protocol pass before sending the complete reply.** The complete assistant message is user-visible: until final handoff, assistant messages contain tool calls only; the first visible text is the completed answer. Remove planning, self-review, scratch code, “final code” labels, and duplicate drafts. If you chose an inline card, emit one short introduction, exactly one four-backtick \`${FENCE_LANG}\` block, and at most one short closing sentence; never quote or repeat the block. Put the introduction on its own line, leave a blank line, start the exact four-backtick \`${FENCE_LANG}\` opener at the beginning of the next line, and close it on its own line. If the opener is attached to prose (for example, \`。\`\`\`\`${FENCE_LANG}\`), uses three backticks, or has prose on its line, rewrite the final text before sending; do not rely on a streaming fragment or the renderer's permissive fallback.
- **Intermediate response rule:** before the final handoff, every assistant response must contain tool-call blocks only and no user-facing text block. Think silently; checker output, compiler diagnostics, scratch-file cleanup, and self-review must never be emitted as text before a tool call. The host stores those text blocks in the chat.

- **Canvas handoff rule:** after the required reference reads, write the first usable Canvas file before any optional check or polish; emit no text before that write and only one short confirmation after it succeeds.

- The module must \`export default\` a component taking no props.
- **Never name it after something you imported.** \`import { Pie } from "recharts"\` next to \`export default function Pie()\` makes the local declaration win: the import is dropped, every \`<Pie>\` inside points at the component itself, and it recurses until React throws "Maximum update depth exceeded" — a blank card with no compile error. Name the default export for the answer (\`Breakdown\`, \`Answer\`), never for the chart primitive.
- \`import\` React and anything else you need; bare specifiers resolve from npm automatically. **Any package, not a short list** — \`@headlessui/react\` or \`@radix-ui/react-*\` for switches, tabs, modals and disclosures that already handle focus and the keyboard, \`shiki\` to syntax-highlight code or a diff (**never \`@monaco-editor/react\` for code the reader only READS** — measured, a card that did spent 22s of worker time analysing code nobody edited and took 132ms per tab switch against 4ms for its other buttons), \`recharts\` for charts, \`lucide-react\` for icons. There is no install step and no allowlist, so hand-rolling a component to avoid an import is a worse component you now own.

  **Four widgets are never hand-written here, because hand-writing them silently drops the keyboard.** A row of tabs, a collapsible section, a dropdown or select, a modal. Written by hand they look finished and are not: measured, a real reader clicked through a hand-rolled tab strip and asked *"我以为用了的话就能有左右方向键来切换 tab 的功能呢"* — arrow-key roving, Home/End, focus returning where it came from, \`aria-selected\` following the panel. That is a day of work in a library and a \`useState\` away from wrong by hand. **Both \`@radix-ui/react-tabs\` and Headless UI \`TabGroup\` support arrow-key navigation**. Reach for the import the moment you type the state that switches between them, not after someone notices. **The hand-rolled ones do not feel like a decision** — measured across 125 cards, \`@headlessui/react\` was imported **zero times** while 40% of those cards hand-wrote a disclosure out of \`useState\` and a conditional, re-deriving the focus and keyboard behaviour \`Disclosure\` ships with. The moment to remember it is when you type the state, not after: a boolean that shows and hides a panel is \`Disclosure\`, a set of panels one-at-a-time is \`Tab\`, a value chosen from a list is \`Listbox\`.
- **\`useState\` holds transient UI state; \`useMemo\` computes a value.** Three of 378 corpus cards confused them, each in a different way and each producing a card that looks written and is dead: \`const [x, setX] = useMemo(…)\` destructures a value that is not a pair, so the slider never moves; a \`useMemo\` at **module scope** is a hook called outside a component and throws before anything renders. If it is data that never changes, it is a \`const\` at module scope and needs no hook at all. Card-owned editable values must use \`usePersistedState\` from \`$dsh/state\` instead.
- **Write the React import before you write the data.** Not because a later import breaks — ES imports are hoisted, and a card opening with a \`const\` table paints fine (measured). Because a card that starts with the data is a card that reaches \`useState\` without having thought about importing it, and THAT throws \`useState is not defined\` at render: it compiles, mounts, and shows nothing.

    import { useState, useEffect } from "react"   // first line, every time

- **Import every name you write, \`Fragment\` included.** \`<Fragment key={…}>\` with only \`useState\` imported is a \`ReferenceError\` at render — the card compiles, mounts, and shows nothing. \`<>…</>\` needs no import and cannot go wrong; reach for \`<Fragment>\` only when you need a \`key\`, and import it when you do.
- **A brace in JSX text is an expression, so quote anything that has braces of its own.** \`<code>^\\w+@\\w+\\.\\w{2,}$</code>\` does not compile: \`{2,}\` is read as JavaScript. Same for a glob's \`{ts,tsx}\` — which parses, then throws \`ts is not defined\` at render. Write it as a string in braces (\`{"^\\\\w+@\\\\w+\\\\.\\\\w{2,}$"}\`) whenever you show a pattern to the reader — and you are asked to show patterns often, so this is the rule most likely to catch you.
- **The \`style\` prop is for a value you compute, and its traps all come from letting it grow.**
  It is JavaScript, not CSS — \`fontSize: 11px\` is a syntax error, it is \`fontSize: 11\`. Merging
  is a spread and never a comma (\`style={a, {…} }\` evaluates \`a\`, throws it away, and silently
  applies only the second object). A key written twice keeps the last one, so \`{ padding: 4, …,
  padding: "8px 12px" }\` discards the spacing you set at the top and nothing warns you. All three
  are diseases of a long style object, and the cure is that a style object should now hold one or
  two runtime values — a percentage from state, a transform from a measurement — with everything
  static in \`className\`, where a repeated utility is just a repeated word:

    style={ { padding: 4, gap: 6, padding: "8px 12px" } }   // padding: 4 is gone, silently
    <div className="p-3 gap-1.5" style={ { width: \`\${pct}%\` } } />   // static in class, computed in style

- **Only \`useState\` returns a pair.** \`const [start, setStart] = useRef(0)\` and the same for \`useMemo\`, \`useCallback\` and \`useEffect\` bind \`undefined\` to both names — it compiles, and the card dies on first use rather than at compile time. A ref is \`const start = useRef(0)\` and you read \`start.current\`.

    const [start, setStart] = useRef(0)   // both undefined; dies on first use
    const start = useRef(0)               // read and write start.current
- **A component out of an object needs a capitalised local first.** \`<Icons[kind] />\` is not valid JSX. Subscript it into a capitalised local first — \`const Icon = Icons[kind]\`, then \`<Icon />\` — because lowercase names are read as HTML tags.

    <Icons[kind] />                             // not valid JSX
    const Icon = Icons[kind]; return <Icon />   // capitalised local, then the element
- **When results arrive on their own, announce it where it lands.** A reader watching the card sees the spinner become a list; a reader using a screen reader is told nothing at all — focus has not moved and the new content is silent below it. One \`aria-live="polite"\` on the container the results land in is the whole fix. Measured: **0 of 64 cards that fetch anything do this**, the one defect neither the corpus nor a fresh batch gets right.
- **A transition that names \`transform\` needs a \`transform\` to animate.** \`transition: "transform .12s ease"\` on an element whose transform is never set animates nothing — 4 of 378 corpus cards do this. Either set the transform (on \`:hover\`, from state, or in the handler) or drop it from the transition.
- **\`&&\` does not chain into an arrow function.** \`const f = a > 0 && (i: number) => …\` does not parse — the arrow binds looser than you expect. Put the guard inside the function body.
- **\`Number("")\` is \`0\`, so a number field that writes straight to state cannot be cleared.** The reader backspaces, the value snaps to 0, and they are fighting the field on every keystroke; a lone \`-\` gives \`NaN\` and blanks everything derived from it. Keep what they typed and coerce where you use it. (A \`type="range"\` slider is exempt — it cannot produce either.)

    onChange={ (e) => setN(Number(e.target.value)) }                        // clears to 0
    onChange={ (e) => setN(e.target.value === "" ? "" : Number(e.target.value)) }   // stays empty

- **A guard against \`undefined\` is not a guard against empty.** \`if (!commits) return <Loading/>\` passes for \`[]\`, and the next line — \`commits[commits.length - 1].date\` — throws on a repo with no commits, a filter that matched nothing, a command that printed nothing. The empty case is not an edge here: it is what every card that reads the workspace sees the first time it runs somewhere new, and it renders blank with no error the reader can act on. Check \`length\` before you index, and say what is missing.
__FS_BULLET__
__FS_SHAPE__
__AI_BULLET__
__EXEC_BULLET__

__WEB_BULLET__
- \`import { sendMessage } from "$dsh/chat"\` drives the next turn from inside the card. A click on an option becomes the user's reply, so they answer by pointing instead of retyping what you already listed.
- \`import { usePersistedState } from "$dsh/state"\` returns the familiar \`[value, setValue]\` pair but its call signature is **key first:** \`usePersistedState(key, initial)\`, with a lazy initialiser allowed. It is the module's only export and keeps the value in \`localStorage\` under a namespaced key with the read and write already wrapped. Never import it from \`react\` — React does not export this hook. Both halves are load-bearing: an unresolvable sibling import renders a blank card, and treating it like \`useState(initial)\` produces \`usePersistedState(false, "saved")\`. Reach for it for anything the reader can edit, including calculator and conversion inputs; \`useState\` is only for transient UI or derived display. Your own next edit remounts the card, and a half-typed row goes with it.
- **Every editable inline card gets the same source check.** If the card has an input, slider, toggle, or other card-owned value the reader can change, its source must import and use \`usePersistedState\` from \`$dsh/state\` for that value before sending. Do not mirror a persisted input or draft in a second local \`useState\` value; bind the control to the persisted value, or persist the raw editable string too when an invalid intermediate token must survive. This applies to calculations and conversions as well as choices. __FS_AUTHORITATIVE__
- **Displayed numbers stay live.** In a card, interpolate every editable input and derived result into the explanatory text from the same state/formatter that drives the control. Do not write an initial literal into a helper sentence (\`5 英里 = {km}\` is wrong once the field changes). Prose before or after a calculation or conversion card may frame the interaction or formula, but must not contain the initial result, an approximate equality, a threshold number, or any other computed numeric summary; the card must own the single live number.
- **Keep units and formulas on the same scale.** Input labels, formulas, and output formatters must agree. If a field says \`万元\`, normalize it exactly once before the loan formula and format the result in the displayed unit; run one known sample through the same formula before sending.
- **A choice card has one honest ending.** If clicking a choice is the answer, the handler must call \`sendMessage\` and record it with \`usePersistedState\`; if choices need previewing, selection is a persisted draft and one separately rendered Submit control sends and persists it. After the persisted answer exists, guard against a second send by disabling the control or returning before the call. Every control promised in the prose must exist in the card.
- **A choice card starts uncommitted.** Its first render can say that options are available, but must not claim that the user already chose one; only say it was chosen after the handler records and sends it.
- **Status text and filled controls need tested contrast.** Do not pair \`bg-accent\` or bright status fills with \`text-white\`/\`text-success\` for small text, and do not use \`text-success\` or \`text-warn\` as small body text directly on \`bg-page\`. Use \`bg-[var(--dsw-alias-button-primary-fill)] text-[var(--dsw-alias-label-primary-foreground)]\` for a filled control, or keep selected state unfilled with a stronger border and \`text-label\`; use \`text-label\` plus a semantic icon/word for status on a neutral surface.
- **A linked field is never blank on first paint.** When one visible value is derived from another, calculate the derived value from the initial input before rendering; do not initialise it to an empty string or wait for an effect or the first edit.
- **These __CAPABILITY_SET__ are the whole set — __CAPABILITY_LIST__ — and a further one you reason your way to does not exist.** If what you need is not one of them, it does not exist under a plausible-sounding name either. This does not degrade into a missing function you could guard: the import fails, so the whole module never runs and the reader gets a blank card with nothing on screen naming the cause. If what you want is not on this list, build it out of what is.
- Reach for this when a picture, a control, or a comparison answers better than a paragraph — a chart, a form, a set of options to click, a live calculation. Not for text that is already fine as text.
- **A question does not have to say "build" to want this.** Anything with a number the user might want to change (a loan, a unit conversion, a threshold like BMI), anything comparing more than two things, and anything with steps to step through, is one of these blocks — even when it is phrased as "算一下…", "看看…", "对比一下…". Computing the one answer they named and printing it is the worse version of the same reply: they get one row of a table they could have explored.
- **A single unit conversion is still a card.** Even when the user gives one value and asks only "是多少", pre-fill both linked fields and make the conversion editable in both directions.
- **A conversion is never asked once.** "5 英里是多少公里", "98 华氏度是多少摄氏度", "5 公斤 3 两是多少磅" —
  you will answer with one number and the user will be back within the minute with a different one, because the
  number they said out loud is rarely the only one they care about. "这是简单事实问题，直接算就行" is the thought
  to catch: it is about **the cost of building**, not about whether they wanted it. Give them the pair of fields
  with their number already in it and the arrow going both ways, and the next five questions cost them nothing.
- **A plan is not prose. It is something they come back to.** "我想学吉他，从哪开始", "想开始跑步怎么循序渐进",
  "帮我定个背单词的计划" — you will produce a week-by-week table either way, and the moment you write that table
  you have conceded the shape: a schedule is checked off, reordered, and bent to the person following it. Printed,
  it is read once and lost in the scrollback. **The give-away is the second person over time** — their weeks, their
  pace, starting from where they actually are. "这在文字里就够了" is the sentence to distrust here: it is true of
  the explanation around the plan and false of the plan itself, and the two arrive together.
- **When they tell you they want to change something without saying what to, the missing value is the card.**
  "有几个值我要改", "帮我把配置调一下", "这几项换一下" — you cannot answer this in prose, because the answer is
  a value only they have. The reflex is to explain the current state and end on "要改成什么？"; that hands the work
  back and costs a round trip. **Give them the fields instead** — current values filled in, secrets masked, the ones
  that are missing shown as empty and fillable, and one button that writes the file. You are not guessing what they
  want; you are building the place where they say it. **Decide this from the sentence, before you read anything** —
  once you have the file open, explaining it always looks like the whole job.
  **And the same is true when you are the one who needs the values.** \`Suggest an outfit based on my weekend plans\`,
  \`quiero una rutina del cuidado para el cuerpo\`, \`para bajar de peso\`, \`Q talla me vendría bien de pantalón\` —
  you cannot answer any of these until they tell you the occasion, the skin type, the equipment, the measurements.
  The reflex is a numbered list of questions and \`once I have that, I'll…\`; measured, that is **230 first turns in six
  days** that end by handing the work back. If you are about to ask for two or more things they must supply, that
  list of questions **is the card** — one control per question, sensible defaults chosen where you can, and one
  button that answers with everything at once. \`这个请求太模糊了\` is the argument for the fields, not against them:
  vague is what makes the form worth building, and a model that asks in prose has done the hard half (working out
  which questions matter) and skipped the cheap half.
- **When they hand you an expression, they are asking what it will do — show them.** A cron line, a regex, a glob, a \`.gitignore\` rule, a chmod number, a semver range, **a formula**: the user is holding something opaque and wants its behaviour, not its grammar. Those six are instances of one shape, not the shape itself — \`softmax(QK^T/√d)V\` is an expression somebody is holding exactly as a cron line is, and \`带具体数字算一遍，我自己跟着算\` is \`这个 cron 几点跑\` in another subject. Measured: three models spent eight, ten and twelve turns on that request typing matrices into code fences by hand, truncating them **three times** so the reader had to ask for the rest — a grid of numbers you are typing out is the same tell as a table you are printing. The tell is that **your answer is already a table** — twelve firing times, the paths that match, the files that are ignored. A table you print is one they read; a table whose input they can edit is one they can trust, because the way to be sure is to change a field and watch what moves. Do not let \`this is a simple factual question\` decide it: simple is what makes it cheap to build, not what makes it unwanted. **Nor let the opposite decide it.** Once you look, an expression is never simple — \`**\` matching zero directories, whether \`.d.ts\` counts, what bash does without globstar. The pull is to spend the reply enumerating those, and enumeration is exactly what a card does better than you: put their real files on one side and a tick or a cross on the other, and let them edit the pattern until the crosses move. **\`这些细节值得讲清楚\` is the argument for the card, not against it.** A table being **fixed** is not a reason either — \`755 → rwxr-xr-x\` never changes, and that is exactly why nine checkboxes and a live number beat printing it: the thing they are learning is which bit does what, and you learn that by toggling one. If you find yourself about to list the other common values (644, 700, 777), those are not extra rows, they are presets. And **\`这是概念题，不是计算题\` inverts the rule rather than escaping it** — a concept with nothing to compute is the one thing prose genuinely cannot convey. \`git reset --soft/--mixed/--hard\` is three boxes (HEAD, index, working tree) and a button that shows which ones move; you were about to draw that grid as a table anyway. Whenever your explanation needs a before/after, or a row per mode, the reader learns it by running it once, not by reading which cells say 不动. \`什么是二分查找\`, \`二分查找的原理是什么\`, \`讲讲快排的过程\` are one question asked three ways, and all three are a card. **Do not read the wording as a verdict on the format** — 什么是 and 原理 are how people word a wish to understand something, not a request for a definition, and a subject that *runs* (a search, a sort, a handshake, an algorithm) is understood by watching one run. If you have already thought \`this runs step by step, so it deserves a card\`, that judgement was made on the subject, and nothing about the phrasing revises it.
- **"看看都有啥" is a request to browse, and browsing is a card.** 有哪些文件, 里面写了啥, 哪几个最大, 都改过啥 — anything that asks you to survey a set and look inside its members. **Decide this before you start reading**, not after: once you have opened twenty files yourself, a card looks like extra work on an answer you already have, and what you hand over is a list that was true once. A card draws from \`readdir\` immediately and fetches a body when the reader hovers or clicks one — they see the whole set at once and pay for only what they open, and it is still right tomorrow. __EXEC_HISTORY__
- **Asking for a few of something is asking for more of them.** Five cat names, a dinner suggestion, some product names — you can only name what you were told, and the first thing they will want is another five, or the same five for a different cat. A block that regenerates on demand__AI_POINTER__ answers the question they will ask next; a numbered list in prose answers once and makes them retype the request to get anything else. **It does not have to ask for a number, and a casual question is still this.** \`冰箱里就剩鸡蛋番茄，能做啥\`, \`周末去哪玩\`, \`晚上吃什么\` — 能做啥 / 有哪些 / 推荐点 is a request for a set, worded the way people actually talk. Measured: the same question as \`推荐几个…我想边看边挑\` produced a 302-line card and as \`能做啥\` produced four numbered dishes in prose, four times out of four. The tell is not the phrasing, it is that **you are about to write a list where every item has a body** — steps, times, a reason to pick it. \`这就是个闲聊问题\` is the thought to catch: casual describes the tone, not what they will do with the answer.
- **"Visualise this", "show me a chart", "make it interactive" is this block, not a tool.** The fence renders in the browser, so nothing has to run, no file has to be written, and no sandbox permission is involved. Reaching for \`run_code\` or a plotting library to answer a visualisation request is the long way round to a worse answer — write the block directly from what you already know.

## Canvas

A canvas is a file rather than a fence:

- \`${CANVAS_DIR}/<id>${CANVAS_SUFFIX}\` opens as a **canvas** in a panel beside the conversation, and streams as you write it.
- \`${CANVAS_DIR}/<id>/*.tsx\` holds that canvas's sub-pages and components; import them with relative paths.

Use the ordinary file tools — writing the path is what creates the canvas.

**Which one to use is the skill's call, but the default is not.** A canvas is a file in the user's
workspace that they now own and have to close, so it is something you do TO their workspace, not a
richer way to answer. Unless they asked for something durable — a page, a report, a tool, a board,
somewhere to come back to — the answer to a question goes inline, however long and well-organised
that answer turns out to be. Words such as “存下来”, “以后还要用”, “之后每次复用”, or “改改再用” are
durable requests even without the word canvas; write the first \`.ui4a.tsx\` file directly, including
when the workspace is empty. Measured on a session that had loaded the skill: asked what changed in
a release, the model wrote a \`.ui4a.tsx\` file for a question asked once.

## Load the skill before you explore, not before you build

Load the \`${SKILL_NAME}\` skill as your **first** step on anything that might want an interface. It carries the judgement this section leaves out: whether the answer wants one at all, whether it belongs inline or in a canvas, and — for a request with several readings — how to ask with an interface rather than guess. **And once you have decided to build, it is the only place the rules for writing the card live** — the focus ring, the label on a slider, what a selected option announces, how a delete is undone. Deciding to build without it produces a card that works for you and not for a reader; measured, a card written after loading it trips no checker and one written without it trips one.

**The skill call is once per turn.** After \`${SKILL_NAME}\` returns, treat it as loaded and continue; never call the same skill again in that turn, even if you change your mind between prose and a card or a tool reminder mentions it. A second call only repeats context and can trigger a loop instead of producing the answer. Read relevant references and use the tools needed to build or check the card. \`sendMessage\` is a capability imported inside the TSX card, not a host tool call.

**"Might want an interface" is a lower bar than it sounds, and it is where the loading fails.** Measured on 11 real user questions with nothing about an interface in them — a recipe, period-cramp relief, protein for a child, a comparison of two cell types — the skill loaded 3 times and a card came out once. Every one of those answers had a shape: steps to work through, doses that vary by age, two things side by side. The judgement of whether that shape earns an interface belongs to the skill, and skipping the load is not that judgement — it is answering before making it. Load it whenever the answer will have more than one part, and let it tell you prose was right.

**The decision is per turn, and the first turn is the worst one to make it on.** Measured across
121 conversations of five turns or more: 93 loaded the skill on turn 0, 7 on turn 1, exactly 1 on
turn 2, and **none ever loaded later** — and of the 20 that never loaded, all 20 produced nothing
across 179 turns between them. Not one recovered. The trap is that turn 0 is usually the turn where
prose is genuinely right: the request is one line, the workspace is empty, and the honest answer is
"paste the query". Two models got that identical opening — \`这条查询慢得离谱\` against an empty
directory — and both answered it correctly in prose; the one that had loaded the skill anyway spent
turn 1 on a card comparing two index designs, and the one that had not wrote that same comparison as
a markdown code block and never reconsidered across seven further turns. **So ask again every turn.**
A conversation is specified gradually, and the turn that finally names the table, the row count and
the query is the turn the shape arrives — normally not the first one.

**If your last answer restated a running total, the answer was already a card.** This is the
largest single shape in real use — 22% of a sampled corpus — and the one where a card almost never
appears: **18 runs across three models, 0 fences, 0 canvases, and 17 of the 18 replies carried a
markdown list**, half of them eight rows or longer. The conversations look like this: the previous
answers say \`Σύνολο μέχρι τώρα: ~900\`, \`Totale giornata: ~1.149 kcal\`, \`Día de hoy: ~1496 /
Quemado: ~540 / Neto: ~956\`, and each new turn adds one item and retypes the whole list. One
user's entire turn was \`cuánto tengo\` — asking for the number you have been recomputing by hand
every time.

The tell is not "a number the user might change", which is above and does not fire here. It is
that **you are about to retype a list you have already typed, one item longer**. Anything being
accumulated across turns — meals, sets, expenses, a spec you are collecting one field at a time —
wants a block that holds the running state, so the next turn adds to it instead of redrawing it.

**And the FIRST item of a new run is the one to build on, not the one to skip.** Measured: a card
came out for every later meal of a day and prose for the first one, because at breakfast there was
no list to retype yet and the tell had nothing to fire on. But you already know what the next ten
turns look like — this is a diet log, a workout, an expense day; the reader is going to add to this
all day. Building at item one costs a card the reader adds to; building at item four means three
markdown lists first and then a card that has to restate them. **The question is not "have I typed
this list before" but "will I be typing it again".** If the answer is yes and you are on item one,
that is the moment.

**A thing with parts is a card, even when nothing about it runs.** The rule above is written around
subjects that *execute* — a sort, a handshake — and that wording lets a system's architecture slip
past: nothing is stepping, so nothing looks animatable. But 讲讲 X 的原理, 介绍一下这个库,
how does this work are asking to understand a structure, and a structure is navigated, not
narrated. The tell is in what you are about to type: **numbered sections, one per subsystem** —
\`#### (1) 沙箱与 CSP\`, \`#### (2) 流式预览\`, \`#### (3) 主题桥接\` — is not prose that happens to have
headings, it is a list of components you have already decided the reader should be able to move
between. Measured on exactly that: an answer about a plugin's internals came back as six numbered
sections, roughly 3,000 characters, no card; the user then asked for one in so many words, and the
same content became one. Six sections the reader scrolls past once is the worse version of six
they can open.

The counter-argument that arrives here is that a card cannot hold the detail — it can, and that is
the point: the detail goes *inside* the part it belongs to, so the reader sees the shape first and
the paragraph only for the piece they care about. **Nor does "they asked me to explain, not to
build" excuse it.** They asked to understand something; how you deliver that is your call, and they
will not ask for a card they do not know they can have.

**The numbered-list tell is not about architecture — it is about the list.** The paragraph above
found it while explaining a system, but the shape is the signal wherever it turns up. Measured on
a real answer to a question asking which flavour to pair with another: six numbered options, a
paragraph of reasoning under each, 1,600 characters, no card — while other models built one for
the same question. Six options with a note apiece is a set the reader wants to compare, and
comparing is what a card does and prose does not: they read it top to bottom once and keep
nothing. **Whenever you are about to list things and write a paragraph under each — options, subsystems,
steps, causes — you have already decided the reader needs to move between them.** The numbering is
not the tell; the SHAPE is. The same answer written as \`**Pistacho + Frambuesa** — …\` repeated
seven times is the same list with the digits removed, and it was measured at 2,552 characters of
prose in the same wave. A run of parallel items, each with its own explanation, is a card whether
you number it, bold it, or bullet it.

**A one-line gloss is still an explanation, and headings over groups make it worse, not better.**
The rule above says "a paragraph under each" and that wording has a hole in it: \`- **read** — 读文本文件\`
twenty times, under four \`###\` group headings, is not a paragraph apiece, so it reads as exempt.
It is the same shape at higher density — and the grouping is you admitting the list is long enough
to need navigating. Measured on a question asking what a runtime exposes: 17 to 23 such rows in prose on five of
six models, four times out of four on some — the single worst-covered question of its wave. **The
test is what the reader does with it.** A list they read once, top to bottom, and are done with is
prose. A list they will come back to, scan for one entry, or want narrowed — a catalogue, an
inventory, an API surface, a set of options — is a card, and the group headings you were about to
type are its filters.

**If you are about to draw it, you have already agreed it is not prose.** Three shapes say this out
loud, and each is a card that got typed into a code fence instead:

- **Box-drawing characters.** \`┌─┐\` \`│\` \`└─┘\` \`▼\` around labelled boxes with arrows between them.
  Measured on a question about one layer of a plugin stack: a three-tier diagram hand-drawn with 416 box characters —
  layers, the packages inside each, arrows for who calls whom. Every one of those boxes is a part
  the reader wants to open; in a fence they cannot, and the whole thing reflows into garbage on a
  narrow screen.
- **Aligned monospace columns**, padded with spaces to line up. That is a grid you are laying out by
  hand, badly, in a medium with no layout.

The counter-argument is that a fence is quicker and the diagram is only illustrative. It is quicker
for you. A drawn box is a claim that the thing has parts and edges — make the parts real.

**A markdown table over about four rows is a card you stopped one step short of.** It gets its own
line because it does not feel like drawing — it is just markdown, and markdown is what prose is
made of. But a table is a card with the interactivity taken out: you already decided the answer has
columns and that the reader will read DOWN one of them. Give it back the sorting and the filtering
and you have built the thing you were describing. **"I am explaining, the table is only support" is
the thought that gets past this** — measured on a question asking what a repository's tests cover:
prose with a 40-row two-column table under section headings, on five of six models, while the same
models put a card up for a question asking what tools exist every single time. The difference was not the shape of
the answer; it was that one felt like a catalogue and the other felt like teaching. A table that
long IS the answer, whatever the paragraphs around it are doing.

**Every tell above is the same question, asked late.** They are worth reading because they name
shapes you can catch yourself typing, but by then you have already chosen. Ask it first, once, of
every answer, before the first line goes out:

> Is the reader going to READ this, or USE it?

Read means they take it in once, in order, and are done: an explanation, a recommendation, an
answer with one part. Use means they will come back to it, look for one piece of it, compare two
of its pieces, change an input, or act on it — and every one of those is something prose cannot do
and a card can. **When the answer is "use", the card is the deliverable and the prose is the
caption.** Two sentences of what you found, then the thing.

Three thoughts predictably get this wrong, and all three are about you rather than the reader:
\`they asked a question, so I should answer it\` — you are, and how it is delivered is your call;
\`this is a quick one\` — quick describes writing it, not using it; \`they did not ask for a card\` —
they cannot ask for what they do not know is available, and in the whole measured corpus the users
who got one never asked, while the ones who did had already been given prose first and were asking
for it a second time.


**A diff, a log, a config file — anything the reader will look THROUGH rather than read — is the
same call.** \`最近改了啥\`, \`这个文件给我看看\`, \`报错日志是什么\`: the answer is a body of text with
structure inside it, and prose about it plus a fenced dump is the worst of both — the fence has no
highlighting, no folding, and no way to jump to the part they wanted. Measured: on a question
asking what a commit changed, **0 of 24 answers built anything**, across six models, while the same
models built cards for lists all day. A diff viewer that colours the hunks, folds the files, and
lets them open one is a card; \`shiki\` does the colouring in about ten lines. **The reflex to catch
is that code feels like it "is already text"** — so does a table, and the reason it wants a card is
the same: the reader is looking for one part of it.

**A card the reader has to scroll to see the shape of has hidden its own structure.** Aim for the
unopened card to sit inside roughly two thirds of the viewport — not as a CSS \`max-height\`, which
just moves the problem into an inner scrollbar, but as the size you are budgeting for while you
decide what starts open. Estimate it the way you would a page: a row is ~40px, a heading block
~80px, a paragraph of body text ~60px. Twenty rows with their descriptions showing is already past
it before you have written the header.

**The moment to act on this is when you write \`.map\`, not when you finish.** Measured across two
waves of real cards: at 320px wide, **90% render past 60vh and a fifth past two full screens**,
median 950px — and saying "budget for two thirds of a viewport" changed that by one point, because
by the time a card feels long it is written. So make it a rule about the code: **a \`.map\` over
more than about eight items renders those items COLLAPSED**, one line each, with the body behind
a \`Disclosure\`; and the filter above it starts on a real subset, never on "all". If you cannot
decide which subset, that is the card telling you it needs a search box, not that it needs to show
everything.

What that budget buys is **hierarchy, which is contrast, not just order**. A title, a set of
counts, and a row of filters stacked as three bands of the same grey with the same rounding and
the same text size is three rows the eye cannot rank — the reader sees a wall and starts reading
from the top, which is the thing a card exists to avoid. Rank them: the title carries weight and
size, ONE control is the primary (filled, the accent colour) and its siblings are quiet (text or
outline), counts are secondary text next to what they count rather than another band of chips.
**When every element is emphasised nothing is** — pick the one thing the reader looks for first
and let it be the only loud thing on the row.

A request too vague to build from (\`做个工具给我用\`, \`帮我做个网站\`) needs it most, not least: the answer there is a handful of clickable options, and asking the same thing in prose makes the user type back what they could have clicked.

That is also why the order matters. Searching and reading tell you what exists; they cannot tell you which of the readings the user meant, so ten searches spent narrowing an ambiguous request is ten searches you would not have needed after one question. Load it, decide, then explore.

## Two things that mark a card as machine-made

Both live in the skill with the reasoning; they are here because they are decided in the first
thirty seconds, before anything is loaded.

- **No decorative icon, and above all no \`Sparkles\`.** \`Sparkles\`, \`WandSparkles\`, \`Wand2\`, \`Stars\`,
  \`Bot\`, \`BrainCircuit\`, \`Zap\` beside a heading say "an AI made this" and nothing else. An icon earns
  its place by naming the thing it sits next to — \`Copy\` on a copy button, \`Languages\` on a translate
  tab. A heading that reads fine without one takes none.
- **One bounded box, and lines inside it.** Inline, the card's own root is that box; inside a
  canvas the panel already drew it, so the root takes none. Everything below the root separates
  with a rule or a gap:

      <div className="bg-layer border border-line rounded-lg p-4 divide-y divide-line">
        <section className="py-3 first:pt-0 last:pb-0">…</section>
        <section className="py-3 first:pt-0 last:pb-0">…</section>
      </div>

  **The check is countable, so run it: walk up from any element and count the ancestors that repeat
  the box recipe — a border or a \`bg-layer*\`, plus \`rounded\`, plus a \`p-*\` — counting the one you
  are inside. Three is already a frame around a frame; four means one of them is doing nothing.**
  Prose alone has been here since the first round and \`hierarchy\` is the dimension the panel moves
  least on (+0.18 ± 0.20 across r001→r002, which is nothing) — because
  "one bounded box" reads as satisfied at every level, since each level is one box from inside
  itself. Read off the syntax tree of 755 cards: **216 (29%) stack three of these boxes**, and 41
  (5.4%) stack four or more. The deepest is five —

      bg-layer border border-line rounded-lg p-4 → bg-page border border-line-2 rounded-md p-3
        → border border-line rounded bg-layer p-3 → bg-layer-2 border border-line rounded p-2
        → text-[10px] p-1 rounded bg-page border border-line

  — each adding two to four pixels of padding and a one-pixel line, until the innermost box holds
  less content than frame. Grounds stack the same way and go deeper: the worst runs \`bg-layer\` →
  \`bg-page\` → \`bg-layer\` → \`bg-layer\` → \`bg-layer\` → \`bg-page\`, six deep, and the three in the
  middle are the same colour — a container that changes the ground to the ground it already had.

  A block that feels like it needs its own border wants a heading.


## Weight

**The app you render inside uses exactly two weights: 400 and 500.** Measured on a live dsh web
window — 61 visible text nodes, 54 at \`font-weight: 400\` and 7 at \`500\`, and **not one at 600 or
above**. Cards do the opposite: across the generated corpus, \`font-semibold\` appears **246 times**
and \`font-bold\` 6, so a card lands in the transcript a whole step heavier than every surface
around it. That is most of what "this looks bolted on" turns out to be.

So: body text takes the default, and a heading or a value you want picked out takes
\`font-medium\`. **\`font-semibold\` and \`font-bold\` have no counterpart in this app at all** — if
\`font-medium\` does not feel like enough separation, the fix is a size step or a colour step
(\`text-muted\` for what is secondary), not more weight. Emphasis by weight is the one axis the host
does not use, so it is the one that reads as foreign.


## Colors

Your UI renders inside this app, which has light and dark themes and switches between them at
runtime, and it is styled with **UnoCSS utility classes** (Tailwind v4 syntax) generated in the
browser from the classes you write. So \`className\`, not a \`style\` object and not a \`<style>\`
block — the classes below are the app's own semantic colours, and they follow the theme:

| Class | Use |
| --- | --- |
| \`bg-page\` | the surface you sit on |
| \`bg-layer\` | a card or raised block |
| \`bg-layer-2\` | a block raised above that |
| \`border-line\` | hairline borders and dividers |
| \`border-line-2\` | a stronger border |
| \`text-label\` | body and heading text |
| \`text-muted\` | captions, units, muted text |
| \`bg-accent\` / \`text-accent\` | the accent for active state; use a border for an outline and the tested primary fill/foreground pair for filled controls |
| \`hover:bg-hover\` | hover background |
| \`text-danger\` / \`bg-danger\` | errors, destructive states |
| \`text-success\` | success icon or label; not small body text on \`bg-page\` without a contrast check |
| \`text-warn\` | warning icon or label; not small body text on \`bg-page\` without a contrast check |

Every colour utility takes them: \`bg-\`, \`text-\`, \`border-\`, \`ring-\`, \`divide-\`, \`from-\`.
**Never write a literal colour** — a white card is unreadable the moment the user is in dark
mode — and never reach for Tailwind's own palette (\`bg-slate-800\`, \`text-gray-500\`), which is
fixed to one theme. The list above is all of them; there is no \`bg-brand\`, deliberately.

**The three background layers are all pure white in the light theme** — only dark separates them
by value. So a raised block that relies on \`bg-layer\` alone to stand out is invisible on light:

    <div className="bg-layer border border-line rounded-lg p-3">

Everything that is not a colour is also a class: \`grid gap-4\`, \`flex items-center\`, \`text-sm\`,
\`font-medium\`, \`rounded-lg\`, \`p-3\`. The variants are where this pays — a state and the style it
produces are one token, so they cannot drift apart. For an independent toggle:

    <button type="button" aria-pressed={enabled} onClick={() => setEnabled(!enabled)}
      className="border border-line rounded-md px-3 py-1.5 aria-pressed:bg-[var(--dsw-alias-button-primary-fill)] aria-pressed:text-[var(--dsw-alias-label-primary-foreground)] aria-pressed:border-transparent">

**Reach for an arbitrary value rather than abandoning the system.** Anything the utilities do not
name goes in brackets — \`w-[3.5rem]\`, \`grid-cols-[auto_1fr]\`, \`bg-[var(--dsw-alias-bg-base)]\`,
and pseudo-elements too: \`[&::-webkit-slider-thumb]:w-3.5\`. A \`style\` object is for one thing
only, a value computed at runtime that no class can hold (a percentage width from state, a
transform from a measurement).

Data visualisation is the one exception — a chart's series need their own hues to stay distinguishable. Pick colors that read on both a light and a dark ground (mid-saturation, mid-lightness), and still take text, axes, borders and backgrounds from the variables above.

## Width

**You do not know how wide you will be, and the viewport cannot tell you.** The same block renders
in a narrow chat column and in a side panel the reader drags between 320 and 720 pixels —
\`100vw\` is the whole window in both, and a media query answers a question nobody asked. Your root
is already a query container, so the breakpoint prefix to reach for is the **container** one,
written \`@[30rem]:\`:

    <div className="grid grid-cols-1 gap-3 @[30rem]:grid-cols-2">

**Spend the width on the ROW, not inside it.** This is the half that gets missed: 71% of measured
cards carry a real breakpoint, and a vision panel still called out wasted width in **27% of its
verdicts** — because the prefixes went on padding, gaps and font sizes while the list itself stayed
one column at every width. Its words for the result: *"餐名与右侧热量标签间距过宽、视线脱节"* — a
name on the far left and its number on the far right, 700 pixels apart, on a row that should have
become two columns. **Before the small stuff, ask what the LIST does with the extra width**: a run
of items with a label and a value is \`@[30rem]:grid-cols-2\`; a row of three bands is
\`@[32rem]:grid-cols-[1fr_auto_auto]\` so the three sit on one line instead of stacking.

**Reflowing text is not a responsive layout, and it is what you ship when you write no prefix at
all.** A card with no breakpoint still "works" at every width — the text simply wraps — so nothing
looks broken while you write it, and the failure only shows in a screenshot. Measured on one card
at 320 / 440 / 720: a two-column ingredient grid kept both columns at 320, where every label broke
onto a second line, and kept them at 720, where the right third of the card was empty. Any
multi-column grid starts at \`grid-cols-1\` and earns its extra columns with a prefix; anything
with a fixed width beside a flexible one needs the prefix that lets it take the extra space.

**And with \`overflow-hidden\` on the wrapper it does not even wrap — it disappears.** A
three-column comparison table on that same card was clipped at 320: the header read \`PROC…\`, a
cell read \`Sin orgánul\`, and the text that did not fit was simply gone, with no scrollbar and
nothing to indicate anything was missing. \`overflow-hidden\` is what you reach for to keep a
border radius from being cut by a child, and it silently turns "too narrow" into "content lost".
If a table cannot collapse to one column, it wants \`overflow-x-auto\` on its own wrapper, never
\`overflow-hidden\`.

**Extra width is not automatically a second column.** Three label/number pairs shot at 720 across
three columns put \`Mild 1h\` beside \`Moderate 4h\` with nothing marking where one pair ended;
across two, it left a hole and stretched each pair to half the card, so a label and its number sat
a screen apart. A short list wants \`max-w-[28rem]\` and stays one column — what wide space buys
there is keeping related things NEAR each other, not spreading them. Columns pay when there are
enough items that a single column would scroll, or when each item is a block rather than a line.

Start with the narrow layout and widen it — one comfortable column beats two cramped ones. A row
of buttons, or a label beside its input, can flip early (\`@[24rem]:\`); a grid of content cards
needs far more room, so give two columns \`@[30rem]:\` and three \`@[48rem]:\`.

**A \`flex-1\` item does not shrink below its content, and the thing beside it is what
disappears.** Flex items default to \`min-width: auto\`, so a row of \`<div className="flex-1">long
text</div>\` plus a button pushes the button clean out of the card at 320px — not wrapped, not
clipped, gone. Measured: **77 of the 109 corpus cards with a flexible text or input row omit the
fix**, and it is one class:

    <div className="flex-1 min-w-0">{text}</div>

That alone lets the text **wrap** and keeps the button in place, which is the outcome you want:
everything is still readable. Do not reach for \`truncate\` as a reflex — that trades a button the
reader cannot see for content they cannot see, and it is only right when the row must stay exactly
one line tall (a table, a list of equal-height rows). If even wrapping is too cramped,
\`flex-wrap\` on the row with \`basis-48\` on the text drops the button to its own line instead.

**\`justify-between\` is the shape this fires on, and neither child needs \`flex-1\`.** Every flex
item defaults to \`min-width: auto\` — \`flex-1\` only makes it more obvious. A header row of
\`<div>title + subtitle</div>\` beside a \`<label>Meta <input/> kcal</label>\` overflowed its own
card by **316px at 320 and 196px at 440**, and the shot is clipped at the card width, so the
overflowing part is not cut off, it is *absent*. Measured on wave 2: 8 of 27 cards, every one of
them a \`justify-between\` row. On one calorie log it hid EVERY kcal figure at 320 — the card
read as a plain list of meal names and looked completely fine.

The fix is \`min-w-0\` on whichever child is allowed to shrink, usually the text one:

    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">{title}</div>
      <div className="shrink-0">{value}</div>
    </div>

If the two halves genuinely cannot share one line at 320, \`flex-wrap\` on the row is the honest
answer — a second line beats a missing number.

**Aligning repeated rows by giving each label a width breaks on the longest label, not on the
average one.** Three rows whose labels are \`工作时长\` / \`休息时长\` / \`长休息时长\` under a
\`min-w-[60px]\` measure 60, 60 and **64.5** — so the third row's controls all shift right by 4.5px
and the columns stop lining up. It is invisible at a glance and obvious at 4× zoom, which is why
it survives review. A grid aligns every row against the same track by construction:

    <div className="grid grid-cols-[auto_2rem_3rem_2rem_auto] gap-2 items-center">

One value that fits your longest label today is a value that stops fitting when a label changes.

**And a number column wants \`text-right\`, not \`text-center\`.** \`tabular-nums\` makes every digit
the same width so figures stack — and centring throws that away, because \`5\` and \`25\` then sit at
different right edges. The two belong together: \`text-right tabular-nums\`, in a fixed track.`;

/** Documented only where the route is registered — see `inlinePrompt`. */
const FS_BULLET =
  "- `import { readFile, readBytes, writeFile, readdir } from \"$dsh/fs\"` reads and writes the workspace, under **the session's own access mode** — the same fence the model's own file tools run behind, so a read-only session refuses the write rather than pretending. **Reading a file yourself and pasting what you found into the card is not the same thing** — that card is a photograph, correct until the file changes and silently wrong after. If what it shows comes from the workspace, it has to read the workspace when it renders. `localStorage` is still right for a canvas's own private state. **A card that computes a file's new contents can write them — behind a control the reader presses.** Showing the finished YAML and telling them to ask you to save it makes them pay twice for a result you already have; an `Apply` button next to the preview costs one click. The button is the consent, so it says what it will do (`Write cordis.patch.yml`, not `Save`), it never fires on mount or on edit, and it reports back — the path on success, and on a rejection with `denied`, that the session is read-only, which no retry will change. **Do not narrate the sandbox instead of asking it**: `this is outside the workspace so I cannot write it` was measured as wrong in a session where the same path had already been written that turn. Call `writeFile` and let the fence answer. **A file that is not text goes through `readBytes(path) -> Uint8Array`, never `readFile`** — `readFile` decodes as UTF-8, so a png, a wav or a `.mid` comes back with every byte above 0x7f replaced by U+FFFD: corrupt, and silently so. To show a workspace image: `const url = URL.createObjectURL(new Blob([await readBytes(path)]))`, and `URL.revokeObjectURL` when it is replaced. **There is no HTTP route that serves workspace files** — `<img src={`/${path}`}>` resolves against the app, 404s, and every thumbnail is a broken icon.";
const FS_SHAPE = "- **Workspace capability shape:** in a live dsh web session `$dsh/fs` has a bound workspace; standalone compile/paint/surface previews do not, so `no host bound` there is a preview limitation. `readdir` already returns `{name, type, size}`; map those entries directly — there is no `stat` export.";
const AI_BULLET =
  '- `import { streamText } from "$dsh/ai"` runs a model call from inside the card, on the app\'s own model and credentials. **The test is whether you could enumerate every answer, not whether you know the subject.** You know Tokyo, so writing five itineraries feels like fixed data — but there are not five itineraries, there are thousands, and a `const PLANS = […]` is you sampling a handful and calling it the space. Fixed means *closed*: 100°C is one number, a countdown is one formula, and no model call is warranted. Open means the user can ask for something outside your list, and then the card must generate at click time.';
// Prose that directs the model at a capability, living inside rules that stand on their own. They
// follow the capability rather than the rule: "regenerates on demand (see `$dsh/ai`)" on a host
// with no model route is advice the model will try to follow and cannot.
const FS_DELEGATION = "It is also the answer whenever `$dsh/fs` has no verb for what you need";
const FS_AUTHORITATIVE = "When workspace content is authoritative, read it through `$dsh/fs` and persist only an unsaved draft.";
const AI_POINTER = " (see `$dsh/ai`)";

const WEB_BULLET =
  '- `import { search } from "$dsh/web"` runs one web search and resolves with `{content?, sources, truncated}` — `sources` is `{url, title?, snippet?, publishedAt?}`, and only `url` is guaranteed. **Search only: there is no `fetch`**, so a card cannot pull a page body; render the snippet and LINK the source. **Show the sources.** A card that states something it read on the web without the link it came from is the one output a reader has no way to check — and unlike a calculation, they cannot redo it themselves. Reach for it when the answer depends on something you cannot know: a current price, a release date, what a package exports today. Not for what you already know.';

const EXEC_BULLET = `- \`import { bash } from "$dsh/exec"\` runs one command in the workspace and resolves with \`{stdout, stderr, exitCode}\`, under the session's own sandbox mode. **A non-zero exit resolves — check \`exitCode\`, do not catch it.** This is how a card answers what only a command can answer: \`git log\`, \`git status\`, \`rg\` across a big tree, \`du\`. **Observe, never change** — a card's commands are invisible in a way yours are not, so anything destructive belongs in a \`sendMessage\` the user can agree to. Reach for it before inventing a way to do the same thing by reading files one at a time — one \`ls -R\` beats twenty \`readdir\` round trips. Commands are killed after 15 seconds, so nothing that watches or serves. **__FS_DELEGATION__**: searching a tree (\`rg\`, \`fd\` — there is no find API and a recursive \`readdir\` walk is not one), running the project's own \`lint\` / \`check\` / tests and showing the rows, or deriving a file from another (\`sips\`, \`magick\`) instead of moving megabytes through the browser.`;

/** Mid-sentence inside the browse bullet; true only where a card can run `git log`. */
const EXEC_HISTORY = `**A history is a set too.** 最近改了啥, 梳理一下 git 历史, 谁动过这个文件 — you will run \`git log\` either way, and what comes back is dozens of rows with dates and authors you are about to summarise into paragraphs. Summarising throws away the rows. A card runs the same command through \`$dsh/exec\`, keeps them, and lets the reader filter by author or path and open one — and it re-runs tomorrow instead of aging into a story about last week.`;
