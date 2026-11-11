/**
 * Prints what a package actually exports, in a browser, through the same esm.sh URLs the runtime
 * resolves. Written after the skill told the model to write `<NumberFlow value={n} />` without
 * saying it is a **default** export — `import { NumberFlow }` is `undefined` and a blank card,
 * which is the exact failure the skill's own "look the name up first" rule warns about.
 *
 * Serves a page whose import map is built by the real resolver; drive it with ego-browser and
 * read back `Object.keys` per package. Usage: `bun scripts/check-exports.ts vaul sonner`.
 *
 * For default-vs-named alone, `curl -s https://esm.sh/<package>` is faster and needs no browser:
 * an `export { default }` line among the re-exports answers it. This script is for the other
 * question — the full list of named exports, when checking that every name a card imports
 * (`{ Field, Label, Switch }`) actually exists.
 */
import { mergeFallbackImports } from "partial-react/import-map";

const packages = process.argv.slice(2);
if (packages.length === 0) throw new Error("usage: bun scripts/check-exports.ts <package>...");

const base = {
  react: "https://esm.sh/react@18",
  "react-dom": "https://esm.sh/react-dom@18",
  "react-dom/client": "https://esm.sh/react-dom@18/client",
  "react/jsx-runtime": "https://esm.sh/react@18/jsx-runtime",
};
const code = packages.map((p) => `import ${JSON.stringify(p)}`).join("\n");
const imports = await mergeFallbackImports(base, code);
const port = 47873;

Bun.serve({
  port,
  fetch: () =>
    new Response(
      `<!doctype html><meta charset=utf8>
<script type="importmap">${JSON.stringify({ imports })}</script>
<script>window.__packages = ${JSON.stringify(packages)}</script>`,
      { headers: { "content-type": "text/html" } },
    ),
});
console.log(`serving on ${port}: ${packages.join(" ")}`);

/*
 * In ego-browser, open `/` and evaluate:
 *
 *   for (const p of window.__packages) {
 *     // retry — the first import of a package esm.sh has not built yet fails and succeeds later
 *     const m = await import(p)
 *     console.log(p, Object.keys(m), "default" in m)
 *   }
 */
