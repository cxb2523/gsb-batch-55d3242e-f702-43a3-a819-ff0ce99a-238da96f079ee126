/**
 * The page renders its demo cards with the real thing: partial-react compiling TSX in the browser as
 * it streams, the same pipeline the plugin runs inside dsh. Two problems a static page has that dsh
 * does not, both solved here:
 *
 * - **One React.** A card's `import { useState } from "react"` must reach THIS page's React, or hooks
 *   fail silently. So does every esm.sh package a card imports (they are fetched with
 *   `external=react,…`, leaving `react` bare). A document import map points each of those specifiers
 *   at a `data:` module that re-exports the page's own instance off `globalThis`. It has to be in the
 *   document before the page's module script, which is why `ImportMapScript` is server-rendered.
 * - **The compiler's wasm.** Bundled, `@esm.sh/tsx` inlines its 2.6MB wasm as base64. The entry imports
 *   it by URL instead and `compile` below fetches the wasm from esm.sh too.
 */
import type { GenUIRenderer as Renderer } from "partial-react";

type CompileOptions = { importMap?: { imports?: Record<string, string> }; partial?: boolean; previousCode?: string; filename?: string };
type Tsx = { default: (wasm: string) => Promise<unknown>; transform: (o: object) => { code: Uint8Array } };
type Runtime = { GenUIRenderer: typeof Renderer; normalize: (code: string, o: { mode: "streaming" }) => string; tsx: Tsx };

const WASM = "https://esm.sh/@esm.sh/tsx@1.5.3/pkg/tsx_bg.wasm";
let wasm: Promise<unknown> | undefined;

/** partial-react's own compiler, minus its bundled wasm: same normalize-then-transform, wasm fetched by URL. */
async function compile(code: string, o: CompileOptions = {}) {
  const { tsx, normalize } = runtime!;
  await (wasm ??= tsx.default(WASM));
  const source = o.partial ? normalize(code, { mode: "streaming" }) : code;
  const out = new TextDecoder().decode(tsx.transform({ filename: o.filename ?? "_.tsx", code: source, target: "es2022", importMap: o.importMap, jsxImportSource: "react" }).code);
  return { code: out, source, changed: out !== o.previousCode };
}

/** Pinned: a card that rendered yesterday must render today, and esm.sh's bare name floats. */
const X = "bundle&target=es2022&external=react,react-dom,scheduler,three";
export const PACKAGES: Record<string, string> = {
  "react-aria-components": `https://esm.sh/react-aria-components@1.10.1?${X}`,
  "@number-flow/react": `https://esm.sh/@number-flow/react@0.5.10?${X}`,
  "@react-three/fiber": `https://esm.sh/@react-three/fiber@9.1.2?${X}`,
  // Unbundled and in the document map, so fiber's `three` and a card's `three` are one module.
  three: "https://esm.sh/three@0.176.0?target=es2022",
  "canvas-confetti": "https://esm.sh/canvas-confetti@1.9.3?target=es2022",
  katex: "https://esm.sh/katex@0.16.22?target=es2022",
};

const ident = /^[A-Za-z_$][\w$]*$/;
const shim = (spec: string, mod: object) => {
  const names = Object.keys(mod).filter((k) => k !== "default" && ident.test(k));
  return `data:text/javascript,${encodeURIComponent(`const M=globalThis.__ui4a[${JSON.stringify(spec)}];export default M.default??M;export const {${names.join(",")}}=M;`)}`;
};

let runtime: Runtime | null = null;
export let IMPORT_MAP: { imports: Record<string, string> } = { imports: { ...PACKAGES } };

export function installRuntime(next: Runtime, modules: Record<string, object>) {
  runtime = next;
  (globalThis as { __ui4a?: Record<string, object> }).__ui4a = modules;
  IMPORT_MAP = { imports: { ...PACKAGES, ...Object.fromEntries(Object.entries(modules).map(([spec, mod]) => [spec, shim(spec, mod)])) } };
}

/** `genui dev` has no server render, so the map arrives after the module script; Chromium merges late maps. */
const resolves = (spec: string) => {
  try {
    return import.meta.resolve(spec) === IMPORT_MAP.imports[spec];
  } catch {
    return false;
  }
};

export function ensureImportMap() {
  // The built page's map is server-rendered and already live. Under genui dev React inserts that tag
  // on the client, where it never runs, so the resolver — not the DOM — says whether a map is needed.
  if (resolves("$dsh/chat")) return;
  const script = document.createElement("script");
  script.type = "importmap";
  script.textContent = JSON.stringify(IMPORT_MAP);
  document.head.append(script);
}

export const createRenderer = (target: HTMLElement, onRendered: () => void) => runtime!.GenUIRenderer.create(target, { importmap: IMPORT_MAP, compiler: { compile }, callbacks: { onRendered } });

/** Starts the 2.6MB wasm fetch before the first card needs it. */
export const prewarm = () => void compile("export default () => null").catch(() => {});
