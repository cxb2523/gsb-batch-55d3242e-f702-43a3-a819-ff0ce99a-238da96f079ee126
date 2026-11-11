/**
 * The mutator behind `scripts/mutation-audit.sh`.
 *
 * It has now silently mis-audited the whole tree three times: a regex that could not match
 * parens turned 27 conditions into syntax errors, and a "skip prose" guard anchored at `^`
 * skipped every *indented* statement — which is nearly all of them, and made 118 covered
 * conditions report as unconstrained. Both failures look identical to a clean audit from the
 * outside, so the mutator is checked here rather than trusted.
 *
 * Each test spawns `bun` twice, so the default 5s timeout is a measurement of how loaded the
 * machine is, not of the mutator. One shuffled order failed here while six model evals were
 * running — an order-dependent failure that was nothing to do with order.
 */
import { expect, test } from "bun:test";

const invert = async (line: string) => {
  const file = `/tmp/invert-ifs-${Math.random().toString(36).slice(2)}.ts`;
  await Bun.write(file, line);
  await Bun.$`bun ${import.meta.dir}/../scripts/invert-ifs.mjs ${file}`.quiet();
  return (await Bun.file(file).text()).replace(/\n$/, "");
};

test("an indented statement is mutated", async () => {
  expect(await invert('    if (host === null) throw new Error("no host");')).toBe('    if (!(host === null)) throw new Error("no host");');
}, 30_000);

// A regex stops at the first `)`; the parens have to be counted.
test("a condition containing a call keeps its own parens", async () => {
  expect(await invert("if (!DRAWS.has(tag) && !tag.includes('-')) continue;")).toBe("if (!(!DRAWS.has(tag) && !tag.includes('-'))) continue;");
}, 30_000);

test("an else-if is a branch and is mutated", async () => {
  expect(await invert('  else if (chunk.type === "finish") write();')).toBe('  else if (!(chunk.type === "finish")) write();');
}, 30_000);

// `skill.ts` documents the AbortError check inside its prompt template. Prose is not a branch.
test("an if inside a string is left alone", async () => {
  const prose = 'one rejection is not a failure — `if (error.name === "AbortError") return;` before';
  expect(await invert(prose)).toBe(prose);
}, 30_000);

/**
 * A fenced code block inside a template literal is an example, not a branch.
 *
 * `skill.ts` teaches cards to abort a stale request, and its `if (error.name === "AbortError")`
 * is a rule being shown — mutating it changes nothing any test could see, so the audit reported
 * three "uncovered conditions" that are documentation. Indentation cannot tell them apart: the
 * examples are indented exactly like real statements.
 */
const invertFile = async (source: string) => {
  const file = `/tmp/invert-ifs-${Math.random().toString(36).slice(2)}.ts`;
  await Bun.write(file, source);
  await Bun.$`bun ${import.meta.dir}/../scripts/invert-ifs.mjs ${file}`.quiet();
  return await Bun.file(file).text();
};

test("an if inside a fenced example is left alone", async () => {
  const source = ["export const doc = `", "```tsx", '  if (error.name === "AbortError") return;', "```", "`;", '  if (host === null) throw new Error("real");'].join("\n");
  const out = await invertFile(source);
  expect(out).toContain('  if (error.name === "AbortError") return;');
  expect(out).toContain('  if (!(host === null)) throw new Error("real");');
}, 30_000);
