/**
 * The document import map.
 *
 * Generated code is imported as a blob module, and packages fetched from esm.sh arrive as
 * already-compiled JS whose `import … from "react"` survives verbatim — the browser resolves
 * those bare specifiers against the **document** import map alone. Without one, any card that
 * uses a third-party package dies on `Failed to resolve module specifier "react"`.
 *
 * It can be installed once and only before the first module resolution, so all three rules here
 * are one-shot and unrecoverable if wrong.
 */
import { restoreGlobals } from "./globals.ts";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

let head: any;
let existingMap: unknown = null;
let warnings: string[] = [];

// Restore after EACH test: the stub below is narrower than other files' (a `document` with
// no `querySelectorAll`), and bun shares one global per RUN. Leaving it installed breaks the
// next file, which looks like a bug there. `./globals.ts` holds the pre-stub originals.
afterEach(restoreGlobals);

beforeEach(() => {
  existingMap = null;
  warnings = [];
  head = {
    children: [] as any[],
    prepend(node: any) {
      this.children.unshift(node);
    },
    append(node: any) {
      this.children.push(node);
    },
  };
  (globalThis as any).document = {
    head,
    createElement: () => ({ type: "", textContent: "", setAttribute() {} }),
    querySelector: (selector: string) => (selector.includes("importmap") ? existingMap : null),
  };
  (globalThis as any).console = { ...console, warn: (message: string) => warnings.push(message) };
});

const load = async () => await import(`../src/client/runtime/register.ts?${Math.random()}`);

describe("registerRuntimeModules", () => {
  test("installs one importmap script carrying the react family", async () => {
    const { registerRuntimeModules } = await load();
    registerRuntimeModules();
    expect(head.children).toHaveLength(1);
    expect(head.children[0].type).toBe("importmap");
    const { imports } = JSON.parse(head.children[0].textContent);
    // The five the shell owns. A card importing any of them must reach the shell's instance,
    // not a second copy — two Reacts is a hooks error with no useful message.
    for (const specifier of ["react", "react/jsx-runtime", "react-dom", "react-dom/client"]) expect(imports[specifier]).toBeDefined();
  });

  // Prepended, not appended: the browser resolves against the first map it sees, and anything
  // the host adds later must not win over ours.
  test("the map goes first in head", async () => {
    const { registerRuntimeModules } = await load();
    head.children.push({ type: "something-else" });
    registerRuntimeModules();
    expect(head.children[0].type).toBe("importmap");
  });

  test("calling it twice installs one map, not two", async () => {
    const { registerRuntimeModules } = await load();
    registerRuntimeModules();
    registerRuntimeModules();
    expect(head.children).toHaveLength(1);
  });

  // A host-owned map wins: overwriting it would break whoever installed it, and a second map is
  // ignored by the browser anyway — so the honest response is a warning, not a silent no-op.
  test("a host-owned map is left alone, with a warning", async () => {
    existingMap = { type: "importmap" };
    const { registerRuntimeModules } = await load();
    registerRuntimeModules();
    expect(head.children).toHaveLength(0);
    expect(warnings[0]).toContain("already installs an import map");
  });
});
