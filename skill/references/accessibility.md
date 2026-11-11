# Accessibility, controls, and motion

- **If you take the focus ring off, put something back.** `outline-none` on a borderless input
  is the most common single thing in these cards that breaks keyboard use: **77 of 378 remove the
  ring and 0 replace it**, so tabbing through the card moves an invisible cursor. The
  browser's default ring is ugly next to a custom input, which is why it goes — the fix is a
  ring you like, not no ring:

      <input className="outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" />

  `:focus-visible`, not `:focus` — it shows the ring for the keyboard and not for the mouse,
  which is the reason the ring was annoying in the first place.

- **The rules below share one cause, and knowing it is worth more than the list.** A card gets
  written as a _picture_ of an interface — the slider looks right, the number reads right, the
  ring is visual noise so it goes. Every one of them is correct through a mouse and an eye, and
  broken through a keyboard or a screen reader. Measured: the two most common pairs of defects
  in 378 cards are a stripped focus ring beside an unlabelled slider (8 cards) and an unlabelled
  slider beside an unguarded number field (6) — the same card, treating its controls as decoration
  three times over. When you add a control, ask what it announces and what happens on Tab.
- **A control the keyboard cannot reach is not a control.** Two shapes, both measured across 378
  real cards and neither mentioned here before: **17 cards put `onClick` on a `<div>`**, which
  takes no focus and answers no Enter or Space, and **31 buttons whose only content is an icon
  carry no `aria-label`**, so a screen reader announces "button" and nothing else. Both are one
  word to fix and invisible to you, since a mouse works either way:

      <button type="button" aria-label="复制" onClick={copy}><Copy size={14} /></button>

  If it does something when clicked, it is a `<button type="button">`. A `div` with an
  `onClick` is a div.

  If the control opens a panel, use `DisclosureButton`/`DisclosurePanel` and read Headless UI's
  `open` render-prop value, or use a native/custom disclosure whose API is actually controlled. Do
  not put `aria-expanded` on an unrelated button while changing a separate `openPaths` value:
  `aria-expanded` must mirror the panel that actually changes, and a custom implementation must
  pair it with an `aria-controls` id. Headless UI `Disclosure` only has `defaultOpen` for its
  initial state; it does not accept controlled `open`/`onChange`. If the reader should keep the
  panel after a remount, use `<details open={...} onToggle={...}>`, a custom button + panel driven
  by persisted state, or a primitive with a documented controlled API.

  In a file browser, expanding a row is disclosure, not selecting a file. Keep persisted
  `openPaths`/`expanded` separate from a persisted `selectedPath`; use `aria-expanded` and
  `aria-controls` for disclosure, and give the distinct pick-one selection control a native radio
  (or full radio keyboard behavior) plus a handler that writes `selectedPath`. If expansion must survive a remount,
  use one controlled source of truth instead of persisted `defaultOpen` plus an independent
  internal disclosure state. Do not call an expandable row “selected” unless it performs that
  selection. Do not try to make Headless UI `Disclosure` controlled with `open`/`onChange`; choose
  the native/custom or controlled primitive described above.

  The same rule applies to click-to-edit headings, labels, and rows. Do not put `onClick` on an
  `<h1>`, `<span>`, or other static element and leave keyboard users without a way to enter edit
  mode. Use a real `<button type="button">` with a visible focus style, or render the `<input>`
  directly; if a custom element is unavoidable, give it `role="button"`, `tabIndex={0}`, and Enter
  and Space handlers together.

  **A clickable row is the case that survives this rule** — 13 of the 17 are a list row, a table
  cell, or a card, where wrapping each one in a `<button>` feels wrong. It is not: a `<button>`
  with `display: block; width: 100%; text-align: left` looks exactly like the row and is
  reachable. **`textAlign: "left"` is the part that gets dropped, and it is needed whatever the
  display is.** A row laid out as `display: flex` (to push a trailing action right with
  `space-between`) still inherits the button's centred text, so a short bold title sits visibly
  off-centre above the longer line beneath it while everything else looks left-aligned — the two
  cards where I hit this both had `flexDirection: "column"` on the text block, which declares the
  axis and does nothing about the alignment. If the row genuinely cannot be one — a virtualised list measuring its own height —
  then `role="button" tabIndex={0}` and an `onKeyDown` for Enter and Space, all three, because
  any one alone leaves it half-reachable.

  **A slider is the same problem with no visible text to fall back on.** 61 range inputs across
  the corpus carry no label of any kind, and unlike a text field there is no placeholder and
  nothing inside the control to read — a screen reader announces "slider, 40" and stops.

