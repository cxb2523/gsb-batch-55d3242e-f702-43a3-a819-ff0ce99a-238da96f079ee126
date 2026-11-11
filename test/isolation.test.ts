import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";

/**
 * Test-file hygiene, as a test.
 *
 * Bun shares one global object and one module registry across the whole run, so a file that
 * stubs `document` or leaves a transcript listener registered breaks a DIFFERENT file — which
 * is why this suite failed half of all shuffled orders while every file passed alone. The rules
 * below are what fixed it; a new file that stubs a global would silently reintroduce the flake.
 *
 * Checked by reading the sources rather than by running anything: the failure mode is a file
 * that never runs the cleanup, and nothing observes that from inside a passing test.
 */
const FILES = readdirSync(`${import.meta.dir}`).filter((name) => name.endsWith(".test.ts"));
// Comments mention these names too — a test may describe a sweep without mounting one — so
// the check reads code only.
const sourceOf = (name: string) => readFileSync(`${import.meta.dir}/${name}`, "utf8").replaceAll(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");

test("every file that stubs a shared global restores it", () => {
  const offenders = FILES.filter((name) => {
    const source = sourceOf(name);
    // Assignment to a global the other files also stub. A local `const real = globalThis.x`
    // is a capture, not a stub, so only assignment counts.
    if (!/\(globalThis as any\)\.(document|MutationObserver|requestAnimationFrame|fetch)\s*=/.test(source)) return false;
    return !source.includes("restoreGlobals");
  });
  expect(offenders).toEqual([]);
});

test("every file that mounts a transcript sweep clears leftovers first", () => {
  const offenders = FILES.filter((name) => {
    const source = sourceOf(name);
    // `claimInlineFences` and `startCanvasAutoOpen` both register into the module-level
    // listener set in `observe.ts`, and both capture state that outlives the test that made
    // it. `createCanvasAutoOpen` deliberately does not — it is the sweep without the observer.
    if (!/claimInlineFences|startCanvasAutoOpen/.test(source)) return false;
    return !source.includes("resetTranscriptObservers");
  });
  expect(offenders).toEqual([]);
});
