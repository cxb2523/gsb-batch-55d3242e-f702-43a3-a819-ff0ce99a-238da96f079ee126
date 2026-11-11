/**
 * Serves the real `GenUISurface` against a local React, so a card can be mounted the way the
 * plugin mounts it — including partial-react's error boundary, which is what decides whether a
 * throwing card shows a message or nothing at all.
 *
 * Local, not esm.sh: the verification browser cannot always reach it, and a card under test
 * should not fail for a reason that has nothing to do with the card. The tsx wasm comes from
 * `node_modules` on the plugin's own asset route, exactly as `compiler.ts` fetches it.
 *
 * Usage: `bun scripts/surface-harness.ts [port] [card.tsx]`. With a card path it also serves the
 * source at `/card` and the icon names it imports at `/icons`; the driver registers a stand-in for
 * lucide with `registerModules`, which `/surface.js` re-exports for exactly that purpose:
 *
 *   const { GenUISurface, registerModules } = await import("/surface.js")
 *   const icon = () => React.createElement("span")
 *   registerModules({ "lucide-react": Object.fromEntries((await (await fetch("/icons")).json()).map(n => [n, icon])) })
 *
 * Then in ego-browser import `/surface.js` and
 * render `GenUISurface` with `{ code, streaming, onError }`. React comes from the UMD globals
 * (`globalThis.React` / `globalThis.ReactDOM`), not from a bare import.
 *
 * Cards importing `$dsh/*` mount here. They did not until `$dsh/internal` stopped being
 * registered inside `registerUi4aHost` — a page with no host got capability blobs importing an
 * empty module, and the card rendered silently blank. `$dsh/state` works fully (no host behind
 * it); the host-backed ones lay out correctly and only throw `no host bound` at the moment they
 * are actually called, which is what a preview should do.
 */
import { readFileSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { AI_STREAM_PATH, WASM_PATH } from "../src/contract-assets.ts";

const port = Number(process.argv[2] ?? 47895);
/** Optional card file, served at `/card` and scanned for the icons its lucide shim must declare. */
const cardPath = process.argv[3];

// Re-export every name the UMD build defines rather than hand-listing them: the consumer is
// partial-react, not our own code, and a hand-list cost three rounds of "does not provide an
// export named X" — createContext, useLayoutEffect, Component, one at a time.
// Resolved against THIS FILE, not the cwd: the harness is started from wherever the caller
// happens to be (a wave runner in /tmp, a shell in the repo), and a relative `node_modules` makes
// it die with ENOENT in a background log nobody is reading — the visible symptom is a wave that
// reports zero screenshots and no error. `shot-card.mjs` carries the same fix for the same reason.
const REPO_ROOT = new URL("..", import.meta.url).pathname;
const reactKeys = [...readFileSync(`${REPO_ROOT}node_modules/react/umd/react.development.js`, "utf8").matchAll(/exports\.(\w+)\s*=/g)].map((m) => m[1]).filter((name) => /^[A-Za-z_$][\w$]*$/.test(name) && name !== "default");

// The bundle resolves react through aliases onto the UMD globals rather than leaving them
// external: with no document import map (see below) a bare `import "react"` inside the bundle
// has nothing to resolve against.
await Bun.write("/tmp/dsh-harness-react.js", ["const R = globalThis.React;", "export default R;", ...reactKeys.map((k) => `export const ${k} = R[${JSON.stringify(k)}];`)].join("\n"));
await Bun.write("/tmp/dsh-harness-jsx.js", "const R = globalThis.React;\nexport const Fragment = R.Fragment;\nexport const jsx = (t, p, k) => R.createElement(t, k === undefined ? p : { ...p, key: k });\nexport const jsxs = jsx;\nexport const jsxDEV = jsx;");
await Bun.write("/tmp/dsh-harness-dom.js", "const D = globalThis.ReactDOM;\nexport default D;\nexport const { flushSync, createPortal } = D;\nexport const createRoot = D.createRoot;\nexport const renderToString = () => '';");

// One entry exporting both, so a driver can stand in for a package the browser cannot fetch.
// It lives outside the repo — a temp file in the working tree survives a failed build and shows
// up as an untracked file in whatever the next command looks at.
// Port-scoped: two harnesses run side by side to shoot a card in both themes, and a fixed
// name makes the second one unlink the first one's entry mid-build.
const entry = `${tmpdir()}/dsh-surface-entry-${port}.ts`;
const from = (path: string) => JSON.stringify(resolve(import.meta.dir, "..", path));
await Bun.write(
  entry,
  [
    `export { GenUISurface } from ${from("src/client/runtime/GenUISurface.tsx")};`,
    `export { registerModules } from ${from("src/client/runtime/registry.ts")};`,
    `export { registerUi4aHost } from ${from("src/client/runtime/bindings.ts")};`,
    `export { claimInlineFences, isLastSegment } from ${from("src/client/runtime/inline-fence.ts")};`,
    `export { reportCardError, cardRendered } from ${from("src/client/runtime/report-error.ts")};`,
    "",
  ].join("\n"),
);

const bundle = await (
  await Bun.build({
    entrypoints: [entry],
    target: "browser",
    plugins: [
      {
        name: "react-from-umd",
        setup(build) {
          build.onResolve({ filter: /^react(\/jsx-(dev-)?runtime)?$|^react-dom(\/(client|server))?$/ }, (args) => ({
            path: args.path.startsWith("react-dom") ? "/tmp/dsh-harness-dom.js" : args.path.includes("jsx") ? "/tmp/dsh-harness-jsx.js" : "/tmp/dsh-harness-react.js",
          }));
        },
      },
    ],
  })
).outputs[0].text();
await unlink(entry);

/**
 * Named exports for exactly the icons the given card imports, each an empty span.
 *
 * Real icons mean esm.sh, which the verification browser cannot always reach, and a card must not
 * fail a mount test for a reason that has nothing to do with the card. A Proxy default export does
 * not work: `import { Droplets }` is a static binding the module has to declare.
 */
const lucideNames = cardPath === undefined ? [] : [...(readFileSync(cardPath, "utf8").match(/import\s*\{([^}]*)\}\s*from\s*["']lucide-react["']/)?.[1] ?? "").matchAll(/[A-Z]\w*/g)].map((m) => m[0]);

const js = (source: string) => new Response(source, { headers: { "content-type": "text/javascript" } });
const file = (path: string) => new Response(readFileSync(path, "utf8"), { headers: { "content-type": "text/javascript" } });

/**
 * The page installs NO import map, on purpose.
 *
 * `registerRuntimeModules()` installs one containing blob modules for the react family *and* the
 * `$dsh/*` capabilities, and it refuses to install over a map that is already there — so a
 * harness that provides its own react map leaves every `$dsh/*` blob unresolvable, and a card
 * importing one fails to compile with `Unresolvable imports`. Instead the page publishes the
 * React globals from the UMD builds, and `/surface.js` is imported first so its registration is
 * what the browser resolves against.
 */

/*
 * The host's design tokens, captured from a live `dsh web` (both themes, 350 values each).
 *
 * Without them every `var(--dsw-alias-…)` resolves to nothing, so a card that borders and fills
 * correctly renders as unstyled text — and a screenshot of that is a picture of the harness, not
 * of the card. The first real card screenshotted here looked broken for exactly this reason.
 *
 * THEME=dark to see the ground the app actually ships with.
 */
const theme = process.env.THEME === "dark" ? "dark" : "light";
const themeVars = Object.entries(JSON.parse(readFileSync(new URL(`../test/fixtures/dsw-tokens-${theme}.json`, import.meta.url), "utf8")) as Record<string, string>)
  .map(([name, value]) => `${name}:${value}`)
  .join(";");

Bun.serve({
  port,
  routes: {
    "/umd/react.js": () => file(`${REPO_ROOT}node_modules/react/umd/react.development.js`),
    "/umd/react-dom.js": () => file(`${REPO_ROOT}node_modules/react-dom/umd/react-dom.development.js`),
    "/m/react.js": () => js(["const R = globalThis.React;", "export default R;", ...reactKeys.map((k) => `export const ${k} = R[${JSON.stringify(k)}];`)].join("\n")),
    "/m/jsx-runtime.js": () => js("const R = globalThis.React;\nexport const Fragment = R.Fragment;\nexport const jsx = (t, p, k) => R.createElement(t, k === undefined ? p : { ...p, key: k });\nexport const jsxs = jsx;\nexport const jsxDEV = jsx;"),
    "/m/react-dom.js": () => js("const D = globalThis.ReactDOM;\nexport default D;\nexport const { flushSync, createPortal } = D;"),
    "/m/react-dom-client.js": () => js("export const createRoot = globalThis.ReactDOM.createRoot;"),
    // partial-react imports it; nothing under test calls it.
    "/m/react-dom-server.js": () => js("export const renderToString = () => '';\nexport default { renderToString };"),
    "/surface.js": () => js(bundle),
    // `$dsh/ai`, forwarded to a real model when one is configured.
    //
    // Without this route a streaming card renders its ERROR branch and a judge scores the harness:
    // measured on a wave-3 card whose shot was `Ops, deu um bug aqui buscando os livros` in red —
    // the card handling failure correctly, which is exactly what should not be photographed. 9 of
    // 11 wave-3 canvases import a `$dsh/*` capability; 6 import this one.
    //
    // Canned data was tried first and is worse than it looks. These cards feed the stream to a
    // `partial-json` parser against a schema their own prompt declares (`{"items":[{"title",
    // "author","vibe","blurb","match"}]}` on the card measured here), so a generic `{items:[…]}`
    // fills one field per row and leaves the rest blank — a picture of a card missing most of its
    // content, which reads as a layout defect. The card's prompt says exactly what it wants; the
    // honest stand-in is to ask a model, which is what production does.
    //
    // No key configured -> 501 with a body saying so, NOT a canned success. A shot taken against
    // an unconfigured harness must be recognisable as one.
    [AI_STREAM_PATH]: async (request: Request) => {
      const key = process.env.LITELLM_24000_API_KEY;
      const base = process.env.LITELLM_24000_BASE ?? "http://34.177.103.253:24000/v1";
      const model = process.env.HARNESS_AI_MODEL ?? "glm-5.2";
      if (!key) return new Response("[harness] $dsh/ai needs LITELLM_24000_API_KEY — no canned answer is offered, because a shot of one is not a shot of this card", { status: 501 });
      const { prompt } = (await request.json()) as { prompt?: string };
      const upstream = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, stream: true, max_tokens: 8000, messages: [{ role: "user", content: prompt ?? "" }] }),
      });
      if (!upstream.ok || !upstream.body) return new Response(`[harness] upstream ${upstream.status}`, { status: 502 });
      // The card wants raw text, not SSE frames: unwrap `data:` lines into their delta content.
      const stream = new ReadableStream({
        async start(controller) {
          const reader = upstream.body!.getReader();
          const decoder = new TextDecoder();
          let buffered = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffered += decoder.decode(value, { stream: true });
            const lines = buffered.split("\n");
            buffered = lines.pop() ?? "";
            for (const line of lines) {
              if (!line.startsWith("data:")) continue;
              const payload = line.slice(5).trim();
              if (payload === "[DONE]") continue;
              try {
                const piece = JSON.parse(payload)?.choices?.[0]?.delta?.content;
                if (piece) controller.enqueue(new TextEncoder().encode(piece));
              } catch {
                /* a partial frame — the next chunk completes it */
              }
            }
          }
          controller.close();
        },
      });
      return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8" } });
    },
    "/card": () => (cardPath === undefined ? new Response("no card", { status: 404 }) : new Response(readFileSync(cardPath, "utf8"), { headers: { "content-type": "text/plain" } })),
    // An extra page on THIS origin, named by `HARNESS_PAGE`. It has to be same-origin or its
    // `import("/surface.js")` resolves to nothing: the real compiler is what makes a page showing
    // two cards side by side a comparison rather than a screenshot of one.
    "/page": () => {
      const path = process.env.HARNESS_PAGE;
      if (path === undefined) return new Response("set HARNESS_PAGE", { status: 404 });
      return new Response(readFileSync(path, "utf8"), { headers: { "content-type": "text/html; charset=utf-8" } });
    },
    /** Whatever `HARNESS_DATA` points at, verbatim. The page fetches its own content from here. */
    "/data": () => {
      const path = process.env.HARNESS_DATA;
      if (path === undefined) return new Response("set HARNESS_DATA", { status: 404 });
      return new Response(readFileSync(path, "utf8"), { headers: { "content-type": "application/json; charset=utf-8" } });
    },
    "/icons": () => new Response(JSON.stringify(lucideNames), { headers: { "content-type": "application/json" } }),
    [WASM_PATH]: () => new Response(readFileSync(`${REPO_ROOT}node_modules/@esm.sh/tsx/pkg/tsx_bg.wasm`), { headers: { "content-type": "application/wasm" } }),
    "/": () =>
      new Response(
        `<!doctype html><meta charset=utf8>
<style>:root{${themeVars}}body{margin:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family,system-ui,-apple-system,sans-serif)}</style>
<script src="/umd/react.js"></script><script src="/umd/react-dom.js"></script>
<div id=root></div>`,
        { headers: { "content-type": "text/html" } },
      ),
  },
});
console.log(`surface harness on ${port} — ${reactKeys.length} react exports${cardPath === undefined ? "" : `, card ${cardPath} with ${lucideNames.length} icons`}`);
