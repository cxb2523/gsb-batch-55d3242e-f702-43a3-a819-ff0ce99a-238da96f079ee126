/**
 * Mounts each card in a real browser and reports whether it painted.
 * `compile-cards.ts` proves a card compiles; CLAUDE.md §4 has three separate ways a card
 * compiles cleanly and renders blank, so the only honest check is to run one.
 *
 * Serves a page that imports the card as a blob module and mounts it, then the caller
 * drives it with ego-browser and reads `window.__cardResult`.
 */
import { readFileSync } from "node:fs";

import { resolve } from "node:path";

import { mergeFallbackImports } from "partial-react/import-map";
import { cardsIn } from "./tsx-node.ts";

/** Every $dsh group, whose generated stubs are concatenated into the one shim module. */
// Every group `gen-standalone.ts` writes, including the self-sufficient ones — `state.js` is the
// real `usePersistedState`, not a stub, so a card that persists behaves here as it does in dsh.
const SHIM_GROUPS = ["chat", "ai", "fs", "exec", "state"];

// `test/cards`, like its siblings. The old default was `.research/cards`, which has not existed
// for some time — running with no argument failed inside a readdir rather than saying so.
const dir = process.argv[2] ?? "test/cards";
const cards = cardsIn(dir);

/**
 * The import map, built the way `GenUISurface` builds it: the fixed entries below, plus an
 * esm.sh fallback for every bare specifier any card actually imports.
 *
 * A hand-kept list is wrong the first time a card imports something not on it — measured: one
 * of 17 freshly generated cards imports `react-syntax-highlighter`, resolved fine in production
 * by `mergeFallbackImports`, and was reported here as `Failed to resolve module specifier`. A
 * harness that reports a working card as broken is worse than no harness.
 */
const LITERAL: Record<string, string> = {
  react: "https://esm.sh/react@18",
  // Not decoration: packages fetched from esm.sh arrive as compiled JS whose `import "react-dom"`
  // survives verbatim (`react-aria-components` alone carries 13 of them), and a bare specifier this
  // map lacks kills the whole module graph — a blank card with nothing in the console, which reads
  // exactly like broken code.
  "react-dom": "https://esm.sh/react-dom@18",
  "react-dom/client": "https://esm.sh/react-dom@18/client",
  "react/jsx-runtime": "https://esm.sh/react@18/jsx-runtime",
  "lucide-react": "https://esm.sh/lucide-react@0.400.0?external=react",
  recharts: "https://esm.sh/recharts@2?external=react",
  "motion/react": "https://esm.sh/motion@11/react?external=react",
  "partial-json": "https://esm.sh/partial-json@0.1.7",
  minimatch: "https://esm.sh/minimatch@10",
  micromatch: "https://esm.sh/micromatch@4",
  picomatch: "https://esm.sh/picomatch@4",
  semver: "https://esm.sh/semver@7",
  "react-markdown": "https://esm.sh/react-markdown@9?external=react",
  "remark-gfm": "https://esm.sh/remark-gfm@4",
  "$dsh/ai": "/shim/ai",
  "$dsh/fs": "/shim/fs",
  "$dsh/exec": "/shim/exec",
  "$dsh/chat": "/shim/chat",
  "$ui4a/chat": "/shim/chat",
  // Both prefixes on purpose. `$ui4a/*` only feeds the pre-rename corpus cards; `$dsh/*` is what the
  // current prompt teaches, and a missing entry does not fail quietly — `mergeFallbackImports` reads
  // it as an npm package and resolves `https://esm.sh/$dsh/state?bundle&…`, which kills every card
  // that persists state.
  "$dsh/state": "/shim/state",
  "$ui4a/state": "/shim/state",
};
// One card at a time, accumulating. `mergeFallbackImports` parses ONE module's source — over a
// concatenation of 17 cards it returned 2 specifiers instead of 9, silently, because the parse
// stops at the first thing that is not a valid module prefix.
let imports = LITERAL;
for (const name of cards) imports = await mergeFallbackImports(imports, readFileSync(`${dir}/${name}`, "utf8"));
const port = Number(process.argv[3] ?? 47771);