- **Hover-only controls must also appear on keyboard focus.** A delete or edit action styled with
  `opacity-0 group-hover:opacity-100` is effectively hidden from a keyboard user. Pair the hover
  variant with `focus-visible:opacity-100` (and keep a focus ring), or keep the action visible.
  The visibility variant must be `focus-visible`, not only `focus`, so a mouse click does not leave
  a transient action stuck open and keyboard users still get the same affordance.

  Almost every one of them HAS a visible name: **38 of 54 put it in a `<span>` directly above
  the control**, which looks labelled and announces as nothing. A `<span>` is not a label, and
  neither is the number beside it — both are separate elements, connected to nothing:

      <input type="range" aria-label="音量" min={0} max={100} value={v} onChange={…} />

  **And a bare `<input type="range">` is the loudest thing on the card.** The browser paints its
  own track in the OS accent — a thick, fully saturated blue that ignores your theme, is identical
  on light and dark, and outshouts the number beside it. **43 of the 52 corpus cards with a slider
  ship it untouched**, including all three reference cards. `accent-color` does not fix it:
  measured side by side, it swaps one blue band for another. The track and the thumb are
  pseudo-elements, which utilities reach through a bracketed selector on the input itself:

      <input type="range" className="flex-1 min-w-0 appearance-none bg-transparent
        [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full
        [&::-webkit-slider-runnable-track]:bg-line-2
        [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:-mt-1.5
        [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5
        [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-label" />

  The thumb takes `bg-label`, which contrasts the TRACK and therefore inverts with the theme.
  Note what this spelling removes: the previous version of this rule taught the same overrides in
  a `<style>` block, and a card wrote `className="r"` on the input against a `.r
  input[type=range]` selector — asking for an input _inside_ the input. Not one declaration
  matched, the OS-blue track shipped, and the dead override block sat in the source looking
  correct. A bracketed selector is attached to the element it styles and cannot miss it.

  Then decide what the control means, because the three shapes are not interchangeable and you can
  tell them apart from what the number is:

  - **Picking a value** (speed, font size, a threshold) — plain track, thumb marks _where you are_.
    Filling the left half would claim the value accumulates, and 120ms is not an amount of anything.
  - **An adjustable amount** (budget, volume, progress you can scrub) — fill the left of the track,
    because its length IS the quantity. The fill moves with the value, so this is one of the few
    places a `style` object is right: put the gradient there and leave the rest in classes.

        style={ { background: `linear-gradient(to right, var(--dsw-alias-state-business-primary) ${pct}%, var(--dsw-alias-border-l2) ${pct}%)` } }

  - **An amount they cannot change** — fill only, and then it is not a slider at all. Two nested
    `<div>`s render identically and announce honestly; a `readOnly` range still says "slider" to a
    screen reader and invites a drag that does nothing.

- **And when the content arrives on its own, say so where it lands.** A card that fetches shows a
  spinner becoming a list; someone using a screen reader gets nothing — focus has not moved, and
  the new content is silent below it. **0 of 64 corpus cards that fetch anything announce their
  results**, the one defect a fresh batch still gets wrong too. One attribute on the container
  the results land in:

      <div aria-live="polite">{loading ? <Spinner /> : <List items={rows} />}</div>

  On the container, not the spinner — the element has to be in the DOM BEFORE the content changes
  for the change to be announced at all.

  **This is the one rule whose effect you cannot see.** A missing focus ring is visible the moment
  you tab; an unlabelled icon reads wrong the moment you look. A card with no live region looks
  exactly like one that has it, in every state, so the only way it gets written is on purpose.
  Measured: **8 of 23** cards that fetch anything announce the result, against 88-94% for every
  other rule in this section.

  **And when it fails, say so where the results would have been.** `} catch {}` around a
  `streamText` or a `bash`, then `setLoading(false)`: the spinner stops, the card is empty, and
  nothing tells the reader whether it failed or simply found nothing. **15 of 378 corpus cards do
  this, 14 of them calling the model** — where a request failing is the likeliest thing worth
  explaining. Rendering `stderr` counts; so does letting it throw to the surface's error
  boundary. An empty `catch` around the call itself does not.

  A `<label>` BESIDE the control names nothing. `<label>音量</label><input type="range" …/>` is
  the shape two corpus cards took, and it is worse than no label: it reads as done. A label only
  associates when it wraps the control or carries `htmlFor` matching its `id`:

      <label>音量 <input type="range" value={v} onChange={…} /></label>   // wrapping, so it names it

  **A `<select>` has the same problem for the same reason** — its options are its value, not its
  name, so an unlabelled one announces "combo box, 每天" and the reader never learns what it
  selects. Six corpus cards, and the same two fixes. The screen catches these; nothing said so
  until now, which is why they are still here after the slider rule landed.

- **Selected state is not a colour.** A group of choices where the picked one differs only by `background` or `border` reads as three identical buttons to anything that is not looking at it — a screen reader, a keyboard user checking where they are, a browser's own find. Put the state on the element:

  ```tsx
  const sessionGroupName = useState(() => `session-${crypto.randomUUID()}`)[0] // each card is a separate React root
  <fieldset>
    <legend>选择场次</legend>
    {SESSIONS.map((s) => (
      <label key={s.id} className={s.id === picked ? "picked" : ""}>
        <input type="radio" name={sessionGroupName} value={s.id} checked={s.id === picked} onChange={() => pick(s.id)} />{s.label}
      </label>
    ))}
  </fieldset>
  ```

  Native radios provide the pick-one state and arrow-key behavior together. If you build custom
  `role="radio"` buttons instead, implement roving focus and arrow-key navigation too; a click
  handler plus `aria-checked` does not complete the keyboard interaction.

  **The tell is the ternary you are about to write.** Measured across 378 cards: 95 of the 114 that
  get this wrong express the selection as `background: picked === x ? … : …` — one shape, whatever
  the array is called (`PRESETS`, `options`, `ranges`, `STYLES`, `MODES` all appear). If you are
  writing a conditional `background` inside a `.map` over choices, the state belongs on the
  same control, and it is the same condition you already typed. The className spelling needs it just
  as much — moving the ternary into a string changes nothing about what is announced:

  ```tsx
  const presetGroupName = useState(() => `preset-${crypto.randomUUID()}`)[0]
  <label className={`btn${picked === x ? " active" : ""}`}>
    <input type="radio" name={presetGroupName} value={x} checked={picked === x} onChange={() => pick(x)} />{x}
  </label>
  ```

  **A disabled control should say why, in its own label.** Two wave-2 cards gate the same form.
  One writes a greyed-out `Calcular mi plan` and leaves the reader to guess which field is
  missing; the other swaps the label to **"Completa tus datos para continuar"**. Same disabled
  state, no extra element, and the button explains itself. When a precondition disables a control,
  put the precondition in the label.

  **The row of presets is where this gets dropped.** Measured: three cards answering the same `chmod` question, months apart, each wrote `aria-pressed` on its permission-bit grid and then nothing at all on the preset row twenty lines below — 755, 644, 700 shown as pills, the active one differing only by `background`. `PRESETS.map` is the commonest shape this fires on across 378 cards. A grid of toggles looks like state and a preset row looks like decoration; they are the same widget, and the one that looks like decoration is the one that gets it wrong.

  `aria-pressed` for a standalone toggle, native radios for a pick-one. The selected state belongs beside the ternary you already wrote; the fieldset and legend tell a screen reader which choices belong together.

- **Getting the attribute right and the pixels wrong is the commoner half.** A vision panel reading
  59 cards raised this in **22% of its verdicts**, in one recurring form: `aria-checked` correctly
  set, and the selected chip differing from its siblings **only by background colour**. That is one
  channel, and it is the channel that fails first — greyscale, a dim screen, or the 8% of men with
  a colour vision deficiency. The fix is a second channel on the same ternary, and it costs a
  class: `font-medium` on the selected one, or a `✓` before its label, or a ring the unselected
  ones do not carry. **Colour may be the loudest signal; it may not be the only one.**
  (No screen for this one, deliberately: a prototype matching the template-literal ternary found
  **7 selections across three waves and zero colour-only ones**, against 22% in the verdicts — the
  shapes a card writes this in are too many for a regex, and a detector that narrow reports a
  clean sweep on a defect that is everywhere.)

  **Write the state and the style it produces as one token, and this whole class of bug stops
  existing.** `aria-checked:bg-[var(--dsw-alias-button-primary-fill)]` is a single string: there is no second place for it to
  disagree with. Measured on a card written before that was possible — the CSS said
  `.sev-btn[aria-pressed="true"]`, the JSX twenty lines below wrote `aria-checked={o.id ===
  severity}`, both correct on their own, and they simply never met. All three buttons rendered
  identically at every width while the card carried a full selected-state block it never used. It
  compiled, it rendered, no checker fired, and only a screenshot showed it. The same card's
  `<style>` also opened with `.r { display: grid; gap: 12px }` and put `className="r"` on an
  `<input type=range>`: the slider became a grid, every slider override addressed an input inside
  an input, and the root never got its `gap`, so the blocks below sat flush. One misplaced class,
  three symptoms, none of them where the class was.

  So: a state variant (`aria-checked:`, `data-[open=true]:`, `hover:`, `focus-visible:`) rather
  than a selector that has to go and find the element.

  **Contrast is part of the selected state.** The light theme's accent is `#4176e6`; white text
  on it is only 4.23:1, and the dark theme drops to 2.66:1 for small text. Do not write
  `bg-accent text-white` for a filled control. Use the host's opposing pair instead:

      className="bg-[var(--dsw-alias-button-primary-fill)] text-[var(--dsw-alias-label-primary-foreground)]"

  For a selected chip, an unfilled `border-[var(--dsw-alias-state-business-primary)]` plus
  `text-label` and `font-medium` is safer than a bright fill. Likewise, `text-success` and
  `text-warn` are status hues, not guaranteed body-text foregrounds on `bg-page`; use `text-label`
  with a semantic icon/word, or a tested foreground/background pair. Check the actual font size,
  because a pair that passes for a heading can fail for a 10px badge.

  This is about state that _persists_ after the interaction. A key that lights while held, a row that highlights on hover — those are momentary feedback and want nothing announced; a state that is over before it is read is worse than none.

- **Every visual change is continuous.** No jump cuts: enter from where the element is, and let exits finish.
- **Treat reduced motion as a source gate, not a finishing touch.** Before sending, search every
  `className` for `animate-`, `transition-` (including `transition-transform`), and keyframe utilities and add
  a matching `motion-reduce:` variant to the same moving element. This includes chevrons and
  decorative loaders, not only the main content transition. A loading spinner needs
  `animate-spin` plus its reduced-motion off variant; a reveal or drag affordance needs
  `transition-transform` plus the matching reduced-motion off variant (for example,
  `transition-opacity`, `transition-colors`, or `transition-[...]`). Do not leave a keyframe, pulse, spin,
  bounce, or transform transition unguarded just because it is decorative. Measured across 378
  real cards: 131 animate and **7** honour the preference. It is not a preference about taste —
  people turn it on for vestibular disorders and migraine, and a looping demo is exactly what it
  is for. It is one more token beside the transition you already wrote:

      <div className="transition-transform duration-150 motion-reduce:transition-none" />

  For a keyframe animation the pair is `animate-… motion-reduce:animate-none`. The old spelling
  of this rule needed a `<style>` block for the media query, which is why 59 of those 131 cards
  could not follow it at all: they styled inline, and a media query has nowhere to live in a
  style object. A variant has nowhere it cannot live.

  Where the motion IS the explanation — a packet crossing a diagram, a sort swapping two bars —
  shorten it rather than removing it (`animation-duration: .01s`), so the card still steps.
