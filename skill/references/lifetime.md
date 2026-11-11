# State, submission, and persistence

Two things follow from the lifetime difference:

- An **inline** block that the user acts on should _end that step_ — see the next entry for WHICH control ends it, because on a card whose options need previewing it is not the one they pick with. Whichever it is, that control does two things: send the result with `sendMessage` **and** record what was chosen in `usePersistedState`, so the card still shows it when scrolled back to weeks later.

  **The second half is the one that gets dropped, and it fails in two different ways.** Measured over the 105 turns where a reader actually submitted something: **36 (34%) left the card looking exactly as it had before the click**, and another **20 (19%) showed the choice and then lost it on reload** — 53% between them, and evenly spread across every model, so it is the rule and not a habit. The first is forgetting to record at all (`sendMessage` treated as the finish line); the second is recording into `useState`, which a reload throws away. Both read to the reader as a form that did not take their answer.

  So the submit handler has three statements, not one:

      const [answer, setAnswer] = usePersistedState<string | null>("<this card>-answer", null)
      …
      onClick={() => { setAnswer(pick); sendMessage(…) }}        // record, then send
      …
      {answer !== null && <p className="text-muted">已选择：{label(answer)}</p>}   // and SHOW it

  The third line is the one nobody writes — but not for the reason it first looked like. Of the
  cards that call `usePersistedState`, **91 of 93 do render the value somewhere**; what they render
  it as is `aria-pressed` on the button that was clicked. Reading the turns where a submit left the
  card unchanged: **31 of 42 mark the choice with a highlight and say nothing in words**, and 19 of
  those 42 hold it in `useState`, so the highlight is gone after a reload. A highlight is a fine
  way to show which control is active while the reader is still there; it is not an answer to
  someone coming back to this card next week, who sees one button shaded and no statement of what
  was decided. Say it in words AND keep it in `usePersistedState`. (Re-firing on reload is the opposite mistake and does not happen — 0 of 105 — so
  guard the send with the recorded answer, not with anything cleverer.)

- **Exactly one control ends the step, and the reader must be able to find it.** This is the
  single largest hole in what gets built: across 161 runs where the reader actually clicked
  something, **108 of them — 67% — never once got a result back out of the card**, 468 clicks that
  went nowhere. It is not one model's habit (every one of the ten does it) and not one case's
  (every case does it). The shape is always the same: a card you can fiddle with forever and never
  finish.

  **The check is one grep, so run it on what you just wrote: does the source contain a
  `sendMessage` call at all?** Re-measured over 171 clicking runs, 117 of them dead: **90 — 77% —
  have no `sendMessage` anywhere in the card**. The reader clicks `RESTful (JSON)`, `下一步 →`,
  `2. 尺度缩放 / √d` — real controls, wired to internal state and to nothing else — and the
  conversation stops there. Not "the ending was hard to find": there was none to find.

  Two endings are correct, and which one depends on whether the options need explaining:

  - **The options speak for themselves** (yes/no, this file or that one) — the click IS the answer.
    Two plain buttons, no card around them, `sendMessage` on click. Nothing to preview.
  - **The options mean something you have to see to choose between** — then the click SELECTS and
    shows, and a separate **Submit** sends. Clicking a tab must not fire the turn; a reader
    comparing three options should be able to look at all three first.

  The preview form is a selector, a result area, and one submit — that is the whole structure, and
  the result area is where the card earns its existence. **Start `pick` at `null`: a default first
  option is already a choice, so the first render must ask the reader to select one.**

  The option control must visibly write the draft: a native radio's `checked={pick === o.id}` goes
  with `onChange={() => setPick(o.id)}` (or a handler that calls `setPick`). A persisted value that is
  only read (`pickedId`, `active`) is not wired selection. If the same row opens details, keep
  `openId`/`aria-expanded` as a second state; its disclosure handler must not be the only handler.
  In a preview flow persist both draft `pick` and submitted `sent`: changing the option sets `pick` only;
  Submit is disabled when `pick === null || sent !== null` and its guarded handler does
  `setSent(pick); sendMessage(...)`. After submission, keep the displayed selection tied to `sent`
  and disable or no-op further option changes. Use one persisted answer only for instant-choice
  buttons that set and send together.

      const [sent, setSent] = usePersistedState<string | null>("migration-plan-choice", null)
      const [pick, setPick] = usePersistedState<string | null>("migration-plan-draft", null)
      const optionGroupName = useState(() => `migration-${crypto.randomUUID()}`)[0]
      const active = sent ?? pick
      …
      <fieldset disabled={sent !== null}><legend>选择方案</legend>
        {OPTIONS.map((o) => <label key={o.id}><input type="radio" name={optionGroupName} value={o.id} checked={active === o.id} onChange={() => setPick(o.id)} />{o.label}</label>)}
      </fieldset>
      <div className="mt-3">{active === null ? "请选择一个方案" : OPTIONS.find((o) => o.id === active)?.preview}</div>
      <button type="button" disabled={pick === null || sent !== null} onClick={() => { if (pick === null) return; setSent(pick); sendMessage(…) }}>…</button>

  `preview` is whatever actually shows the difference: a mermaid graph of the two migration paths,
  the formula rendered by katex, an SVG of the layout, a working miniature of the thing, a 3D view,
  a playable board. A paragraph of text describing the option is not a preview — the reader could
  have read that in the reply.

  **And it fires once.** `sent` above is persisted, so a reload shows the answer that was given
  rather than an untouched form, and the button cannot send a second turn for a question already
  answered.

  **The same boundary applies to any editable draft that is sent or applied, not only a choice.**
  Keep `draft` and `committed` as separate persisted values. On commit, copy the exact current
  draft snapshot into `committed`, then make every preview read and displayed "sent/applied" value
  come from `committed`. Disable or no-op the draft controls after commit; if later edits are
  supported, label the action as update/resend and send a new snapshot. Never show a sent/applied
  result while the preview still follows a different editable draft.

