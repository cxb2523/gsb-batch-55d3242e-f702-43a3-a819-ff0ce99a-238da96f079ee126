## Framing

This one runs _opposite_ in the two places, and getting it backwards is the most visible mistake:

- **Canvas fills its panel.** It already has a frame and a title bar around it. So take the whole space — `height: 100%`, your own padding, backgrounds bleeding to the edges — and do **not** wrap yourself in one more rounded, bordered, tinted box. A card inside the panel is a frame inside a frame.
- **Inline is the card.** It sits between paragraphs, so one bounded box is what tells the reader where it starts and stops.
- **But `bg-page` is the page's own colour, so a wrapper painted with it is not a box.** Measured
  from the token table: `bg-page` (that is the CLASS; `--dsw-alias-bg-base` is the variable
  behind it, and the two vocabularies are deliberately different) is `#fff` on light and
  `#151517` on dark — the same value the
  transcript behind the card is painted with, on both grounds. A root `<div>` with
  `background: var(--dsw-alias-bg-base); padding: 16px; border-radius: 12px` therefore draws
  nothing a reader can see: what is left is an invisible 16px inset and a rounded corner nobody
  can find, while the `bg-layer` blocks inside it read as the real frame — a frame inside an
  invisible frame. If you want the inline card to be bounded, bound it with `bg-layer` **plus**
  `border-line` (see the both-spellings rule below). If you don't, drop the wrapper's background
  and radius entirely rather than painting it the colour of the page.

Either way, don't restage the header. The panel already names the canvas, so a heading repeating that name is the second copy of it — measured, **22 of the 24 canvases that carried a heading had written their own filename back out**: `liste-courses` headed "Liste de courses", `waist-routine` headed "Rutina de Cintura", `bone-routine` headed "Rutina para fortalecer los huesos". Translating the id into the user's language does not make it a different line. The two that got it right show what the slot is actually for: one headed a **section** (`Ingredienti`), the other **spoke to the reader** (`Hasna, ya toca el almuerzo`). If a heading is not naming a part of the page or saying something to the person reading it, delete it; a small-caps kicker above the heading plus a subtitle under it is three lines of chrome before anything happens. **And on Chinese text an uppercase kicker is decoration that does not even render**: measured, 15 of the 19 kickers in 378 real cards set `textTransform: "uppercase"` over CJK, where it does nothing at all — the letter-spacing survives and the transform is a no-op, so what is left is a small grey line the layout did not need. One heading at most, often none. A chip in the top right has to be something the user actually tracks, not decoration to balance the layout.

## Layout

