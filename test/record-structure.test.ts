import { expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";

/**
 * `CLAUDE.md` is the design doc, and it once grew to 8,983 lines because every measurement was
 * appended as its own dated section — 295 of them, 99% of the file, with the design doc itself
 * buried in the first 10%. The raw record moved to `docs/measurements-log.md` and §6 keeps each
 * lesson once.
 *
 * So the check is now a ceiling rather than a floor: dated sections are for the handful of
 * historical notes inside the design text, and a file drifting back toward a log will trip this
 * long before anyone notices by reading. Order and uniqueness still matter for the ones that
 * remain — an edit anchored on a phrase that is not unique drops a section into the middle of
 * another and splits an argument in half, which is exactly what reading is worst at catching.
 */
const DESIGN_DOC = [
  "CLAUDE.md",
  ...readdirSync(`${import.meta.dir}/../docs`)
    .filter((f) => f.endsWith(".md") && f !== "measurements-log.md" && f !== "examples.md")
    .map((f) => `docs/${f}`),
].toSorted();
const record = DESIGN_DOC.map((p) => readFileSync(`${import.meta.dir}/../${p}`, "utf8")).join("\n");
const sections = [...record.matchAll(/^### (.*?) \((\d{4}-\d{2}-\d{2})\)$/gm)].map((m) => ({ title: m[1], date: m[2] }));

test("the record has not drifted back into a log", () => {
  // 15 at the rewrite. The bound is loose on purpose — it is here to catch a return to
  // append-a-section-per-session, not to police adding a historical note.
  expect(sections.length).toBeLessThan(40);
});

test("dated sections are in date order", () => {
  const wrong = sections.filter((s, i) => i > 0 && s.date < sections[i - 1].date).map((s) => `${s.date} ${s.title}`);
  expect(wrong).toEqual([]);
});

test("no section title appears twice", () => {
  const seen = new Map<string, number>();
  for (const { title, date } of sections) seen.set(`${title} (${date})`, (seen.get(`${title} (${date})`) ?? 0) + 1);
  expect([...seen].filter(([, n]) => n > 1).map(([k]) => k)).toEqual([]);
});

/**
 * Every repo path the record names should exist, or the reader goes looking for a file that was
 * deleted a week ago. Two were dangling when this was written: one already flagged in-line as
 * fictional, one a historical account of a script since removed.
 *
 * Paths inside a *historical* passage are legitimate — the fix is a note saying so, not deleting
 * the story — so a line may opt out by saying the file is gone.
 */
const paths = [...record.matchAll(/`((?:scripts|test|src)\/[\w./-]+\.(?:ts|tsx|sh|py|mjs|md|json))`/g)];

test("every repo path the record names exists", () => {
  const missing = new Set<string>();
  for (const match of paths) {
    const path = match[1];
    if (existsSync(`${import.meta.dir}/../${path}`)) continue;
    // The paragraph around it may explain that the file is gone, or that it belongs to another
    // repository — `obsidian-ui4a-renderer`'s `src/styling.ts` is named as a reference, not as
    // something here.
    const around = record.slice(Math.max(0, match.index - 900), match.index + 900);
    if (/does not exist|is gone|since removed|was removed|no longer exists|deleted/.test(around)) continue;
    const line = record.slice(record.lastIndexOf("\n", match.index) + 1, record.indexOf("\n", match.index));
    if (/`[\w-]+\/[\w-]+`'s|from [\w-]+\/[\w-]+|upstream|another repo/.test(line)) continue;
    missing.add(path);
  }
  expect([...missing]).toEqual([]);
});
