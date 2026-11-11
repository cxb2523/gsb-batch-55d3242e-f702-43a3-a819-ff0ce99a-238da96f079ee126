import { expect, test } from "bun:test";
import { SCREENS } from "../scripts/screens.ts";

// `compile-cards.ts` used to screen a card only when it compiled, so a card that failed to
// parse reported its compile error and nothing else — hiding any screen hit behind it, and
// making its counts disagree with `corpus-rates.ts`, which screens every card unconditionally.
// This is the property that keeps the two agreeing: a screen is a text predicate, so whether
// it fires cannot depend on the card being parseable.
test("a screen fires on a card that does not compile", () => {
  const broken = `export default function C() {
  return <button style={{ outline: "none", fontSize: 11px }}>x</button>;
}`;
  expect(SCREENS["NO-FOCUS-RING"](broken)).toBe(true);
});

// The predicate being text-only is necessary but not sufficient — the bug was in the *caller*,
// which computed the flags inside the try block. This is the line that regressing would break.
test("compile-cards screens before it tries to compile", async () => {
  const source = await Bun.file(`${import.meta.dir}/../scripts/compile-cards.ts`).text();
  // Match on tokens rather than on formatting: the first version anchored on `"\n  try {"`,
  // which stopped matching the day `bun run fmt` reflowed the file — a green-to-red flip with no
  // behaviour change behind it.
  const screenAt = source.indexOf("Object.entries(SCREENS)");
  const tryAt = source.search(/\btry\s*\{/);
  expect(screenAt).toBeGreaterThan(-1);
  expect(tryAt).toBeGreaterThan(-1);
  expect(screenAt).toBeLessThan(tryAt);
});
