/**
 * `createBrowserTsxCompiler`, exercised for real.
 *
 * `compiler.test.ts` asserts on `normalizeGeneratedTsx` + `transform` directly — a re-implementation
 * of this pipeline, which therefore agrees with it forever. Measured: rewriting every `return` in
 * `compiler.ts` to `undefined` (six real mutations) leaves that file **entirely green**. This one
 * imports the module, so it does not.
 *
 * The wasm arrives over `WASM_PATH`, an HTTP route, so the test serves it — the same contract the
 * browser half uses, rather than the disk loader the scripts use.
 */
import { restoreGlobals } from "./globals.ts";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { WASM_PATH } from "../src/contract-assets.ts";
import { createBrowserTsxCompiler, disposeCompiler } from "../src/client/runtime/compiler.ts";

let server: ReturnType<typeof Bun.serve>;
beforeAll(() => {
  // A random high port: the plugin's own routes are mounted by the shell, not by us.
  server = Bun.serve({
    port: 0,
    async fetch(req) {
      if (new URL(req.url).pathname !== WASM_PATH) return new Response("no", { status: 404 });
      return new Response(await Bun.file("node_modules/@esm.sh/tsx/pkg/tsx_bg.wasm").arrayBuffer(), { headers: { "content-type": "application/wasm" } });
    },
  });
  // The browser resolves `WASM_PATH` against the page origin; bun's `fetch` has no origin at
  // all, so the relative path is rewritten to an absolute one for the duration of the test.
  const realFetch = globalThis.fetch;
  (globalThis as any).fetch = (input: any, init?: any) => realFetch(typeof input === "string" && input.startsWith("/") ? new URL(input, server.url.origin).href : input, init);
});
// `restoreGlobals` puts back the real fetch — this file replaces it for the whole file, so
// the restore belongs at the same scope as the install.
afterAll(() => {
  disposeCompiler();
  server.stop(true);
  restoreGlobals();
});

const compile = (code: string, options?: Parameters<ReturnType<typeof createBrowserTsxCompiler>["compile"]>[1]) => createBrowserTsxCompiler().compile(code, options);

describe("createBrowserTsxCompiler", () => {
  test("compiles a settled card", async () => {
    const { code, changed } = await compile("export default function A() { return <div>hi</div> }");
    expect(code).toContain("jsx");
    expect(changed).toBe(true);
  });

  // The rule the whole product rests on: a card that renders every streaming frame must not go
  // blank on the last one. The model routinely stops before its closing brackets.
  test("a card missing its closing brackets still compiles when settled", async () => {
    const { code } = await compile("export default function A() {\n  return (\n    <div>hi</div>\n");
    expect(code).toContain("jsx");
  });

  // The final→streaming fallback. `final` cannot close a truncated type declaration; `streaming`
  // cuts it off. Measured over the 2342 settled corpus cards: 50 reach this branch and 11 come
  // back as a real card. The input has to be one of those 11 shapes — damage BELOW the component,
  // so cutting it away leaves something to mount. An input whose damage sits above the component
  // is rescued into an empty module, which is now a rethrow; see the test further down.
  test("a card only streaming can rescue still compiles when settled", async () => {
    const { code } = await compile("export default function A() {\n  return <div>hi</div>\n}\n\ntype T");
    expect(code).toContain("jsx");
  });

  test("a plain generic arrow in a type declaration does not create a JSX closing tag", async () => {
    const source = `type Persisted = <T>(key: string, initial: T | (() => T)) => [T, (next: T) => void]
export default function C() { return <div /> }`;
    const result = await compile(source);
    expect(result.source).toContain("<T,>(key: string");
    expect(result.source).not.toMatch(/<\/T>\s*$/);
    expect(result.code).toContain("jsx");
  });

  test("a JSX element with a similar text shape stays unchanged", async () => {
    const source = `const node = <T>(value) => value</T>
export default function C() { return <div>{node}</div> }`;
    const result = await compile(source);
    expect(result.source).toContain("const node = <T>(value) => value</T>");
    expect(result.source).not.toContain("<T,>");
  });

  test("changed is false when the output matches previousCode", async () => {
    const first = await compile("export default function A() { return <div /> }");
    const again = await compile("export default function A() { return <div /> }", { previousCode: first.code });
    expect(again.changed).toBe(false);
  });
});

/**
 * That the settled path never returns something that does not compile.
 *
 * The pipeline has two chances: `final`, then `streaming` if that throws. Whether the tail
 * survives is NOT the guarantee — an unclosed array literal normalizes under `final` to
 * `[1, 2,\n  return <div/>\n}];}`, which keeps every character and does not parse, so the
 * fallback correctly prefers the cut-back version that does. I wrote the opposite assertion
 * first and this input disproved it.
 *
 * What the code really promises is that *something compiles*, and that is what is tested.
 */
test("every settled card yields output that compiles", async () => {
  for (const card of ["export default function A() {\n  const rows = [1, 2,\n  return <div>x</div>\n}", "export default function A() {\n  return (\n    <div>hi</div>\n", 'export default function A() {\n  return <div className="ab']) {
    // Compiling is the promise; a non-empty result is not. `type T` alone normalizes to the
    // empty string, which compiles to nothing — see the note below.
    expect((await compile(card)).code.length).toBeGreaterThan(0);
  }
});

