/**
 * A screen must not accuse a card of something it has not written yet.
 *
 * The screens run on settled cards today, but the obvious next use is warning while the model
 * is still typing — and a screen that fires on a prefix and clears when the card finishes would
 * report a card that is fine. Measured over every 10% prefix of all 378 corpus cards: exactly
 * one screen does that, and it is inherent rather than a defect (see below).
 *
 * Kept as a property rather than a plan: it costs one test and it is the kind of thing that
 * quietly stops being true when a screen is widened.
 */
import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { SCREENS } from "../scripts/screens.ts";

const CARDS = ["test/cards/2048.ui4a.tsx", "test/cards/metro.ui4a.tsx", "test/cards/piano.ui4a.tsx", "test/cards/near-misses.ui4a.tsx"];

/**
 * Two exceptions, and neither can be otherwise: in both, the **guard follows the defect in the
 * text**, so a prefix cut between them shows the defect alone.
 *
 * - `NO-FOCUS-RING` fires on `outline: "none"` and clears when the replacement appears.
 * - `UNGUARDED-NUMBER-INPUT` fires on `Number(e.target.value)` and clears on the `|| 0` after
 *   it — measured against the corpus, `01bf50a29bde` is cut mid-guard at 70%.
 * - `UNSTOPPABLE-MOTION` fires on `@keyframes` and clears on the `@media (prefers-reduced-motion)`
 *   block, which by convention comes last in a `<style>`.
 *
 * - `TRANSITION-WITHOUT-TRANSFORM` fires on `transition: "transform …"` and clears when the
 *   `transform` property itself appears — which in a style object is the very next line.
 *
 * - `UNANNOUNCED-ASYNC-RESULT` fires on the fetch and clears on the `aria-live` container the
 *   results land in — which is in the JSX, written after every hook and handler.
 *
 * - `SWALLOWED-CAPABILITY-FAILURE` fires on the `try`/`catch` and clears on the `setError` inside
 *   it — written a line or two later, and the JSX that renders it later still.
 *
 * All six are the same shape, which is worth stating: the fix is written AFTER the thing it
 * fixes, so any cut between them shows the defect alone. That is a property of how CSS and
 * JavaScript are written, not a flaw in these predicates. The fourth, fifth and sixth were all
 * predicted here before they existed — a seventh is expected rather than investigated.
 *
 * The rest have no such ordering. This is the property that would let the screens run WHILE the
 * model types, so knowing which two cannot is the useful part.
 */
const PREFIX_UNSAFE = new Set(["NO-FOCUS-RING", "UNGUARDED-NUMBER-INPUT", "UNSTOPPABLE-MOTION", "TRANSITION-WITHOUT-TRANSFORM", "UNANNOUNCED-ASYNC-RESULT", "SWALLOWED-CAPABILITY-FAILURE"]);

/**
 * The four reference cards cannot exercise every screen — none of them has a `type="number"`
 * field, so `UNGUARDED-NUMBER-INPUT` was on the exception list above on the strength of a corpus
 * run this test could not see. When the corpus IS extracted, check against it too, and require
 * every named exception to actually be one: an exception nobody can reproduce is a screen that
 * quietly stopped being checked.
 */
const corpus = (() => {
  try {
    return readdirSync("/tmp/corpuscards")
      .filter((n) => n.endsWith(".tsx"))
      .map((n) => `/tmp/corpuscards/${n}`);
  } catch {
    return [];
  }
})();

test("no screen accuses a card of something it has not finished writing", () => {
  const offenders = new Set<string>();
  for (const path of [...CARDS, ...corpus]) {
    const src = readFileSync(path, "utf8");
    const settled = new Set(
      Object.entries(SCREENS)
        .filter(([, fires]) => fires(src))
        .map(([name]) => name),
    );
    for (let pct = 10; pct < 100; pct += 10) {
      const prefix = src.slice(0, Math.floor((src.length * pct) / 100));
      for (const [name, fires] of Object.entries(SCREENS)) {
        if (fires(prefix) && !settled.has(name) && !PREFIX_UNSAFE.has(name)) offenders.add(`${name} on ${path} at ${pct}%`);
      }
    }
  }
  expect([...offenders]).toEqual([]);
});

test("every screen named prefix-unsafe really is, when the corpus is there to prove it", () => {
  if (corpus.length === 0) return; // nothing to prove it with; the check above still ran
  const proven = new Set<string>();
  for (const path of corpus) {
    const src = readFileSync(path, "utf8");
    const settled = new Set(
      Object.entries(SCREENS)
        .filter(([, fires]) => fires(src))
        .map(([name]) => name),
    );
    for (let pct = 10; pct < 100; pct += 10) {
      const prefix = src.slice(0, Math.floor((src.length * pct) / 100));
      for (const name of PREFIX_UNSAFE) if (SCREENS[name](prefix) && !settled.has(name)) proven.add(name);
    }
  }
  expect([...PREFIX_UNSAFE].filter((name) => !proven.has(name))).toEqual([]);
});
