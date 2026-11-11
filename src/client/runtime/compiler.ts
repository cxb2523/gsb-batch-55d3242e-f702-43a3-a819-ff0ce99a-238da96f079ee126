import initTsx, { transform as transformTsx } from "@esm.sh/tsx";
import { rewriteImportMetaResolveSpecifiers, type RendererImportMap } from "partial-react/import-map";
import { WASM_PATH } from "../../contract-assets.ts";
import { normalizeGeneratedTsxCompat } from "./normalize.ts";

// Structurally equivalent to `partial-react/compiler`'s three types. Deliberately not
// imported from there: that module has a Vite-only `...tsx_bg.wasm?url` at the top level
// plus a node:fs read path and a `Bun` global, none of which survive a plugin bundle.
export type CompileOptions = { importMap?: RendererImportMap; partial?: boolean; previousCode?: string; filename?: string };
export type CompileResult = { code: string; source: string; changed: boolean };
export type TsxCompiler = { compile: (code: string, options?: CompileOptions) => Promise<CompileResult> };

let initPromise: Promise<unknown> | null = null;

/** The wasm is served by this plugin's own webServer route; /plugins only serves client.js. */
const initCompiler = () =>
  (initPromise ??= initTsx(WASM_PATH).catch((error: unknown) => {
    initPromise = null;
    throw error;
  }));

/**
 * Starts loading the 2.6 MB wasm file so it is warm before the first real frame (a cold init
 * costs 400-500 ms). The *file* is 2.6 MB; an instantiated compiler costs roughly 16 MB of
 * heap, which is why `disposeCompiler` exists — the two numbers have been confused before.
 *
 * Never throws: `apply()` calls this and nothing else awaits it, so a
 * synchronous failure inside `initTsx` — an unfetchable wasm path, say — would otherwise
 * take the whole plugin's registration down with it and leave the shell loading forever.
 * A cold compile on the first card is a far better outcome than no plugin at all.
 */
export const warmCompiler = (): Promise<unknown> => {
  try {
    return initCompiler().catch(() => undefined);
  } catch {
    initPromise = null;
    return Promise.resolve();
  }
};

/**
 * Drops the wasm instance so GC can take it. `@esm.sh/tsx` exports no dispose — only
 * `init`/`initSync`/`transform` — so releasing the reference is the whole of what we can do.
 * Measured 2026-08-23: an instance costs ~16MB, and each HMR round made a fresh one while the
 * previous stayed reachable through this module-level promise. Dev-only, but a dozen reloads
 * is 200MB.
 */
export function disposeCompiler(): void {
  initPromise = null;
}

/**
 * Does this source still export a component to mount?
 *
 * Deliberately a source test rather than a compile test: the failure being caught is a module that
 * compiles perfectly and has nothing in it. Matches the two spellings the renderer accepts, and is
 * written to ignore both comment forms so a `// export default` in prose cannot fake it.
 */
const hasDefaultExport = (source: string) => /^\s*export\s+default\s/m.test(source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")) || /\bexport\s*\{[^}]*\bas\s+default\b/.test(source);

export function createBrowserTsxCompiler(): TsxCompiler {
  return {
    async compile(code, options = {}) {
      await initCompiler();
      const importMap = options.importMap;
      const build = (source: string): CompileResult => {
        const resolved = importMap?.imports ? rewriteImportMetaResolveSpecifiers(source, importMap.imports) : source;
        const result = transformTsx({ filename: options.filename ?? "_.tsx", code: resolved, target: "es2022", importMap, jsxImportSource: "react" });
        const compiled = new TextDecoder().decode(result.code);
        return { code: compiled, source, changed: compiled !== options.previousCode };
      };

      // Normalization runs for `final` too. The model does not reliably close its trailing
      // `)` and `}` before writing the fence, so compiling the raw source renders every
      // streaming frame fine and then throws `Expected ',', got '<eof>'` at the very moment
      // the block completes — measured on exactly that shape.
      if (options.partial === true) return build(normalizeGeneratedTsxCompat(code, { mode: "streaming" }));
      try {
        return build(normalizeGeneratedTsxCompat(code, { mode: "final" }));
      } catch (error) {
        // **The final compile must never be more fragile than a streaming frame.** The only
        // difference between the modes is that `streaming` first cuts back the still-being-typed
        // tail, and some damage (an unterminated string, typically) is only recoverable by
        // cutting. Losing the last half-sentence beats going blank on the last frame.
        const cut = normalizeGeneratedTsxCompat(code, { mode: "streaming" });
        // **But only if anything is left to render.** The cut is bounded by the FIRST thing it
        // cannot parse, so a card that puts its data above its component — the common shape when
        // the data is long — loses the component too, and what comes back is a module of imports
        // and type aliases. That compiles. It exports nothing, mounts nothing, and the surface
        // reports no error, so the reader gets a card of zero height and the model is never told.
        // Measured on a real session: the model wrote `{ name: "questions: "list[...]" }` in the
        // first array element, `streaming` returned the same 265 characters for all 938 frames
        // while the source grew to 13693, and the final frame took this fallback and went blank.
        // The `final` error is the useful one here — it names the line and column of the typo.
        if (!hasDefaultExport(cut)) throw error;
        return build(cut);
      }
    },
  };
}
