import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";

/** `CLAUDE.md` and the `docs/` files that hold its evidence, minus the two raw records. */
const DESIGN_DOC = [
  "CLAUDE.md",
  ...readdirSync("docs")
    .filter((f) => f.endsWith(".md") && f !== "measurements-log.md" && f !== "examples.md")
    .map((f) => `docs/${f}`),
].toSorted();
const doc = DESIGN_DOC.map((p) => readFileSync(p, "utf8")).join("\n");

/**
 * CLAUDE.md calls itself the design doc — "where they disagree, this file wins and the drift is a
 * bug" — so a script nobody has written down is drift in the direction the file claims to control.
 * A tool that exists and is undiscoverable gets rebuilt: this session rebuilt `smoke.ts` from
 * scratch without noticing it existed, and the cost was an hour.
 *
 * Matched on the basename, not the whole filename. The record cites most scripts as
 * `bun run cross-tab` or `scripts/flaky-dep-server.py` rather than by bare filename, and a strict
 * match reports eight files that are all documented — a check that fires on correct prose is one
 * people learn to ignore.
 */
test("every script is named in the design doc", () => {
  const stem = (name: string) => name.replace(/\.(ts|sh|py|mjs|md|html)$/, "");
  // Files only. Introducing an importable `wave_root.py` made Python write a `scripts/__pycache__/`
  // directory, and this asked CLAUDE.md to document it — a build artefact reported as an
  // undocumented script, which is a true statement about nothing.
  // Anchored to the forms the record actually uses. `doc.includes(stem(name))` — the first version —
  // passes for the wrong reason: `site` sits inside "call site" and "opposite", so `site.ts` could be
  // added and never written down while this stayed green. A gate that cannot fail on the thing it
  // measures is worse than no gate, because its green is quoted as evidence.
  const recorded = (name: string) => doc.includes(`scripts/${name}`) || doc.includes(name) || doc.includes(`bun run ${stem(name)}`);
  const missing = readdirSync("scripts", { withFileTypes: true })
    .filter((e) => e.isFile() && !recorded(e.name))
    .map((e) => e.name);
  expect(missing).toEqual([]);
});
