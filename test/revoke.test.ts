import { expect, test } from "bun:test";
import { needsResolve, revokeAll } from "../src/client/canvas/subpages.ts";

/**
 * Blob URLs for a canvas's sibling modules. Two paths revoke the same array — the effect's
 * disposer, and a resolve that lands after teardown — and `inlineSubPages` keeps appending to
 * that array while the pass runs, so the two can see different contents.
 *
 * Revoking one twice is harmless. Never revoking one leaks a blob per edit, which is what the
 * comment in `CanvasPanel` is about.
 */
const withStubbedRevoke = (run: (revoked: string[]) => void) => {
  const revoked: string[] = [];
  const real = globalThis.URL.revokeObjectURL;
  globalThis.URL.revokeObjectURL = (url: string) => void revoked.push(url);
  try {
    run(revoked);
  } finally {
    globalThis.URL.revokeObjectURL = real;
  }
};

test("every url is revoked", () => {
  withStubbedRevoke((revoked) => {
    revokeAll(["blob:a", "blob:b", "blob:c"]);
    expect(revoked.toSorted()).toEqual(["blob:a", "blob:b", "blob:c"]);
  });
});

test("running it twice on the same array does not revoke anything twice", () => {
  withStubbedRevoke((revoked) => {
    const urls = ["blob:a", "blob:b"];
    revokeAll(urls);
    revokeAll(urls); // the late resolve, after the disposer already ran
    expect(revoked).toEqual(["blob:b", "blob:a"]);
    expect(urls).toEqual([]);
  });
});

/**
 * The ordering that actually leaks: the pass appends a url AFTER the disposer ran. The second
 * call must catch it — this is why both paths share one array rather than a copy.
 */
test("a url appended after the first pass is still revoked by the second", () => {
  withStubbedRevoke((revoked) => {
    const urls = ["blob:a"];
    revokeAll(urls);
    urls.push("blob:late");
    revokeAll(urls);
    expect(revoked).toEqual(["blob:a", "blob:late"]);
  });
});

test("an empty list is not an error", () => {
  withStubbedRevoke((revoked) => {
    revokeAll([]);
    expect(revoked).toEqual([]);
  });
});

/**
 * The two conditions deciding whether a canvas gets the sub-page pass. Both were unconstrained
 * inside the effect: flipping either survived the whole suite.
 */
test("a streaming canvas is not resolved — the next frame supersedes any prefix", () => {
  expect(needsResolve(`import Row from "./row.tsx";`, true)).toBe(false);
  expect(needsResolve(`import Row from "./row.tsx";`, false)).toBe(true);
});

test("a canvas with no sibling import has nothing to inline", () => {
  expect(needsResolve(`import { useState } from "react";`, false)).toBe(false);
  expect(needsResolve(`import Row from "./row.tsx";`, undefined)).toBe(true);
});
