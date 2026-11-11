import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { normalizeGeneratedTsx } from "partial-tsx";
import { compileCard, compileSettled, initTsxFromDisk } from "../scripts/tsx-node.ts";

await initTsxFromDisk();

/**
 * `normalizeGeneratedTsx` exists to make a HALF-WRITTEN card parseable. On a card that is
 * already complete it must be a no-op.
 *
 * It once was not: on this 243-line regex tester (a rare, construct-specific shape — a `<style>`
 * block whose CSS braces the tracker read as JSX braces) it appended
 *
 *     ]</span></div></div>);})}</div></div>)}</div>)}
 *
 * and turned a card that compiles perfectly into `Expression expected at 243:1`. `partial-tsx`
 * 0.0.5 stopped doing that. The fixture stays as the regression guard — it was found by generating
 * cards rather than by reading them, and the next person to see `Expression expected` on a card
 * that looks complete should find this first.
 */
test("the fixture compiles on its own — the card is not the problem", () => {
  const src = readFileSync(`${import.meta.dir}/fixtures/over-repaired.tsx`, "utf8");
  expect(() => compileCard("raw.tsx", src)).not.toThrow();
});

/**
 * The notification this test was written to give, arrived.
 *
 * It used to pin the bug as the CURRENT behaviour — a permanently-red test would have broken
 * `bun run check` and taught everyone to read past failures, so the day upstream fixed it this
 * would fail and say so. `partial-tsx` 0.0.5 is that day: `final` mode now leaves a complete card
 * alone apart from dropping the trailing newline, and the result compiles. Asserted as the desired
 * behaviour from here on.
 */
test("normalize leaves this complete card alone", () => {
  const src = readFileSync(`${import.meta.dir}/fixtures/over-repaired.tsx`, "utf8");
  const normalized = normalizeGeneratedTsx(src, { mode: "final" });
  expect(normalized.trimEnd()).toBe(src.trimEnd());
  expect(() => compileCard("normalized.tsx", normalized)).not.toThrow();
});

test("the shared settled compiler repairs a plain generic arrow", () => {
  const src = `type Persisted = <T>(key: string, initial: T | (() => T)) => [T, (next: T) => void]
export default function C() { return <div /> }`;
  expect(() => compileSettled("generic.tsx", src)).not.toThrow();
});

/**
 * The repair's boundary, measured — and it decides which rules matter.
 *
 * `normalizeGeneratedTsx` will supply a **hook**: it inserts the whole `import … from "react"`
 * line when there is none, and extends an existing one with any hook it finds used. It will not
 * supply a JSX **component**. So:
 *
 *   - no import at all + `useState`            → repaired, renders
 *   - `import { useState }` + `useMemo(...)`   → repaired, renders
 *   - `import { useState }` + `<Fragment>`     → NOT repaired, `Fragment is not defined`, blank
 *
 * Only the third reaches a reader broken, which is why `MISSING-REACT-IMPORT` deliberately stays
 * quiet on the first two — and why *Import every name you write, `Fragment` included* is aimed
 * exactly where the repair cannot reach. Getting this wrong twice in one afternoon produced both
 * an overstated finding and a control card that did not break.
 */
test("normalize inserts a missing react import for a hook", () => {
  const src = `const T = { a: 1 };\nexport default function C() { const [n] = useState(0); return <b>{n}</b> }`;
  expect(normalizeGeneratedTsx(src, { mode: "final" })).toMatch(/^import \{[^}]*useState[^}]*\} from "react"/m);
});

test("normalize extends an existing react import with a hook", () => {
  const src = `import { useState } from "react";\nexport default function C() { const x = useMemo(() => 1, []); return <b>{x}</b> }`;
  expect(normalizeGeneratedTsx(src, { mode: "final" })).toMatch(/import \{[^}]*useMemo/);
});

test("normalize does NOT supply a JSX component", () => {
  const src = `import { useState } from "react";\nexport default function C() { return <Fragment><b/></Fragment> }`;
  expect(normalizeGeneratedTsx(src, { mode: "final" })).not.toMatch(/import \{[^}]*Fragment/);
});

/**
 * `useReducer` specifically, because auditing the screens flagged it as a hole and it is not.
 * `MISSING-REACT-IMPORT` deliberately skips every `/^use[A-Z]/` name — `normalizeGeneratedTsx`
 * extends an existing react import with any hook it finds used. Verified by rendering: a card
 * calling `useReducer` with only `useState` imported paints.
 *
 * The component names in the same list (`Fragment`, `StrictMode`, `Suspense`, `memo`,
 * `forwardRef`) are NOT repaired, which is the whole reason the screen exists.
 */
test("useReducer is repaired, so the screen is right to stay quiet", () => {
  const source = `import { useState } from "react";\nexport default function C() { const [n, d] = useReducer(r, 0); return <button onClick={() => d("i")}>{n}</button> }`;
  expect(normalizeGeneratedTsx(source, { mode: "final" })).toContain("useReducer");
  expect(/import \{[^}]*useReducer[^}]*\} from "react"/.test(normalizeGeneratedTsx(source, { mode: "final" }))).toBe(true);
});
