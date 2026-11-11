import { createGenerator, type UnoGenerator } from "@unocss/core";
import { unoConfig } from "./uno-config.ts";

/**
 * Runtime UnoCSS for generated cards.
 *
 * A build-time pass would scan OUR source, and the classes a card is written with do not exist
 * there — they are typed by the model seconds ago. Responsive is where that shows worst: not one
 * `@container` breakpoint would be generated, so every card would be single-column at any width.
 * The CSS therefore has to be produced in the browser, as the code streams in.
 *
 * Accumulate rather than replace: several cards share one document, and each one's classes must
 * stay in the sheet after another card is added.
 */
/**
 * The class every generated rule is prefixed with, and the one the surface carries.
 *
 * Named after the contract rather than after this plugin: the same class exists in
 * `ui4a-playground` under the same constant name, so the two runtimes can be diffed line for
 * line. It is also the only marker on the surface node — a second `data-*` hook naming the same
 * thing was removed because nothing read it.
 */
export const UI4A_ROOT_CLASS = "ui4a-root";
const PLUGIN_ID = "dsh-generative-ui";

let generator: Promise<UnoGenerator> | null = null;
const tokens = new Set<string>();
let sheet: HTMLStyleElement | null = null;
/** Whether the sheet already carries the preflight block. Reset with the sheet, not with the tokens. */
let preflighted = false;
/**
 * The theme layer as last written into the sheet. Reset with the sheet.
 *
 * `trackedTheme` is a module-level set inside presetWind4, cleared only on `configResolved` — so
 * the theme layer is the union of every variable the GENERATOR has ever been asked about, not a
 * per-call delta. Appending it per frame is therefore a repeat of a growing block.
 */
let themeWritten = "";

/**
 * Per frame this does the two cheap things only: EXTRACT the class names out of the code
 * (no CSS generated), and generate CSS for the ones not seen before.
 *
 * The expensive spellings, both measured in the playground this is ported from:
 * `uno.generate(code)` regenerates every class in the file each time — 119s of main thread over
 * one streaming canvas; and regenerating the whole accumulated token set on each new class costs
 * more the longer the file gets. Throttling does not help when a single call is what is
 * expensive.
 *
 * Appended rules sort after existing ones, so two same-priority utilities can resolve differently
 * than a single authoritative pass would. Once the stream settles we regenerate the whole set to
 * restore that order.
 */
export async function ensureUnoStyles(code: string, streaming = false): Promise<void> {
  if (typeof document === "undefined") return;
  const uno = await (generator ??= createGenerator(unoConfig(`.${UI4A_ROOT_CLASS}`)));
  const extracted = await uno.applyExtractors(code);
  const fresh = [...extracted].filter((token) => !tokens.has(token));
  if (fresh.length === 0 && streaming && preflighted) return;
  for (const token of fresh) tokens.add(token);
  sheet ??= createSheet();
  if (streaming) {
    // Preflights FIRST, on the very first streaming frame, and never again. They were reachable
    // only through the settled path, so for the whole of a stream the card rendered without
    // `box-sizing: border-box` and without the button/list reset — measured on a first card in a
    // fresh page: 31 seconds of streaming with `pre: false` and a painting card whose `<input>`
    // computed `content-box`. That is not "unstyled until it settles", it is *wrongly* styled
    // while the reader watches: a `w-full px-3 border` input is padding-plus-border wider than
    // its parent, so the layout is visibly broken and then jumps when the stream ends.
    //
    // They are a fixed block that depends on nothing the model types, so there is no reason for
    // them to wait for anything, and generating them once costs a single call.
    if (!preflighted) {
      preflighted = true;
      const { css } = await uno.generate([], { preflights: true });
      sheet.textContent += splitVendorRules(css);
    }
    if (fresh.length === 0) return;
    // The `theme` layer is on demand AND it lives in the preflights: with `preflights: false` the
    // utilities come out as `padding: calc(var(--spacing) * 3)` against a sheet that never defined
    // `--spacing`, so every `p-3`/`gap-2`/`rounded-2xl` computed to nothing until the stream
    // settled. Generate with them on so the variables land — but do NOT take `css`: that re-appends
    // the preflight block frame 1 already wrote. `theme` is excluded from the bulk append below for
    // the same reason it is appended separately: it is the one layer that is NOT per-call.
    const generated = await uno.generate(fresh, { preflights: true });
    sheet.textContent += splitVendorRules(generated.getLayers(undefined, ["preflights", "base", "theme"]));
    const theme = generated.getLayer("theme") ?? "";
    if (theme && theme !== themeWritten) {
      themeWritten = theme;
      sheet.textContent += splitVendorRules(theme);
    }
    return;
  }
  preflighted = true;
  const { css, getLayer } = await uno.generate(tokens, { preflights: true });
  sheet.textContent = splitVendorRules(css);
  themeWritten = getLayer("theme") ?? "";
}

/**
 * Split a rule whose selector list mixes vendor pseudo-elements into one rule per vendor.
 *
 * UnoCSS merges selectors that share a declaration, so a card styling a slider for both engines
 * gets `…::-moz-range-thumb, …::-webkit-slider-thumb { height: … }` as ONE rule — and Chromium
 * drops the whole rule because it does not recognise the `-moz-` half. Measured: the browser
 * parsed 75 of the 87 rules in a real card's sheet, the slider came out `height: 0px`, and the
 * card shipped three invisible controls. Order does not matter and neither does which vendor is
 * first; one unknown pseudo-element poisons the list.
 *
 * The model is doing the right thing by writing both prefixes, so the fix belongs here.
 */
export function splitVendorRules(css: string): string {
  return css.replaceAll(/(^|\})\s*([^{}]*::-moz-[^{}]*)\{([^}]*)\}/g, (whole, lead: string, selectors: string, body: string) => {
    const parts = selectors
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length < 2) return whole;
    const moz = parts.filter((s) => s.includes("::-moz-"));
    const rest = parts.filter((s) => !s.includes("::-moz-"));
    if (moz.length === 0 || rest.length === 0) return whole;
    return `${lead}\n${rest.join(",\n")}{${body}}\n${moz.join(",\n")}{${body}}`;
  });
}

/**
 * `data-plugin` is required, not decorative — see `canvas/mount.ts`: the loader claims every
 * unmarked `<style>` for whichever plugin is materializing, and would tear this one out with it.
 */
function createSheet(): HTMLStyleElement {
  const style = document.createElement("style");
  style.setAttribute("data-plugin", PLUGIN_ID);
  style.setAttribute("data-plugin-css", `${PLUGIN_ID}/uno`);
  return document.head.appendChild(style);
}

/** Drops the sheet and the generator. HMR reloads the module; the old sheet must not survive it. */
export function disposeUnoStyles(): void {
  sheet?.remove();
  sheet = null;
  generator = null;
  preflighted = false;
  themeWritten = "";
  tokens.clear();
}