/**
 * An empty rescue is not a rescue, on a card that has settled.
 *
 * The measurement that set the old behaviour was taken over 13589 streaming PREFIXES: `final`
 * failing while `streaming` succeeded happened 718 times, and 241 of those rescued a module with
 * no default export left. The conclusion drawn — "both beat an exception mid-stream" — is true and
 * is about the wrong branch. This fallback only runs for `partial: false`; the streaming path
 * returns above it and never reaches here.
 *
 * Re-measured over the 2342 SETTLED card sources in r003-r006, which is the population this branch
 * actually sees: `final` compiles directly 2292 times (97.9%). Of the 50 that fall back, **11
 * rescue a real card, 2 rescue a module that exports nothing**, and 37 fail both ways and throw
 * regardless. So the guard keeps all 11 — they have a default export and build unchanged — and
 * turns the 2 silent blanks into the `final` error, which names the line and column of the damage.
 *
 * A settled card that renders nothing and reports nothing is the worst of the three outcomes: the
 * reader gets a zero-height gap, and the model is never told it wrote something broken.
 */
test("a rescue with nothing left to render rethrows instead", async () => {
  await expect(compile('import { useState } from "react"\n\ntype T')).rejects.toThrow();
});

/**
 * The same input as a streaming frame must still be rescued silently.
 *
 * Mid-stream there is nothing worth reporting — the next frame supersedes this one — and the
 * surface keeps the source block visible on its own (`hasPainted`). Turning that into an
 * exception is the regression the guard above could easily have introduced.
 */
test("mid-stream, an empty rescue is still a rescue", async () => {
  const { code } = await compile('import { useState } from "react"\n\ntype T', { partial: true });
  expect(code).not.toContain("export default");
});
/**
 * `partial: true` is the streaming path and must not take the settled one.
 *
 * The two branches differ only in that `final` tries to close the card before cutting it back,
 * so on most inputs they agree — which is why inverting this one condition passed every test
 * above. The unclosed array literal separates them: `final` keeps the body and fails to parse,
 * `streaming` cuts back to a bare component that renders.
 */
test("a partial frame takes the streaming path", async () => {
  // The input has to be one where BOTH modes compile, or the settled path's catch falls back to
  // streaming and the two produce identical output — which is how the first two candidates I
  // tried passed with the condition inverted. An unclosed `.map(` is the separating case:
  // `final` closes it as `{items.map(i => (null))}`, `streaming` cuts back to `<div></div>`.
  const frame = "export default function A() {\n  return <div>{items.map(i => (\n";
  expect((await compile(frame, { partial: true })).source).not.toContain("items.map");
  expect((await compile(frame)).source).toContain("items.map");
});

/**
 * `import.meta.resolve("…")` is rewritten against the import map before the compiler runs.
 *
 * This is the one line in the module that no test reached: deleting the rewrite entirely — passing
 * `source` straight through — left all 163 tests green. It is a runtime asset lookup, not a module
 * edge, so nothing downstream fails loudly when it silently keeps the bare specifier and the card
 * asks the browser for a URL named `some-asset`.
 */
test("import.meta.resolve is rewritten against the import map", async () => {
  const source = 'export const url = import.meta.resolve("some-asset")\nexport default function A() { return <div>{url}</div> }';
  const mapped = await compile(source, { importMap: { imports: { "some-asset": "https://esm.sh/some-asset" } } });
  expect(mapped.code).toContain("https://esm.sh/some-asset");
  // No map, no rewrite: the specifier survives as written rather than being resolved to nothing.
  expect((await compile(source)).code).toContain("some-asset");
});

/**
 * A final frame whose data literal is malformed above the component.
 *
 * `streaming` normalisation cuts at the FIRST thing it cannot parse. When the model puts a long
 * data array above its component — the common shape when the data is long — that cut takes the
 * component with it, and what survives is imports and type aliases. That compiles cleanly and
 * exports nothing: the surface mounts an empty module, paints zero pixels, reports no error, and
 * the model is never told anything went wrong.
 *
 * Taken verbatim from a real session (the model wrote `{ name: "questions: "list[...]" }`, fusing
 * `name` and `type` into one broken string). There, `streaming` returned the same 265 characters
 * for all 938 frames while the source grew past 13000, and the final frame took the fallback and
 * went blank. The `final` error is the one worth surfacing — it carries the line and column.
 */
test("a fallback that would drop the component rethrows instead of compiling to nothing", async () => {
  const compiler = createBrowserTsxCompiler();
  const broken = `import { useMemo, useState } from "react"

type Param = { name: string; type: string; default: string | null }
type Tool = {
  name: string
  params: Param[]
  returns: string
  kind: "filesystem" | "search" | "exec" | "web" | "github" | "agents" | "goals" | "ui"
}

const TOOLS: Tool[] = [
  { name: "questions: "list[dict[str, Any]]", default: null }] },
]

export default function Answer() {
  return <div>{TOOLS.length}</div>
}
`;
  await expect(compiler.compile(broken, { partial: false })).rejects.toThrow();
  // The same source as a STREAMING frame must still succeed — going blank mid-stream is not an
  // error worth showing, and this path is what keeps the source block visible instead.
  const partial = await compiler.compile(broken, { partial: true });
  expect(partial.code).not.toContain("export default");
  disposeCompiler();
});
