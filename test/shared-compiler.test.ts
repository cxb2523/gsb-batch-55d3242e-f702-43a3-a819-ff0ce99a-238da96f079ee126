import { expect, test } from "bun:test";
import { compiler, dropSharedCompiler } from "../src/client/runtime/GenUISurface.tsx";

/**
 * One compiler instance for every surface on the page — a second would mean a second wasm module,
 * megabytes each, and the whole point of `disposeCompiler` is that the shell can drop it on HMR.
 *
 * `dropSharedCompiler` is the paired half: without it the next `compiler()` would hand back an
 * instance whose wasm has already been torn down. Both were unconstrained.
 */
test("compiler() returns the same instance every time", () => {
  dropSharedCompiler();
  const first = compiler();
  expect(compiler()).toBe(first);
  expect(compiler()).toBe(first);
});

test("dropSharedCompiler forces the next call to build a new one", () => {
  const first = compiler();
  dropSharedCompiler();
  expect(compiler()).not.toBe(first);
});

test("dropping twice is not an error", () => {
  dropSharedCompiler();
  expect(() => dropSharedCompiler()).not.toThrow();
  expect(compiler()).toBeDefined();
});