- **The space between blocks is the root's job, and it is one class on the element that holds
  them.** A card is two to four stacked blocks, and what separates them is a `gap` on their
  parent — not a margin on each child, which collapses and doubles unpredictably:

      <div className="grid gap-4">

  Measured on a card written before this syntax: the root's layout was `.r { display: grid; gap:
  12px }` in a `<style>` block, the class landed on an `<input>` twenty lines away, and the two
  blocks below ended up flush — no border between them, no space, reading as one block with a
  stray heading in the middle. Nothing failed; the gap simply never applied. A class written on
  the element it governs cannot come apart from it, which is most of why the styling here is
  classes. Inside a block the same `gap` separates its rows; a `mb-4` on one child while its
  siblings rely on the gap is what produces one odd space and eleven equal ones.

- **A collapse whose rows all start open is decoration, and a filter that starts at "everything"
  has not filtered.** Measured on two generated cards, two models, two weeks apart, both with the
  mechanism written correctly: a symptom card with one-panel-at-a-time `aria-expanded` shipped all
  six panels open at 3369px, and a 41-question study canvas — which also built a topic filter, a
  to-learn/mastered toggle AND a search box — rendered every question expanded with the filter on
  "All", repeating its two buttons 82 times down **12000px**. The model knew the list needed
  narrowing in both cases; what it did not do was choose the initial state. If the list is longer
  than a screen, the first render shows labels and the filter starts somewhere narrower than
  everything.

- **A list of options collapses the prose, not the facts — and folding the wrong half is the
  common way to end up with a card nobody can scan.** Measured on a real card recommending six
  ways to manage a symptom: each entry kept three lines of description permanently on screen and
  hid one line — `Onset: 15 min` — behind a "Show details" link, repeated six times. The
  mechanism was right (one panel open at a time, `aria-expanded` on every trigger); the choice
  of what went inside it was backwards, and the card came out 3369px tall at every width. What
  earns a permanent line is what the reader compares the options **by** — the name, the one
  number that distinguishes it. The paragraph explaining why it works is what folds. A list of
  more than about four options where every entry carries a paragraph is not a list any more, and
  the fix is not a smaller font.

- **A comparison table is read down a column, so its text cells are left-aligned and only its
  numbers are right-aligned.** Measured on a real card comparing two cell types over 12 rows:
  every cell was centred, so at 440px eight of the twelve rows wrapped to two lines and each
  line started at a different x — there is no straight edge for the eye to run down, and the
  two columns being compared no longer line up with each other row by row. Centring looks tidy
  in a mock where every cell is one short word and falls apart the moment one cell is a phrase.
  Numbers are the exception in both directions: right-align them and add
  `font-variant-numeric: tabular-nums`, so the digits stack. Header cells take the alignment of
  the column beneath them, not their own.

  **An unknown is not a zero.** A row the reader has not reported yet shows `—` and contributes
  nothing to the total. `0` is a measurement: it says the value was taken and came out zero, and it
  drags every average and running total down silently. Measured on one wave, one turn, one
  context: one card rendered the not-yet-eaten dinner as `Cena · pendiente   —` and another
  rendered the same row as `kcal 0 / Prot 0 / Carb 0`. Same question, so this is a coin flip
  rather than a blind spot — which is what makes it worth one line. The em dash takes
  `text-muted`, and if a total is shown beside incomplete rows, say what it is a total OF.

- **Write both the border and the background, and let the theme decide which one shows.** Measured on this app's own tokens, not assumed: light paints `bg-page`, `bg-layer-1` and `bg-layer-2` all `#fff`, so a block with only a background is **invisible** there and the border is the sole thing separating it; dark gives the layers real values (`#151517` / `#232324` / `#2c2c2e`) and carries it on the background alone. Rendered side by side, background-only vanishes on light and border-only is indistinguishable from both-together on dark — so both is the one spelling that works on both grounds, and it is **not** the "border and background are redundant" anti-pattern you know from elsewhere. That anti-pattern assumes a background you can see. Floating surfaces (modals, dropdowns) keep both regardless — they have to occlude.

  **And a field you type into is not a surface — it is a hole in one.** `bg-page` is the colour
  of the ground everything else sits on, so an `<input>` painted with it is the same white as the
  card in light theme and reads as a faint outline. Measured on a card generated after the rule
  above landed: nine inputs, all `bg-page border-line`, on a card that used `bg-layer-2`
  correctly exactly once elsewhere — the model knows the token and still reaches for the ground
  colour. An input takes `bg-layer-2` (a step further from the ground than its container, not
  back towards it) with `border-line-2`, and the placeholder takes `text-muted`.

  **A thing you can tap needs more than the divider colour.** The rule above is about separating a
  block from the surface below it, and `border-line` — 4% black — is right for that. It is not
  enough for a control sitting on a surface that already has the same background: measured on a
  real card, four tappable option boxes drawn with `border-line` on a `bg-layer` parent read
  clearly on dark and were nearly invisible on light, where every layer is `#fff` and 4% black is
  the only thing left. A tappable thing takes `bg-layer-2` or `border-line-2`, and the hairline
  stays for dividers.

  **A control you have FILLED is the opposite case, and the two get confused.** The rule above is
  about separating a surface from the surface under it, where both tokens are deliberately faint —
  `border-line` is 4% black. Once an element carries a real fill (a selected segment on
  `var(--dsw-alias-button-primary-fill)`, a primary button), that fill separates it completely and a leftover
  `border-line-2` is a grey ring around a blue block, related to nothing. Drop it — but to
  `transparent`, not to `none`, or the selected item loses a pixel of height and the row twitches
  as the reader clicks along it:

      border: selected ? "1px solid transparent" : "1px solid var(--dsw-alias-border-l2)"

  **And once a row is filled, everything inside it has to move off that fill too.** Measured on a
  real card: a step row filled with `var(--dsw-alias-button-primary-fill)` when ticked, and the checkbox inside
  it took the same background for its own checked state — the same token, so the
  box vanished into the row and left a white tick floating on blue with nothing around it. The
  same happens to a chip, a count, an icon tile: any child that had a background of its own is now
  sitting on a background that matches it. On a filled row the children want the fill's opposing
  foreground (`var(--dsw-alias-label-primary-foreground)`) as their colour and no background at all,
  or a theme-safe outline if the shape itself has to stay readable.

