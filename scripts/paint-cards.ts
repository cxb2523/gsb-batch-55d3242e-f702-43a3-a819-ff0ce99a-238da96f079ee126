/**
 * Renders each card with `react-dom/server` and reports the ones that paint nothing.
 *
 * `compile-cards.ts` proves a card compiles and passes the screens; neither proves it PAINTS.
 * Two of 17 freshly generated cards called `useState` without importing it — clean under all 18
 * screens, blank on screen. That class of failure is invisible to a text predicate and obvious
 * to a render.
 *
 * The browser driver in `render-check.md` is still the truth (real effects, real layout, real
 * `innerText`). This is the cheap version that needs no browser and runs in `check`.
 *
 * Measured against the 378-card corpus, where the browser found 9 failures: this finds **7 of
 * them and nothing else** — no card that painted in a browser fails here. The two it cannot see
 * both need more than a first synchronous render: a module-scope hook throws React #321 only
 * under a real root, and an unguarded `[0]` needs the effect to have run.
 *
 * Usage: bun scripts/paint-cards.ts [dir]
 */
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { cardsIn, compileSettled, initTsxFromDisk } from "./tsx-node.ts";
import { stubUnresolvable } from "./stub-unresolvable.ts";
import { TOOL_CALL_MARKUP } from "../src/client/runtime/segments.ts";

// The `$dsh/*` stubs warn on every call, by design — outside dsh there is no harness to reach.
// Here that is expected, and 22 cards' worth of prompts on stderr buries the actual report.
const realWarn = console.warn;
console.warn = () => {};

// Browser globals a card may touch during its first render. Faithful, not inert: a real Map
// behind `localStorage` means a card that writes a draft and reads it back on mount behaves
// exactly as it would — and without this, `localStorage is not defined` reports a working card
// as broken, which is the failure this script exists to avoid making.
const store = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  },
  matchMedia: (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} }),
  // Only `createElement`, and only enough of the result to survive being poked. A contrast
  // checker parses CSS colours through a canvas `fillStyle` round-trip — legal in a browser, and
  // called during render, so `react-dom/server` hit `document is not defined` and this script
  // reported a working card as broken. That is the exact failure it exists to avoid making.
  //
  // Deliberately NOT a DOM: anything that needs a real one should be reported, not faked into
  // passing. `getContext` returning null is what a browser does for an unsupported type, so a
  // card that handles that path correctly still paints and one that assumes success still fails.
  document: { createElement: () => ({ getContext: () => null, style: {}, setAttribute: () => {} }) },
});

await initTsxFromDisk();
const dir = process.argv[2] ?? "test/cards";
let bad = 0;
let skipped = 0;
const blockedBy = new Map<string, number>();
let corrupt = 0;

for (const name of cardsIn(dir)) {
  const src = readFileSync(`${dir}/${name}`, "utf8");
  // Leaked tool-call markup: strip it exactly the way the runtime does, then paint. The one
  // corpus card in this state (`6d82723c61a7.tsx`) renders fine once the tags are gone, so
  // reporting it as corrupt sent the next reader looking for a bug that was in the extraction.
  // Anything the runtime's own strip does NOT remove is still corrupt — the tags are mid-body.
  const stripped = src.replace(TOOL_CALL_MARKUP, "");
  if (/｜｜DSML｜｜|<\/parameter>|<\/invoke>/.test(stripped)) {
    console.log(`${name.padEnd(26)} CORRUPT EXTRACTION — a control token leaked into the middle of the source`);
    corrupt += 1;
    continue;
  }
  let status: string;
  try {
    // `$dsh/*` does not resolve outside dsh, and a card that uses a capability is exactly the
    // kind worth rendering — skipping them would leave the check blind to half the corpus.
    // `types/standalone/*.js` already stands in for every member with the right shape.
    const wired = stubUnresolvable(stripped);
    // Normalize first, `final` then `streaming` — the exact two steps `compiler.ts` performs.
    // Compiling the raw source instead tests a path production never takes, in both directions:
    // it misses damage normalize would have repaired, and it misses damage normalize CAUSES.
    const { code } = compileSettled(name, wired);
    // A blob URL is not importable here; a data URL is, and the card's own imports resolve
    // against this process's node_modules — which is why `$dsh/*` and esm.sh-only packages are
    // reported as skipped rather than broken.
    const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
    if (typeof mod.default !== "function") {
      status = "NO DEFAULT EXPORT";
      bad++;
    } else {
      const html = renderToString(createElement(mod.default));
      status = html.replace(/<[^>]*>/g, "").trim().length > 0 || html.length > 40 ? "paints" : "BLANK";
      if (status === "BLANK") bad++;
    }
  } catch (error) {
    const message = String((error as Error).message ?? error).split("\n")[0];
    // An import this process cannot resolve is the harness's limit, not the card's.
    if (/Cannot find (module|package)|Failed to resolve/.test(message)) status = `skipped — ${message.slice(0, 46)}`;
    else {
      status = `THREW ${message.slice(0, 64)}`;
      bad++;
    }
  }
  if (status.startsWith("skipped")) {
    skipped += 1;
    // Which package, not just how many. "80 skipped" hides whether that is one dependency worth
    // installing or eighty unrelated ones — a different decision each way.
    const pkg = /'([^']+)'|"([^"]+)"/.exec(status);
    if (pkg) blockedBy.set(pkg[1] ?? pkg[2]!, (blockedBy.get(pkg[1] ?? pkg[2]!) ?? 0) + 1);
  }
  if (!status.startsWith("paints") && !status.startsWith("skipped")) console.log(`${name.padEnd(26)} ${status}`);
}

// Say how many were skipped. A check that silently passes over a third of its input reads
// exactly like one that examined everything and found nothing wrong.
const top = [...blockedBy.entries()]
  .toSorted((a, b) => b[1] - a[1])
  .slice(0, 3)
  .map(([name, n]) => `${name} ×${n}`)
  .join(", ");
const parts = [skipped && `${skipped} skipped${top === "" ? "" : `: ${top}`}`, corrupt && `${corrupt} corrupt extraction`].filter(Boolean);
const note = parts.length === 0 ? "" : ` (${parts.join("; ")})`;
console.warn = realWarn;
// "every card" when six were never rendered is the sentence a reader trusts and should not.
// Measured: a card wrote `<Disclosure className=…>`, threw *Passing props on "Fragment"!* and
// showed the reader that message instead of itself — and this line said `ok — every card
// renders something (6 skipped: @headlessui/react ×4 …)`. The skip note was right there and
// the headline still said every. The libraries we push hardest for are exactly the ones this
// check cannot resolve, so the blind spot tracks the advice.
console.log(bad > 0 ? `paint: ${bad} card(s) render nothing${note}` : `paint: ok — every card${skipped > 0 ? " it could check" : ""} in ${dir} renders something${note}`);
// A skip is honest for the corpus — recharts is 51 cards and a deliberate trade. It is NOT honest
// for `test/cards`, which is this repo's own examples inside `bun run check`: everything they
// import either resolves here or has a stub, so a skip there means the gate quietly stopped
// looking at one of them. That happened — a stale capability list dropped `metro.ui4a.tsx` and the
// report still read `ok`.
if (dir === "test/cards" && skipped > 0) {
  console.log(`paint: ${skipped} reference card(s) were skipped — every import here should resolve or be stubbed`);
  process.exit(1);
}
if (bad > 0) process.exit(1);
