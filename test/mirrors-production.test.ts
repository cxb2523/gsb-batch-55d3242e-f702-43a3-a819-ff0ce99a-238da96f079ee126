import { expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";

/**
 * A checker that compiles cards differently from `compiler.ts` reports failures a reader would
 * never see, and misses ones they would. Both happened: `compile-cards.ts` had no `streaming`
 * fallback and reported a working 243-line card as FAIL; `paint-cards.ts` skipped normalization
 * altogether and so tested a path production never takes.
 *
 * `compileSettled` in `tsx-node.ts` is the shared two-step. This test exists so a third script
 * calling `compileCard` on a whole card — rather than on a deliberately-crafted snippet — has to
 * justify itself here first.
 */
const ALLOWED = new Set([
  "tsx-node.ts", // defines it
  "replay-stream.ts", // streaming frames on purpose: that IS what production does mid-stream
]);

test("no script compiles a settled card without production's normalize fallback", () => {
  const offenders = readdirSync(`${import.meta.dir}/../scripts`)
    .filter((name) => name.endsWith(".ts") && !ALLOWED.has(name))
    .filter((name) => /\bcompileCard\s*\(/.test(readFileSync(`${import.meta.dir}/../scripts/${name}`, "utf8")));
  expect(offenders).toEqual([]);
});

test("the shared path really does fall back", async () => {
  const { compileSettled, initTsxFromDisk } = await import("../scripts/tsx-node.ts");
  await initTsxFromDisk();
  // A complete card: whichever normalize mode production reaches for, it must stay compilable.
  const src = readFileSync(`${import.meta.dir}/fixtures/over-repaired.tsx`, "utf8");
  expect(() => compileSettled("x.tsx", src)).not.toThrow();
});