- **Keep nesting shallow.** A bordered box inside a bordered box is almost always wrong; a divider line does the job.
- **You are a component on someone else's page.** Your root is a normal node inside the chat column or the panel — nothing isolates you until you do it yourself. No `position: fixed`, no viewport UNITS (`vh`/`vw`, at any number — the window is not your box, so `78vh` is wrong for the same reason `100vh` is), no portals into `document.body`, no global listeners you don't remove. Overlays go in a `relative` wrapper you own with `absolute inset-0`. Effect libraries default to the wrong thing here and have to be pointed at your own element — `canvas-confetti` attaches a fullscreen canvas to `document.body` unless you pass one, so `confetti.create(ref.current, { resize: true, useWorker: true })` with that `<canvas>` absolutely positioned inside your container. Same for anything that says "mounts to body" or "fullscreen".
- **A title or a control sitting above a long list is a `sticky` header. Not "could be" — is.**
  The test is mechanical, so apply it mechanically: _is there anything above the list that the
  reader will still want once they are deep inside it?_ A heading that says what they are looking
  at, a search box, a row of filter chips, a count that changes as they filter. If yes, that strip
  pins. Otherwise the reader scrolls into the list, decides to narrow it, and has to scroll back up
  past everything they were reading to reach the box that narrows it.
  **Measured across 766 generated cards: 356 have a heading or a control above a list, and 353 of
  them let it scroll away.** Not a tendency, an absence: the shape is in every case (60 on one, 54
  on the next, 31, 26, 23…) and every model (95 for the worst, then 56, 44, 35, 33…), and no model
  pins it more than the rest. One of the 353, read in full: 266 lines — `<h2>最近工作轨迹</h2>`, a
  search input reading `搜项目、作者或提交内容`, a row of per-repo filter chips, then
  `filtered.slice(0, limit).map(…)` and a "load more" button. **Zero occurrences of `sticky`**,
  in that card and in the second one the same turn produced. Everything needed to steer the list
  scrolled away the moment the list was worth steering.

- **Your root sets no height and no `overflow`; the page is what scrolls.** You are inside a
  column the reader is already scrolling, so a root that sizes itself and grows its own scrollbar
  puts a second scroll inside the first. Pin with `sticky`, which pins against the READER's
  scroll, and give an inner pane its own bound only when a list genuinely needs one:

  ```tsx
  <div className="isolate relative">
    {" "}
    {/* your own stacking context */}
    <div className="sticky top-0 z-10 bg-layer border-b border-line">…</div>
    <div className="max-h-[30rem] overflow-y-auto">…</div> {/* the list, not the card */}
  </div>
  ```

  **`overflow` on ANY ancestor of a `sticky` element switches it off, silently** — no error, no
  warning, it simply scrolls away. Watched happen across one card's revisions: a root grew
  `overflow: hidden` to contain a stacking problem, the pinned header stopped pinning, and the
  two edits were two turns apart. Nothing between a `sticky` element and the page may set it.

  **`isolate` is what keeps your `z-index` small.** Inside a stacking context you own, `z-10`
  is above everything of yours and below everything of the app's. Without one, a number picked to
  beat your own siblings also beats the composer the reader types into.

- **The width is not the viewport's.** The same component lands in a narrow chat column _and_ in a wide panel, so a media query tells you nothing useful — measure your own container with `@container` and `@[32rem]:` variants, which is the ONE responsive tool that works here. "One comfortable column beats two cramped ones" settles what to do at 320px; it is not a licence to ship the same single column at 720. **Judged by a vision panel on 59 cards at three widths, "still one column at 720px, half the card is empty" was the single most common criticism — 91% of verdicts — and "no breakpoint of any kind in the source" was 76%.** A list of items with a name and a description is `@[30rem]:grid-cols-2`; a strip of stats is `@[24rem]:grid-flow-col`. The reader who widens the panel is asking for less scrolling, and getting a wider version of the same tall column is not an answer.

- **Extra width should make the rows SHORTER, not the card wider — inline as much as in a canvas.**
  This entry read "In a canvas" for a while and that scope was wrong: a vision panel grading
  **inline** cards raised it in 27% of verdicts, on cards that _did_ carry breakpoints. Measured across
  one wave, height at 320 divided by height at 720: the five inline cards shrink 1.26–1.52x, and
  the six canvases shrink **1.02–1.18x** — one is 1100px tall at 320 and still 1076px at 720. It
  is not for want of the technique; 8 of those 9 canvases carry a container query or an intrinsic
  grid. They spend it _inside_ a row — a stat strip, a chip group — and never on the row itself.
  The shape that costs the most is a three-band row: a name, a right-aligned number, then a
  control on its own full-width line, so at 720 the name and its number sit 1100px apart with a
  rail between them. At that width the three fit on ONE line:

      <div className="grid gap-2 @[32rem]:grid-cols-[1fr_12rem_auto] @[32rem]:items-center">
        <span className="min-w-0 truncate">{name}</span>
        <input type="range" … />
        <span className="tabular-nums text-right">{value}</span>
      </div>

  The reader drags a canvas panel between 320 and 720 — that drag should buy them less scrolling.

