import { expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The extractor every eval driver uses. It had the bug `segments.ts` documents and guards against
 * — a closing `` `{3,} `` matching a triple-backtick inside the card's own body — written four
 * separate times in ad-hoc drivers before it became one script.
 */
function extract(reply: string): string[] {
  const dir = mkdtempSync(join(tmpdir(), "fences-"));
  writeFileSync(join(dir, "reply.md"), reply);
  const proc = Bun.spawnSync(["python3", "scripts/extract-fences.py", join(dir, "reply.md"), dir, "c"]);
  expect(proc.exitCode).toBe(0);
  return readdirSync(dir)
    .filter((name) => name.endsWith(".tsx"))
    .toSorted()
    .map((name) => readFileSync(join(dir, name), "utf8"));
}

test("a card containing a fenced block survives", () => {
  const body = ["const md = `", "```", "inner", "```", "`", "export default function A() { return null }"].join("\n");
  expect(extract(["````ui4a/tsx", body, "````"].join("\n"))).toEqual([body]);
});

test("a plain three-backtick fence still works", () => {
  expect(extract("```ui4a/tsx\nexport default function C() {}\n```")).toEqual(["export default function C() {}"]);
});

test("two blocks come out as two files", () => {
  expect(extract("````ui4a/tsx\nA\n````\n中间\n````ui4a/tsx\nB\n````")).toEqual(["A", "B"]);
});

test("a non-ui4a fence is not extracted", () => {
  expect(extract("```ts\nconst x = 1\n```")).toEqual([]);
});
