/**
 * The synthesized re-export modules.
 *
 * This is generated source: a mistake produces a blob that fails to parse, which kills the
 * whole module graph and renders the card blank **with nothing in the console** (§4). So the
 * test's real assertion is not on the string but on whether it is valid ESM — checked by
 * parsing it, not by matching text.
 */
import { describe, expect, test } from "bun:test";
import { buildModuleSource, moduleUrl, registerModules } from "../src/client/runtime/registry.ts";

/** Valid ESM, or the parse error. `transpileSync` rejects what the browser would reject. */
const parses = (source: string) => {
  try {
    new Bun.Transpiler({ loader: "js" }).transformSync(source);
    return true;
  } catch {
    return false;
  }
};

describe("buildModuleSource", () => {
  test("re-exports every enumerable name", () => {
    registerModules({ "fake/mod": { alpha: 1, beta: 2 } });
    const source = buildModuleSource("fake/mod");
    expect(source).toContain("export const alpha");
    expect(source).toContain("export const beta");
    expect(parses(source)).toBe(true);
  });

  // Export names must be statically visible, so each is written out. A name that is not an
  // identifier cannot be written that way — and emitting it anyway is a syntax error that takes
  // the entire graph down, not just that one name. esm.sh packages really do carry such keys.
  test("a non-identifier export name is skipped, not emitted", () => {
    registerModules({ "fake/odd": { ok: 1, "with-dash": 2, "3d": 3, "": 4 } });
    const source = buildModuleSource("fake/odd");
    expect(source).toContain("export const ok");
    expect(source).not.toContain("with-dash");
    expect(parses(source)).toBe(true);
  });

  // `default` is re-exported through `export default`, never as a `const` — `export const default`
  // is a syntax error, and it is the one name every React-ish package has.
  test("default is handled separately", () => {
    registerModules({ "fake/def": { default: 1, other: 2 } });
    const source = buildModuleSource("fake/def");
    expect(source).toContain("export default ns.default;");
    expect(source).not.toContain("export const default");
    expect(parses(source)).toBe(true);
  });

  // A namespace with no default still needs one: `import React from "react"` is what generated
  // code writes, and a module with no default export makes that import throw at link time.
  test("a namespace without a default still exports one", () => {
    registerModules({ "fake/nodef": { only: 1 } });
    expect(buildModuleSource("fake/nodef")).toContain("export default ns;");
  });

  test("an unregistered specifier still yields a parseable module", () => {
    expect(parses(buildModuleSource("fake/never-registered"))).toBe(true);
  });
});

/**
 * URL stability. The document import map is installed once and points at these blobs for the
 * tab's life, so revoking one leaves every esm.sh package resolving `react` to a dead URL —
 * the module graph dies and the card renders blank with an empty console.
 */
describe("moduleUrl", () => {
  test("re-registering the SAME namespace keeps the URL", () => {
    const react = { useState: 1 };
    registerModules({ "fake/stable": react });
    const first = moduleUrl("fake/stable");
    registerModules({ "fake/stable": react });
    expect(moduleUrl("fake/stable")).toBe(first);
  });

  test("a genuinely different namespace gets a new URL", () => {
    registerModules({ "fake/swap": { v: 1 } });
    const first = moduleUrl("fake/swap");
    registerModules({ "fake/swap": { v: 2 } });
    expect(moduleUrl("fake/swap")).not.toBe(first);
  });
});
