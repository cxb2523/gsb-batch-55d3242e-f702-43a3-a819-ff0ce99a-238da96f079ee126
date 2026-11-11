/**
 * Which failures are retried and which reach the reader.
 *
 * Both patterns are matched against `error.message`, and the strings are the browser's, not
 * ours — so the only honest inputs are ones a browser really produced. Every string below was
 * captured from Chromium by importing a module that fails in that particular way.
 */
import { describe, expect, test } from "bun:test";
import { TRANSIENT_LOAD } from "../src/client/runtime/GenUISurface.tsx";

describe("TRANSIENT_LOAD — a dependency that did not arrive", () => {
  // The one Chromium actually produces, for a 404, an unknown package and a dead host alike.
  test("a failed dynamic import is retried", () => {
    for (const message of ["Failed to fetch dynamically imported module: https://esm.sh/recharts?target=es2022", "Failed to fetch dynamically imported module: http://127.0.0.1:47791/x.js"]) expect(TRANSIENT_LOAD.test(message)).toBe(true);
  });

  // Firefox and Safari word it differently; both were in the pattern before this test existed.
  test("the other engines' wording is covered", () => {
    expect(TRANSIENT_LOAD.test("NetworkError when attempting to fetch resource.")).toBe(true);
    expect(TRANSIENT_LOAD.test("Load failed")).toBe(true);
  });

  // **Not** retried, and correctly so: an unresolvable bare specifier means the import map has
  // no entry for it, and no amount of retrying adds one. `mergeFallbackImports` is what fixes
  // this, and it runs on the import-set change rather than on an error.
  test("an unresolvable specifier is shown, not retried", () => {
    expect(TRANSIENT_LOAD.test("Failed to resolve module specifier 'recharts'")).toBe(false);
  });

  test("a real code error is shown", () => {
    expect(TRANSIENT_LOAD.test("item.difficulty is undefined")).toBe(false);
  });
});

/**
 * `TRANSIENT` and `isUnfinishedFrame` used to live here: a message test that decided whether a
 * mid-stream failure was "merely incomplete". They are gone because the premise was wrong — a
 * frame cut mid-identifier is valid syntax and throws at module evaluation, so no message
 * distinguishes a truncated frame from a broken card. `errorAction` now answers with the phase
 * instead, and `test/error-action.test.ts` owns that rule.
 */
