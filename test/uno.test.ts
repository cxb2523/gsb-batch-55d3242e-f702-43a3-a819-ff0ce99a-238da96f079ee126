import { expect, test } from "bun:test";
import { createGenerator } from "@unocss/core";
import { presetWind4 } from "@unocss/preset-wind4";
import { unoConfig } from "../src/client/runtime/uno-config.ts";
import { skillBody } from "../src/skill.ts";

const generate = async (tokens: string[], scope = ".ui4a-root") => {
  const uno = await createGenerator(unoConfig(scope));
  const extracted = await uno.applyExtractors(tokens.join(" "));
  const { css, matched } = await uno.generate(extracted, { preflights: true });
  return { css, matched };
};

// Every rule must be prefixed. The runtime sheet is appended to `<head>` after the shell's own,
// so an unscoped `hidden` from a card would win over the shell's and make part of the app vanish
// — the exact bug the playground has on record.
test("every generated rule is scoped to the genui root", async () => {
  const { css } = await generate(["grid", "gap-4", "hidden", "flex", "text-left"]);
  const rules = [...css.matchAll(/^\s*(\.[^{@\s][^{]*)\{/gm)].map((m) => m[1].trim());
  expect(rules.length).toBeGreaterThan(3);
  expect(rules.filter((r) => !r.startsWith(".ui4a-root "))).toEqual([]);
});

// presetWind4's reset is 3.5KB of `*, ::before, ::after { margin: 0; border: 0 solid }`, and it
// would land on the HOST's DOM. `preflights: { reset: false }` drops it while keeping the theme
// layer, which is where `--spacing` lives and every `gap-*` resolves against.
test("the preflight carries theme variables but no global reset", async () => {
  const { css } = await generate(["gap-4", "rounded-sm"]);
  expect(css).toContain("--spacing:");
  expect(css).not.toMatch(/\*,\s*::after[^{]*\{[^}]*margin/);
});

// The two failures measured on real cards, both of which this syntax makes unspellable: a state
// selector living in `<style>` while the attribute is written in JSX, and a pseudo-element
// override addressed through a class that landed on the wrong element.
test("state variants and pseudo-elements resolve in one token", async () => {
  const { css, matched } = await generate(["aria-checked:bg-accent", "[&::-webkit-slider-thumb]:bg-label"]);
  expect(matched.size).toBe(2);
  expect(css).toContain('[aria-checked="true"]');
  expect(css).toContain("::-webkit-slider-thumb");
});

// A card sizes itself against the panel, never the viewport, so the breakpoint spelling that has
// to work is the container one.
test("container queries generate as @container, not @media", async () => {
  const { css } = await generate(["@[30rem]:grid-cols-3"]);
  expect(css).toContain("@container (min-width: 30rem)");
  expect(css).not.toContain("@media (min-width: 30rem)");
});

// The colour names are the only thing a card can say, so a typo in the config is a card that
// silently paints nothing. Note what is deliberately ABSENT: `brand-primary` has no short name,
// because it is a foreground colour that 50 of 378 real cards used as a fill.
test("every colour name maps to a host token, and brand is not among them", async () => {
  const names = ["page", "layer", "layer-2", "line", "line-2", "label", "muted", "accent", "hover", "danger", "success", "warn"];
  const { css, matched } = await generate(names.map((n) => `bg-${n}`));
  expect(matched.size).toBe(names.length);
  // Not just that the class generated — that the variable it points at is one the host defines.
  // A typo generates perfectly valid CSS referencing a variable that does not exist, and the card
  // paints with no colour at all rather than failing.
  const HOST_TOKENS = new Set(["bg-base", "bg-layer-1", "bg-layer-2", "border-l1", "border-l2", "label-primary", "label-secondary", "state-business-primary", "interactive-bg-hover", "state-error-primary", "state-success-primary", "state-warn-primary"]);
  const referenced = [...css.matchAll(/var\(--dsw-alias-([\w-]+)\)/g)].map((m) => m[1]);
  expect(referenced.length).toBe(names.length);
  expect(referenced.filter((t) => !HOST_TOKENS.has(t))).toEqual([]);
  expect(css).not.toContain("brand-primary");
});

// Dropping presetWind4's reset leaves form controls with the UA's own chrome, whose colours are
// fixed rather than theme-aware: measured in a real browser, two unselected `<button>`s came out
// light grey with black text on a dark card. The replacement must normalise them and must stay
// inside the scope, because the host has buttons of its own.
test("form controls are normalised, and only inside the scope", async () => {
  const { css } = await generate(["grid"]);
  expect(css).toContain(".ui4a-root button");
  const control = css.slice(css.indexOf(".ui4a-root button"));
  expect(control).toContain("background: transparent");
  expect(control).toContain("font: inherit");
  // Nothing may address a bare element globally — `button {` with no scope in front of it would
  // restyle every button in the shell.
  expect(css).not.toMatch(/(^|[};]\s*)(button|input|select|textarea)\s*[,{]/m);
});

// `w-full` is `width: 100%`, which under the UA default counts padding and border as EXTRA. Every
// card in wave 2 with a text field sat 10px past its own right edge at 320, 440 and 720 alike —
// same at every width, which is what says it is not a breakpoint bug.
test("box-sizing is border-box inside the scope, and not outside it", async () => {
  const { css } = await generate(["w-full"]);
  expect(css).toMatch(/\.ui4a-root[^{]*\*[^{]*\{[^}]*box-sizing:\s*border-box/);
  expect(css).not.toMatch(/(^|[};])\s*\*[^{]*\{[^}]*box-sizing/m);
});

// Wind4's `border` emits `border-width` and nothing else, expecting the vendor reset to have set
// `border-style: solid`. With `preflights: { reset: false }` nothing did, so `bg-layer border
// border-line` — the spelling the skill tells every card to write — computed `border-width: 0px` /
// `border-style: none` in a real dsh web (measured 2026-10-11, via `getComputedStyle` on a mounted
// card). In light theme, where all three layer tokens are `#fff`, that is a box with neither fill
// nor edge. `divide-*` and `ring-*` set the style themselves and the form-control rule below
// carried its own `border: 0 solid`, so both hid it.
test("the border reset is restored inside the scope, and not outside it", async () => {
  const { css } = await generate(["border", "border-line"]);
  // The utility half was always there, and on its own paints nothing.
  expect(css).toContain("border-width:1px");
  expect(css).toMatch(/\.ui4a-root[^{]*\*[^{]*\{[^}]*border:\s*0\s*solid/);
  // At zero specificity, so a card's own element rule (`td { border-bottom: … }`) still wins.
  expect(css).toMatch(/:where\(\.ui4a-root \*[^{]*\{\s*border:\s*0 solid/);
  expect(css).not.toMatch(/(^|[};])\s*\*[^{]*\{[^}]*border:\s*0\s*solid/m);
});

// A colour name that collides with a Wind4 utility WINS, silently. `base` did: `text-base` is the
// body font size and the commonest way to write body text, and with a colour called `base` it
// resolved to `color: var(--dsw-alias-bg-base)` — #ffffff in light theme. Measured live on a wave-2
// card: `<h2 className="text-base font-semibold">` computed color #ffffff, font-size 24px, opacity
// 1, on a white card. Present, laid out, invisible, and invisible to every probe too. 18 corpus
// cards wrote `text-base`. Any future colour name has to clear the same bar.
test("no colour name shadows a Wind4 utility", async () => {
  const plain = await createGenerator({ presets: [presetWind4({ preflights: { reset: false } })] });
  const NAMES = ["page", "layer", "layer-2", "line", "line-2", "label", "muted", "accent", "hover", "danger", "success", "warn"];
  const collisions: string[] = [];
  for (const n of NAMES)
    for (const p of ["text", "bg", "border", "w", "h", "p", "m", "gap", "rounded", "shadow", "font", "leading", "tracking"]) {
      const t = `${p}-${n}`;
      const { css } = await plain.generate(await plain.applyExtractors(t), { preflights: false });
      if (css.trim()) collisions.push(t);
    }
  expect(collisions).toEqual([]);
  // and the renamed one still reaches the same host variable
  const { css } = await generate(["bg-page"]);
  expect(css).toContain("--dsw-alias-bg-base");
});

// UnoCSS merges selectors that share a declaration, and Chromium drops any rule whose selector
// list contains a pseudo-element it does not know — so one `::-moz-range-thumb` takes the
// `::-webkit-slider-thumb` half down with it. Measured on a real card: 75 of 87 rules survived
// parsing and the slider computed to `height: 0px`. Order is irrelevant; either vendor first
// poisons the list.
test("a merged vendor rule is split so Chromium keeps the half it understands", async () => {
  const { css } = await generate(["[&::-moz-range-thumb]:h-3.5", "[&::-webkit-slider-thumb]:h-3.5"]);
  const merged = /::-moz-range-thumb[^{]*,[^{]*::-webkit-slider-thumb\s*\{/.test(css);
  expect(merged).toBe(true); // this is what UnoCSS produces, and what the runtime must fix
  const { splitVendorRules } = await import("../src/client/runtime/uno.ts");
  const fixed = splitVendorRules(css);
  expect(/::-moz-[^{]*,[^{]*::-webkit-/.test(fixed)).toBe(false);
  // Both halves survive, each in its own rule.
  expect(fixed).toContain("::-webkit-slider-thumb{");
  expect(fixed).toContain("::-moz-range-thumb{");
});

// Preflights were reachable only through the SETTLED path, so a card was styled without
// `box-sizing: border-box` and without the button/list reset for the whole of its stream.
// Measured in a real browser on a first card in a fresh page: 31 seconds of streaming with no
// preflight in the sheet and a painting card whose `<input>` computed `content-box` — a
// `w-full px-3 border` input is then padding-plus-border wider than its parent, so the layout
// is visibly wrong while the reader watches and jumps into place when the stream ends. The
// block is fixed content that depends on nothing the model types, so the first streaming frame
// is early enough and there is never a reason to wait.
test("the first streaming frame emits the preflight block", async () => {
  // A stub rather than a DOM library: the module touches exactly `createElement`, two
  // `setAttribute`s, `head.appendChild` and `textContent`, and the repo has no jsdom.
  const style = {
    attrs: {} as Record<string, string>,
    textContent: "",
    setAttribute(k: string, v: string) {
      this.attrs[k] = v;
    },
    remove() {},
  };
  const previous = (globalThis as { document?: unknown }).document;
  (globalThis as { document?: unknown }).document = { createElement: () => style, head: { appendChild: (n: unknown) => n } };
  try {
    const uno = await import("../src/client/runtime/uno.ts");
    uno.disposeUnoStyles();
    await uno.ensureUnoStyles(`<div className="grid gap-2"><input className="w-full px-3 border" /></div>`, true);
    expect(style.textContent).toContain("box-sizing");
    // …and exactly once: every later frame appends, so a repeated block would grow without bound.
    const before = style.textContent.split("box-sizing").length;
    await uno.ensureUnoStyles(`<div className="grid gap-2 text-sm"><input className="w-full px-3 border" /></div>`, true);
    expect(style.textContent.split("box-sizing").length).toBe(before);
    uno.disposeUnoStyles();
  } finally {
    (globalThis as { document?: unknown }).document = previous;
  }
});

// Every utility the two prompt recipes hand the model, generated through the real config. A
// colour name that is not in the map, or a variant presetWind4 does not know, produces NOTHING
// and the card renders unstyled — the failure §2.5 records, which no screen and no compile
// catches. A recipe shown as code has to be spellable before it is worth showing.
test("the tokens the prompt's own recipes write all generate", async () => {
  const tokens = ["divide-y", "divide-line", "first:pt-0", "last:pb-0", "flex-wrap", "hover:bg-hover", "aria-pressed:bg-accent", "aria-pressed:text-white", "aria-pressed:border-transparent", "isolate", "relative", "sticky", "top-0", "z-10", "max-h-[30rem]", "overflow-y-auto", "border-b", "bg-layer"];
  const { css, matched } = await generate(tokens);
  expect([...matched].toSorted()).toEqual(tokens.toSorted());
  expect(css).toContain('[aria-pressed="true"]');
  expect(css).toContain("--dsw-alias-border-l1");
  expect(css).toContain("--dsw-alias-interactive-bg-hover");
  // `isolate` is the one that keeps a card's z-index from reaching the app's own chrome, so a
  // silent miss here is the defect the rule exists to prevent.
  expect(css).toContain("isolation:isolate");
  expect(css).toContain("position:sticky");
});

/**
 * A `hover:` and a selected-state variant on one element collide, and the fix has to be the one
 * this generator actually emits.
 *
 * `:is()` takes its argument's specificity, so `.cls:hover` and `.cls[aria-pressed="true"]` are
 * both (0,2,0) — equal, and `hover` is written last in the sheet, so hovering a selected button
 * repaints it neutral. `aria-pressed:hover:` is (0,3,0) and wins on specificity instead of order.
 *
 * The `not-` half of this test is the important half: it is the intuitive fix, this preset matches
 * neither spelling, and an unmatched token generates NOTHING — the button keeps the bug while the
 * class list claims it was handled. Locked here so a preset upgrade that starts (or keeps not)
 * supporting it is a failing test rather than a silent no-op in every generated card.
 */
test("the selected-and-hovered pair generates; `not-` generates nothing", async () => {
  const { css, matched } = await generate(["hover:bg-hover", "aria-pressed:bg-accent", "aria-pressed:hover:bg-accent"]);
  expect([...matched]).toContain("aria-pressed:hover:bg-accent");
  expect(css).toContain('.aria-pressed\\:hover\\:bg-accent:hover[aria-pressed="true"]');

  for (const token of ["not-aria-pressed:hover:bg-hover", "hover:not-aria-pressed:bg-hover"]) {
    const { matched: none } = await generate([token]);
    expect([...none]).toEqual([]);
  }

  // `aria-pressed` is only 163 of the 308 measured collisions; the skill now names the other three
  // spellings too, so all three have to generate or the rule covers half the corpus and looks like
  // it covers all of it. `aria-current:hover:` is the one this preset does NOT match — it appears
  // zero times in the corpus, and it is asserted here so the skill never starts recommending it.
  for (const token of ["data-[state=active]:hover:bg-accent", "checked:hover:bg-accent", "aria-selected:hover:bg-accent"]) {
    const { matched: some } = await generate([token]);
    expect([...some]).toContain(token);
  }
  expect([...(await generate(["aria-current:hover:bg-accent"])).matched]).toEqual([]);
});

/**
 * Every class in a COPYABLE code example has to generate something.
 *
 * A model copies these literally, and an unmatched utility is silent: no error, no warning, the
 * declaration simply never exists. Measured live on `not-aria-pressed:hover:bg-hover` — the
 * intuitive fix for the hover/selected collision, matched by nothing, and a card carrying it looks
 * handled while keeping the bug.
 *
 * Scoped to `className="…"` inside the two prompt files rather than every backticked token in the
 * prose: prose names CSS VARIABLES too (`--dsw-alias-bg-base` is behind the `bg-page` class, and
 * the two vocabularies are deliberately different), and a sweep over both spellings reports the
 * variable names as broken classes. It also has to skip the ellipsis these examples use for
 * elided content.
 */
test("every class in a code example generates a rule", async () => {
  const src = [await Bun.file(new URL("../src/prompt.ts", import.meta.url)).text(), skillBody("types.json", "standalone.json", true)];
  const tokens = new Set<string>();
  // Not the ones quoted INSIDE backticks: those are prose naming a class, and the prose here
  // names broken ones on purpose — `className="r"` is quoted from a real card that wrote
  // `.r { display: grid }` and put it on an `<input type=range>`. A copyable example is written
  // as `<button className="…">`, so the character before the match discriminates them — a
  // BACKTICK, because the escape in the source is `\\` followed by the backtick itself.
  for (const m of src.join("\n").matchAll(/(.)className="([^"$`]+)"/g)) {
    if (m[1] === "`") continue;
    for (const t of m[2].split(/\s+/)) if (t && t !== "…") tokens.add(t);
  }
  expect(tokens.size).toBeGreaterThan(50);
  const unmatched: string[] = [];
  for (const token of tokens) {
    const { matched } = await generate([token]);
    if (matched.size === 0) unmatched.push(token);
  }
  expect(unmatched.toSorted()).toEqual([]);
});

/**
 * A utility that references a variable the sheet never defined is not "unstyled until later" — it
 * computes to NOTHING and the layout is wrong while the reader watches.
 *
 * Two halves, and they pull in opposite directions:
 *
 * 1. The variables have to reach the sheet DURING the stream. Wind4's `theme` layer is on demand,
 *    and it is a PREFLIGHT — so the empty-token first frame carries none of it, and a later frame
 *    generating with `preflights: false` emits `padding: calc(var(--spacing) * 3)` against a sheet
 *    where `--spacing` does not exist. Every `p-3`/`gap-2`/`rounded-2xl` computes to nothing until
 *    the settled pass rewrites the sheet.
 * 2. But the layer must not be appended per frame. `trackedTheme` is a module-level set inside
 *    presetWind4, cleared only on `configResolved`, so `getLayer("theme")` returns the union of
 *    every variable this generator has EVER seen — not a per-call delta. Measured on
 *    `test/cards/utility-classes` streamed in 40-byte chunks: 96 `:root, :host` blocks and 16KB of
 *    a 42KB sheet, while only 8 of the 103 generating frames had actually changed the layer.
 *    That is the same "repeated block grows without bound" shape the box-sizing assertion above
 *    exists to stop.
 */
test("streaming frames define the theme variables, and do not re-append the theme layer", async () => {
  const style = {
    attrs: {} as Record<string, string>,
    textContent: "",
    setAttribute(k: string, v: string) {
      this.attrs[k] = v;
    },
    remove() {},
  };
  const previous = (globalThis as { document?: unknown }).document;
  (globalThis as { document?: unknown }).document = { createElement: () => style, head: { appendChild: (n: unknown) => n } };
  const roots = () => (style.textContent.match(/:root,\s*:host\s*\{/g) ?? []).length;
  try {
    const uno = await import("../src/client/runtime/uno.ts");
    uno.disposeUnoStyles();

    // Half 1: the definition must land in the SAME frame as the utility that needs it. Assert on
    // the DEFINITION and not on `var(--spacing)` — the broken path emitted the reference happily,
    // which is exactly what made it look styled.
    await uno.ensureUnoStyles(`<div className="p-3 gap-2 rounded-2xl" />`, true);
    expect(style.textContent).toMatch(/--spacing\s*:/);
    expect(style.textContent).toMatch(/--radius-2xl\s*:/);

    // Half 2: many more frames, each introducing tokens. If the theme layer is appended per frame
    // this grows with the frame count; it may only grow when the layer itself changed.
    const before = roots();
    expect(before).toBe(1);
    for (let i = 0; i < 20; i++) await uno.ensureUnoStyles(`<div className="mt-${i + 1} p-${i + 1}" />`, true);
    expect(roots()).toBe(before);

    // The gate must not be "write once": a genuinely NEW variable still has to get out. `rounded-lg`
    // is the probe — `rounded-full` is not, it computes to `calc(infinity * 1px)` and tracks no
    // theme key at all (found by running this assertion).
    await uno.ensureUnoStyles(`<div className="rounded-lg" />`, true);
    expect(style.textContent).toMatch(/--radius-lg\s*:/);
    expect(roots()).toBe(before + 1);

    // …and the settled pass collapses back to exactly one, since it replaces rather than appends.
    await uno.ensureUnoStyles(`<div className="p-3 gap-2 rounded-2xl rounded-full" />`, false);
    expect(roots()).toBe(1);
    uno.disposeUnoStyles();
  } finally {
    (globalThis as { document?: unknown }).document = previous;
  }
});