- A **canvas** stays interactive. It does not "complete"; it just sits there working.
- Any Canvas control labelled or described as **select, apply, submit, continue, generate, or add**
  needs a complete observable path: persist the draft, run a handler, produce a concrete effect
  (update the Canvas's persisted state, call `sendMessage`, or invoke the relevant capability),
  and show a confirmation or result. A control that only highlights an option, changes `openId`,
  or promises “我来补” without changing anything is not wired. For a choice that continues the
  conversation, use the one-time `sendMessage` + persisted answer + resend guard below; for a
  local Canvas action, actually update the artifact it claims to change.

  A feature picker has the same requirement: selecting an option must immediately update the
  artifact, invoke a capability, or send a concrete request. If the user already asked for a
  durable checklist or template, choose sensible defaults and write that Canvas in the same turn;
  a local selector that only highlights buttons is not a substitute for the requested artifact.

- A **canvas outlives the reply that made it**, so data the user puts into it — entries, notes, cards — must survive a reload on its own. Reach for `usePersistedState` from `$dsh/state`. It returns the familiar `[value, setValue]` pair and accepts a lazy initialiser, but its call signature is **key first**: `usePersistedState(key, initial)`. The value is kept in `localStorage` under a namespaced key, with the read and write already wrapped:

  ```tsx
  import { usePersistedState } from "$dsh/state";
  const [entries, setEntries] = usePersistedState<Entry[]>("expense-ledger", []);
  ```

  **Name the key after this canvas, not after the data.** `"ledger"`, `"todos"`, `"settings"` are what every card reaches for, and two cards sharing a key share the rows. Plain `useState` is a bug you cannot see while building: the ledger looks right until the tab reloads and every row is gone.
  **And a reload is not the common case — your own next edit is.** Every revision replaces the
  whole file, so the canvas remounts and anything held only in `useState` is gone; change one word
  in a label and the user's half-typed row goes with it. Persist what they typed, not just what
  they saved.

  **First write and later edits are one lifecycle.** For a durable request, the deliverable is the
  canvas file: write the first usable version directly to a stable
  `.dsh/ui4a/canvases/<id>.ui4a.tsx` path, then read and edit that same id and path when the user
  asks to reuse or change it. Keep the user's entries, selections, and drafts in `usePersistedState`
  instead of replacing them with new initial data. Say the canvas is open only after the write
  succeeds.

  **An inline card is clickable before you have finished writing it, and that is where this bites
  hardest.** The reader sees the first controls while the rest of the card is still arriving, and
  **every chunk that adds JSX remounts every component the card defines itself** — so a choice they
  make mid-stream is wiped by the next chunk, silently, with the control snapping back to its
  initial state. Measured three ways on the same card, one variable each: state in a
  card-defined child is lost, the same state in the exported component survives, and
  `usePersistedState` survives in either. **Two chunks is enough** — this is not a rare race.

  So anything the reader can change belongs in `usePersistedState`, not only the answer you
  intend to record. Do not mirror a persisted input or draft in a second local `useState` value:
  bind the control to its persisted value, or persist the raw editable string too when an invalid
  intermediate token must survive. The one case it cannot reach is a third-party component holding
  its own state:
  `<Disclosure defaultOpen>` reverts to `defaultOpen` on every remount. Headless UI `Disclosure`
  has no controlled `open`/`onChange` API, so do not pretend that adding those props persists the
  state. Use native `<details open={...} onToggle={...}>`, a custom button + panel with
  `aria-expanded`/`aria-controls`, or a primitive with a documented controlled API, and persist
  the source of truth.

  **A displayed explanation is state too.** If a sentence repeats an input or a derived result,
  render it from that same state or formatter: `{miles} 英里 = {format(km)} 公里`, not `5 英里 =
  {format(km)}`. A prose line before or after a calculation or conversion card must not contain
  its computed answer, threshold, or numeric summary — including the initial result — anywhere in
  the complete reply. Let the card own the single live number instead of creating a second rounding
  path; the framing line may introduce the editable pair or formula without giving a sample result.

  For a small editable calculation, keep the source shape this direct so the persistence and live
  text checks are visible in one place:

      import { usePersistedState } from "$dsh/state"
      const [miles, setMiles] = usePersistedState("miles-to-km:miles", "5")
      const [kmText, setKmText] = usePersistedState("miles-to-km:km", "8.04672")
      const setMilesLive = (value: string) => {
        setMiles(value)
        setKmText(Number.isFinite(Number(value)) ? (Number(value) * 1.609344).toFixed(5) : "")
      }
      const setKmLive = (value: string) => {
        setKmText(value)
        setMiles(Number.isFinite(Number(value)) ? (Number(value) / 1.609344).toFixed(5) : "")
      }
      <input value={miles} onChange={(event) => setMilesLive(event.target.value)} />
      <input value={kmText} onChange={(event) => setKmLive(event.target.value)} />
      <p>{miles} 英里 = {kmText} 公里</p>

  Apply the same shape to every editable calculator field. A mortgage with principal, years,
  rate, and repayment method has four persisted values; its labels and helper text must derive
  from those values rather than repeating the initial sample. A choice or select that starts with
  a submitted choice/select representing a user decision that starts non-null is already claiming
  a user decision, even when the card also renders a Submit button. A calculator mode or standard
  may start at a sensible default, but it is still
  editable state: persist it and make the selected mode drive the formula, thresholds, result
  classification, and explanatory labels together. Check one boundary sample for each mode.

  **If you write `setRows(prev => prev.filter(r => r.id !== id))` behind a button, keep the row.**
  Persisting is what makes that line permanent — before it, a mistaken delete came back on reload.
  Hold the removed row and offer it back:

  ```tsx
  const [undo, setUndo] = React.useState<Row | null>(null);
  const remove = (id: string) => {
    setUndo(rows.find((r) => r.id === id) ?? null);
    setRows((prev) => prev.filter((r) => r.id !== id));
  };
  {
    undo && (
      <button
        type="button"
        onClick={() => {
          setRows((p) => [...p, undo]);
          setUndo(null);
        }}
      >
        Undo delete
      </button>
    );
  }
  ```

  A confirm step does the same job — but not the browser's own `confirm()`, which is a modal
  from another era sitting on top of a panel that has its own visual language, and which offers
  no way back once it is answered.

  **The reason this is missed is not that undo is hard to write — it is that the line does not
  look like a delete.** Measured across 36 cards that destroy something: 10 shipped no way back,
  and every one of them had written one of these without recognising it:

  - `setRows(prev => prev.filter(r => r.id !== id))` — 6 of the 10
  - `delete obj[key]` on a persisted map — the other 4, and the one that reads least like a
    delete because nothing named `remove` appears anywhere near it
  - `rows.splice(i, 1)`
  - `setRows([])` behind "clear", "reset", "start over", or a new day — but only when the rows
    are the user's; clearing a queue you generated is not a delete
  - setting a quantity or a count to 0 where the row disappears at 0
  - replacing a whole persisted object — `setPlan(freshPlan)` drops whatever the user edited

  For a reusable checklist or template, separate “next person” from “restore defaults”. The former
  must transform the current persisted value and preserve its structure:

      const resetForNext = () => setBoard((current) => ({
        ...current,
        person: emptyPerson,
        phases: current.phases.map((phase) => ({
          ...phase,
          items: phase.items.map((item) => ({ ...item, done: false })),
        })),
      }))

  Keep every existing id, edited title, template-owned field, and added item. Clear an `owner`,
  `note`, or similar field only when the UI explicitly treats it as per-person/transient data. Do not use
  `setBoard(cloneFresh(DEFAULT_BOARD))` or `setBoard(DEFAULT_BOARD)` for this action: replacing the
  whole persisted object silently deletes the user's template edits. A separately labelled
  “restore default template” control may replace it, but must not share the next-person handler.

  **Reuse is not permission to expand the visible schema.** If the request says the checklist should
  contain only named fields and actions, keep item titles and template-owned fields fixed unless the
  user explicitly asks to edit them. Do not add a progress counter/bar, visible heading, helper/status
  text, undo panel, add/delete action, restore-default control, or confirmation/cancel panel merely
  because the checklist is reusable. If the request names one reset action, render that action once
  and let it run the reset transform directly; confirmation is an extra control and needs an explicit
  request. Preserve any existing template fields in the persisted object even when they have no
  visible editor.

  For split state such as `days` plus a `done` map, “next person” leaves the current `days` value
  untouched and clears only per-person fields and completion (`setDone({})`), or maps the current
  value without replacing its items. Do not emit `setDays(SEED)`, `setDays(DEFAULT_...)`, or
  `setBoard(cloneFresh(...))` from a handler labelled or described as next-person reset. Call the
  action “下一位新人” / “清空本次进度”; reserve “恢复默认模板” for a separate destructive,
  confirmed action.

  If the canvas reports or submits its state, include every user-editable field in the payload. A
  submitted/dirty key should normally be a serialized snapshot of the complete persisted object;
  a marker based only on an aggregate count (`done/total`) misses title, owner, note, and edits
  that return to the same count. Compare the complete persisted snapshot, or clear the submitted
  marker on every edit, before allowing a changed report to be sent again.

  When several independent periods or sections each have a “start”, “sent”, “submitted”, or similar
  status, persist a map or set keyed by the stable period/section id. A single `sentWeek` or
  `submitted` scalar lets one row overwrite another and makes an already-completed row appear open
  again. The same keying rule applies to per-day completion, per-item notes, and any action that can
  be taken independently more than once.

  Derive progress from the current persisted item collection. When an item is deleted, remove its id
  from completion, notes, and other per-item maps in the same update; stale ids must not inflate the
  total or remain in a future report. A template reset may clear transient progress, but it must not
  restore a default item list over the current persisted one.

  Anything the user cannot type back in under five seconds needs a way back.

  **A running clock is state too**, and the least obvious kind: a stopwatch or a timer mid-count
  reads 0 again after one edit. Measured — the interval itself is cleaned up correctly, nothing
  stacks up, but the elapsed value is gone. Store the _start timestamp_ rather than the elapsed
  count, so the display is derived and survives a remount by arithmetic.

  **Reaching for `localStorage` by hand is where this goes wrong.** A full quota, or storage
  disabled entirely, and `setItem` raises — from inside an effect, where it reaches the error
  boundary and takes the whole card down over a saved preference. Persistence went from 1 corpus
  card to 20 fresh ones once this section asked for it, and **10 of those 29 writes were bare**.
  `usePersistedState` has the `try` on both sides; use it and the question does not arise.
