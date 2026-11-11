import { expect, test } from "bun:test";
import { normalizeGeneratedTsxCompat } from "../src/client/runtime/normalize.ts";

const source = `type Persisted = <T>(key: string, initial: T | (() => T)) => [T, (next: T) => void]
export default function C() { return <div /> }`;

for (const mode of ["final", "streaming"] as const) {
  test(`plain generic arrows use the TSX-safe spelling in ${mode} mode`, () => {
    const normalized = normalizeGeneratedTsxCompat(source, { mode });
    expect(normalized).toContain("<T,>(key: string");
    expect(normalized).not.toMatch(/<\/T>\s*$/);
  });
}

test("nested callback signatures are repaired without touching JSX", () => {
  const source = `type Handler = (run: <T>(value: T) => T) => void
export default function C() { return <T>ready</T> }`;
  const normalized = normalizeGeneratedTsxCompat(source, { mode: "final" });
  expect(normalized).toContain("<T,>(value: T) => T");
  expect(normalized).toContain("return <T>ready</T>");
  expect(normalized).not.toMatch(/ready<\/T>\s*<\/T>/);
});

test("generic arrows already using a comma or constraint are left alone", () => {
  const source = `const comma = <T,>(value: T) => value
const constrained = <T extends object>(value: T) => value
export default function C() { return <div /> }`;
  const normalized = normalizeGeneratedTsxCompat(source, { mode: "final" });
  expect(normalized).toContain("const comma = <T,>(value: T) => value");
  expect(normalized).toContain("const constrained = <T extends object>(value: T) => value");
  expect(normalized).not.toContain("</T>");
});

test("strings and comments are not rewritten", () => {
  const source = `const text = "<T>(value: T) => value"
// <T>(value: T) => value
export default function C() { return <div /> }`;
  expect(normalizeGeneratedTsxCompat(source, { mode: "final" })).toContain('"<T>(value: T) => value"');
});

test("a JSX element with the same text shape remains JSX", () => {
  const source = `const node = <T>(value) => value</T>
export default function C() { return <div>{node}</div> }`;
  const normalized = normalizeGeneratedTsxCompat(source, { mode: "final" });
  expect(normalized).toContain("const node = <T>(value) => value</T>");
  expect(normalized).not.toContain("<T,>");
});