- **Nothing you draw may carry a width the column did not give it.** Measured by mounting 60 real
  cards at 380px: **12 overflowed the column**, across 4 of the 26 runs sampled, and the part that
  hangs off the edge is invisible in a screenshot — the picture is clipped at the card, so an
  absent column reads as a design choice and nobody can name the defect. Every one of the 12 was
  the same mistake in a different costume:

  | what stuck out                    | how far   | write instead                                                                                                             |
  | --------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------- |
  | `<svg width="600" …>`             | 308–348px | `viewBox="0 0 600 400"` and `className="w-full h-auto"` — the viewBox carries the coordinates, the class carries the size |
  | a `<pre>`/`<code>` of real source | 409–705px | the code keeps its long lines; the WRAPPER gets `overflow-x-auto`, so the card stays put and the code scrolls inside it   |

  **A hand-rolled `<pre>` is two defects at once, and it is the single commonest thing in this
  corpus.** Of 766 cards, **194 show code and 182 of them hand-roll a `<pre>` — 94%**; only 4 reach
  for `shiki`. And they are where the overflow lives: of 107 measured overflows, **35 — a third of
  everything — are a `<code>` element**, at a median of 195px past the edge against 84px for every
  other tag combined. (Not one is a `<pre>`: the wrapper is fine, the `<code>` inside it is what
  hangs off. The single widest overflow in the corpus is a `<section>` at 978px, so these are the
  typical worst rather than the record holder.) So the fix is one import,
  not two patches: `shiki` highlights it (see the library table) AND you still put the
  `overflow-x-auto` on the wrapper. Unhighlighted source in a card the reader cannot scroll
  sideways is code they can neither read nor reach the end of.
  | `<table className="min-w-[28rem]">` | 84px | put the `overflow-x-auto` on the wrapper and drop the min-width, or let the columns wrap |

  `min-w-0` is the answer to a flex child that will not shrink; this is its opposite — an
  explicit intrinsic width you typed yourself, and no ancestor can undo it. **The widest offender
  was 705px hanging off a 380px column**, which is not a card that looks slightly wrong, it is a
  card most of which does not exist for the reader.

- **Layout breaks late, controls break early.** A row of buttons can reflow at a small width; a grid of content cards cannot, because each column has to stay wide enough to read.
- **Whatever `hover:` changes, the selected state has to claim in its hover form too.** A
  `hover:bg-hover` and an `aria-pressed:bg-[var(--dsw-alias-button-primary-fill)]` on the same button generate at the SAME
  specificity — `:is()` takes its argument's, so `.class:hover` and `.class[aria-pressed]` are
  both `(0,2,0)` — and source order in the generated sheet puts `hover` last. So the selected
  button turns back to neutral grey **while the pointer is on it**, which is exactly when the
  reader is looking at it. **Measured across 766 generated cards: 308 real collisions in 193 cards
  across 60 runs** — a quarter of everything written, 256 on `bg` and 52 on `text`.

  Add the pressed-and-hovered pair. It is `(0,3,0)`, so it wins on specificity and does not care
  where it lands in the sheet:

      hover:bg-hover aria-pressed:bg-[var(--dsw-alias-button-primary-fill)] aria-pressed:hover:bg-[var(--dsw-alias-button-primary-fill)]

  **Whichever attribute you marked the selection with, qualify that one** — the trick is the extra
  variant, not the word `aria-pressed`. Of those 308 collisions, only 163 are on `aria-pressed`;
  the rest are `data-[state=active]` (74), `checked` (43) and `aria-selected` (28), and each has
  the same fix, verified against this generator:

      data-[state=active]:hover:bg-[var(--dsw-alias-button-primary-fill)]    checked:hover:bg-[var(--dsw-alias-button-primary-fill)]    aria-selected:hover:bg-[var(--dsw-alias-button-primary-fill)]

  **Do not reach for `not-`.** `not-aria-pressed:hover:bg-hover` and
  `hover:not-aria-pressed:bg-hover` are the intuitive fix and this generator matches **neither** —
  they produce no rule at all, so the button keeps the bug and the class list now says it was
  handled. A ternary works too (`picked ? "bg-[var(--dsw-alias-button-primary-fill)] text-[var(--dsw-alias-label-primary-foreground)]" : "hover:bg-hover"`) because only one branch
  is ever present; reach for that when the two states differ in more than a couple of properties.

- **Icons must name the thing beside them.** `Sparkles`, `WandSparkles`, `Wand2`, `Stars`, `Bot`, `BrainCircuit`, `Zap` as decoration say "an AI made this" and nothing else — `Copy` on a copy button, `Languages` on a translate tab, and nothing on a heading that reads fine without one. Prefer no icon to a decorative one.