Bun.serve({
  port,
  routes: {
    "/": () =>
      new Response(
        `<!doctype html><meta charset=utf8><div id=root></div>
<script type="importmap">${JSON.stringify({ imports })}</script>
<script type="module">
window.__cards = ${JSON.stringify(cards)};
window.__src = {};
</script>`,
        { headers: { "content-type": "text/html" } },
      ),
    "/card/:name": (req) => new Response(readFileSync(`${dir}/${req.params.name}`, "utf8"), { headers: { "content-type": "text/plain" } }),
    // Capability shims. Without them ~90 of the corpus cards fail to import and the run reports
    // them as broken for a reason that is the harness's, not the card's. They resolve and return
    // inert values — enough to mount, which is what is being measured.
    "/shim/:group": () =>
      new Response(
        [
          // The generated stubs, not a third hand-written copy: `types/standalone/*.js` already
          // returns an empty value of the right SHAPE for every member, and keeping a separate
          // list here meant this one lacked `readBytes` entirely and gave `bash` no `truncated`
          // or `timedOut` — so a card reading `r.truncated.stdout` threw during a render sweep
          // and was reported broken for the harness's reason rather than its own.
          //
          // One union module for every group, because the route cannot know which `$dsh/*` the
          // importer asked for; duplicate names across groups do not occur.
          ...SHIM_GROUPS.map((group) => readFileSync(resolve(import.meta.dir, `../types/standalone/${group}.js`), "utf8").replaceAll(/^export default .*$/gm, "")),
          // `$ui4a/*` is the pre-rename prefix. Nothing resolves it in production — that is the
          // point of the rename — but 22 corpus cards were written against it, and leaving them
          // to fail here would report a build-lag artefact as a broken card. `usePersistedState`
          // used to be stubbed here too; it now arrives from `state.js` above, for real.
          "export default {};",
        ].join("\n"),
        { headers: { "content-type": "text/javascript" } },
      ),
  },
});
console.log(`serving ${cards.length} cards on ${port}`);

/*
 * Drive it with ego-browser: open `/`, then in the page compile each `/card/:name` through
 * @esm.sh/tsx, import it as a blob module, mount it with createRoot, and read back innerText.
 *
 * When clicking a control from script, dispatch the whole sequence
 * (pointerdown, mousedown, pointerup, mouseup, click) — a bare `.click()` on a React button
 * can leave state untouched and looks exactly like a broken card.
 *
 * Two more rules, each of which produced a wrong number before it was found:
 *
 * - **Click ONE control, not every control.** A segmented group (`linear`/`log`, a filter row,
 *   a tab strip) is set and immediately unset by a loop that clicks all of its buttons, so the
 *   card ends exactly where it started and reads as inert. Four of six re-tested cards flipped
 *   from "inert" to "responded" on this change alone.
 * - **Diff `innerHTML`, not `innerText`.** A highlighted tab, a changed border, a chart axis —
 *   every visual-only state change is invisible to a text diff. Even HTML misses a recharts
 *   re-render that happens to produce identical SVG, so "no change" is weak evidence at best.
 *
 * The loop that worked, with the two things that each cost a wasted run:
 *
 * ```js
 * const tsx = await import("https://esm.sh/@esm.sh/tsx@1.0.5"); await tsx.default()
 * // `.code` is a STRING here, not bytes — decoding it throws and every card reports THREW.
 * const out = tsx.transform({ filename: "_.tsx", code, target: "es2022", jsxImportSource: "react" }).code
 * const mod = await import(URL.createObjectURL(new Blob([out], { type: "text/javascript" })))
 * // Capture console.error around the render. React renders an EMPTY TREE on a throw and says
 * // nothing visible — all four blank cards in the corpus were only explicable this way.
 * const errs = []; const real = console.error; console.error = (...a) => errs.push(String(a[0]))
 * createRoot(mount).render(React.createElement(mod.default))
 * await new Promise(r => setTimeout(r, 90)); console.error = real
 * ```
 *
 * Waiting longer does not turn a blank card into a painted one: measured at 90ms, 400ms and
 * 1200ms, `innerHTML.length` stayed 0. A blank card is broken, not slow.
 */
