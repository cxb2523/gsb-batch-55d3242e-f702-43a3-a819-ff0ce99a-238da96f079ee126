# Rendering the cards for real

`compile-cards.ts` proves a card compiles and passes the screens. Neither proves it **paints** —
and a card that calls `useState` without importing it does both, then shows nothing. Two of 17
freshly generated cards were in exactly that state while every screen said clean.

## Run it

```sh
bun scripts/render-cards.ts <dir> <port>     # serve; pick an uncommon port
```

Then drive it with ego-browser. The whole driver:

```js
await gotoUrl('http://127.0.0.1:<port>/?v=' + Math.floor(Math.random() * 1e9))  // see NOTE
await wait(3)
await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
const results = await js(String.raw`(async () => {
  const tsx = await import("https://esm.sh/@esm.sh/tsx@1");
  await tsx.default();                       // NOTE: wasm; transform() is undefined until this resolves
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const out = [];
  for (const name of window.__cards) {
    const host = document.createElement("div");
    document.body.appendChild(host);
    try {
      const src = await (await fetch("/card/" + name)).text();
      // NORMALIZE FIRST — production does, and skipping it reports cards as blank that a reader
      // would have seen render. Two of 17 were misjudged this way: `normalizeGeneratedTsx`
      // inserts a missing React import, so the raw source throws `useState is not defined` and
      // the normalized source is fine. Serve `partial-tsx` alongside the cards, or compare
      // against `bun scripts/paint-cards.ts`, which does the same two steps.
      const code = tsx.transform({ code: normalize(src), filename: name }).code;
      const mod = await import(URL.createObjectURL(new Blob([code], { type: "text/javascript" })));
      if (!mod.default) { out.push({ name, status: "no default" }); continue }
      createRoot(host).render(React.createElement(mod.default));
      await new Promise(r => setTimeout(r, 500));
      const text = (host.innerText || "").trim();
      out.push({ name, status: text.length > 0 ? "painted" : "BLANK", chars: text.length });
    } catch (e) { out.push({ name, status: "THREW", error: String(e).slice(0, 70) }) }
  }
  return out;
})()`)
```

To find out WHY something is blank, wrap the element in an error boundary with
`componentDidCatch` — a card that throws during render is indistinguishable from one that
returns nothing until you catch it.

## Traps, each of which cost a run

- **The viewport starts 0×0.** Nothing paints and `snapshotText()` returns just `root`. Set
  device metrics before measuring anything.
- **An import map is fixed at page load.** Restarting the server with a new map changes nothing
  until a fresh navigation — add a cache-busting query, do not just re-run the script.
- **Pick an uncommon port and check it is free.** A collision leaves a _different_ page serving
  200s, and the failure looks like every card being broken.
- **Compiling the raw source is not what production does.** It normalizes `final`, and falls back
  to `streaming` on failure. A driver that skips this measures a path nobody runs — in both
  directions, since normalize both repairs damage and occasionally causes it.
- **`mergeFallbackImports` parses one module.** Over a concatenation of 17 cards it returned 2
  specifiers instead of 9, silently. Accumulate card by card.
