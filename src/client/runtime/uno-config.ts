import { presetWind4 } from "@unocss/preset-wind4";
import type { UserConfig } from "@unocss/core";

/**
 * Two things the host forces on this config, both non-negotiable:
 *
 * `important` receives a SELECTOR STRING, which is how UnoCSS scopes: every rule comes out
 * `.ui4a-root :is(.gap-4){…}`. The runtime sheet is appended to `<head>` last, so an unscoped
 * `hidden` written by a card would win over the shell's own `hidden` and make part of the app
 * vanish. The playground has that bug on record (a sidebar disappearing); we start scoped.
 *
 * `preflights: { reset: false }` drops presetWind4's global reset — 3.5KB of `*, ::before,
 * ::after { margin: 0; border: 0 solid }` that would land on the HOST's DOM, not just ours.
 * The `theme` layer survives it and is the part we need: `--spacing` and `--radius-*`, which
 * every `gap-*` and `rounded-*` resolves against. Without preflights entirely those rules
 * generate but compute to nothing.
 */
export const unoConfig = (scope: string): UserConfig => ({
  presets: [presetWind4({ important: scope, preflights: { reset: false } })],
  // The reset above is dropped because it targets `*` and would land on the HOST's DOM. But
  // dropping it leaves form controls carrying the browser's own chrome, and that is not
  // theme-aware: measured on a card in dark mode, two unselected `<button>`s rendered as light
  // grey blocks with black text, because a button with no background class falls back to the UA's
  // `buttonface`. The card looked right in light and broken in dark, which is the failure this
  // whole colour system exists to prevent.
  //
  // So: the same normalisation, scoped to our root.
  //
  // `box-sizing: border-box` is in here for the same reason, and I left it out at first on the
  // theory that cards set their own sizing. They cannot: `w-full` is `width: 100%`, and under the
  // UA's `content-box` that 100% is the content alone, so every `<input className="w-full px-3
  // border">` is padding-plus-border wider than its parent. Measured on wave 2 — every card with a
  // text field overflowed its own edge by 10px at 320, 440 AND 720, which is the tell that it was
  // never a breakpoint problem. The clip in a screenshot is taken at the card width, so the
  // overflowing strip is not cut off, it is absent.
  preflights: [
    {
      // Same class of bug as box-sizing: a card writes `<ul className="grid gap-1.5">`, which is
      // correct — a grid list has no use for UA markers — and dropping the reset put them back, so
      // a column of stray bullets sits OUTSIDE the card border at every width. Not something to
      // ask the model to write `list-none` for on every list.
      //
      // Headings and paragraphs are the same omission, found later and from the other end: a
      // reader asking why there is ALWAYS a band of empty space above a card's title. Measured on
      // the surface, the UA margins still standing were h1 21.4px, h2 19.9, h3 18.7, h4 21.3,
      // p/blockquote/figure 16, pre 13 — while `ul` read 0, which is what proves the line above
      // works and these tags were simply not in it. A card's first child is almost always a
      // heading, so it pushes itself down by more than the card's own `p-3`, and `<p>` margins
      // then fight whatever `gap-*` the layout uses. `important: scope` makes every utility
      // `.ui4a-root :is(.mt-4)` at (0,2,0), which outranks these (0,1,1) rules — so a card that
      // asks for a margin still gets one, and only the browser's uninvited ones go.
      //
      // `border: 0 solid` is the last half of that reset, and leaving it out made every bordered box
      // invisible. Wind4's `border` utility emits `border-width: 1px` and expects the vendor reset to
      // have set the style; nothing else in the document does. Measured live in dsh web (2026-10-11):
      // a plain `div` with `border-width: 1px` computes `border-style: none`, and none of the 143
      // stylesheets on the page carries a universal border rule — the host's own CSS is CSS Modules
      // and spells `border: .5px solid var(--dsw-alias-border-l*)` on every rule. So
      // `bg-layer border border-line`, the spelling the skill tells every card to write, computed
      // `border-width: 0px` / `border-style: none`. In light theme, where all three layer tokens are
      // `#fff`, that is a box with neither fill nor edge — a card that reads as stray padding, which
      // is how it was reported. `divide-*` and `ring-*` were unaffected because they set the style
      // themselves, and the form controls below kept a `border: 0 solid` of their own, so buttons and
      // inputs had borders while every container `<div>` did not — which is why a corpus of cards
      // that looks right in dark hid it for so long.
      //
      // It has to be the shorthand. `border-style: solid` alone would leave the UA's initial
      // `border-width: medium` in place, i.e. a 3px border on every element inside the scope. And it
      // sits in `:where()` at (0,0,0): at (0,1,0) it would beat a card's own `td { border-bottom: … }`
      // whatever the order, and the table's rules would vanish.
      getCSS: () => `${scope} *, ${scope} *::before, ${scope} *::after { box-sizing: border-box; }
      :where(${scope} *, ${scope} *::before, ${scope} *::after) { border: 0 solid; }
      ${scope} ul, ${scope} ol { list-style: none; margin: 0; padding: 0; }
      ${scope} h1, ${scope} h2, ${scope} h3, ${scope} h4, ${scope} h5, ${scope} h6,
      ${scope} p, ${scope} blockquote, ${scope} figure, ${scope} figcaption,
      ${scope} dl, ${scope} dd, ${scope} pre, ${scope} hr { margin: 0; }
      ${scope} button, ${scope} input, ${scope} select, ${scope} textarea {
        background: transparent; color: inherit; font: inherit; border: 0 solid; cursor: pointer;
      }
      ${scope} input, ${scope} select, ${scope} textarea { cursor: auto; }`,
    },
  ],
  theme: {
    colors: {
      // The host's 12 semantic tokens, under names short enough to write in a class.
      // A card can still reach any variable through an arbitrary value: `bg-[var(--dsw-…)]`.
      // NOT `base`: `text-base` is Wind4's body font size, and a colour of that name wins the
      // token, so `<h2 className="text-base">` computed `color: #ffffff` on a white card — present,
      // laid out, invisible, and no probe can see it. 18 corpus cards wrote `text-base`.
      page: "var(--dsw-alias-bg-base)",
      layer: "var(--dsw-alias-bg-layer-1)",
      "layer-2": "var(--dsw-alias-bg-layer-2)",
      line: "var(--dsw-alias-border-l1)",
      "line-2": "var(--dsw-alias-border-l2)",
      label: "var(--dsw-alias-label-primary)",
      muted: "var(--dsw-alias-label-secondary)",
      accent: "var(--dsw-alias-state-business-primary)",
      hover: "var(--dsw-alias-interactive-bg-hover)",
      danger: "var(--dsw-alias-state-error-primary)",
      success: "var(--dsw-alias-state-success-primary)",
      warn: "var(--dsw-alias-state-warn-primary)",
    },
  },
});
