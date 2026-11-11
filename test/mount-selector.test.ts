import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

/**
 * `mount-card.sh` reports the accessibility state of a card's controls, and several conclusions in
 * the record rest on it — that the old metronome exposed nothing (`"states": []`) while looking
 * correct on screen, and that the regenerated one exposes `4/4=false` / `木鱼=checked`.
 *
 * A selector that missed an attribute would report an empty list for a card doing it RIGHT, which
 * is the direction that gets written up: it looks like a defect. So the selector is pinned here
 * against the markup a card actually writes, rather than trusted because a run produced a
 * plausible-looking list.
 */
const selector = (() => {
  const script = readFileSync("scripts/mount-card.sh", "utf8");
  // The one line the report is built from. Pinned by shape, so an edit to the surrounding JS is
  // free and an edit to WHAT IS QUERIED fails here.
  const match = /querySelectorAll\("(\[aria-pressed\][^"]*)"\)/.exec(script);
  expect(match).not.toBeNull();
  return match![1];
})();

test("it asks for every attribute a selected control uses", () => {
  // Each of these is the conventional spelling for one widget: a toggle, a tab, a radio, a
  // headless-ui control, and a native checkbox. Missing any one reports a correct card as silent.
  for (const attr of ["[aria-pressed]", "[aria-selected]", "[aria-checked]", "[data-state]", ":checked"]) {
    expect(selector).toContain(attr);
  }
});

test("the report reads the state, not merely the presence", () => {
  const script = readFileSync("scripts/mount-card.sh", "utf8");
  // `["4/4=false", "木鱼=checked"]` — a list of names with no values would make a card that
  // announces `false` for every option indistinguishable from one that announces correctly.
  expect(script).toMatch(/getAttribute\("aria-pressed"\)|aria-selected|aria-checked/);
  expect(script).toContain("checked");
});

/**
 * The other half of the same guard. `localStorage.clear()` runs before the mount because the
 * PREVIOUS card's keys are what make this one look wrong — a tracker showing another card's rows.
 */
test("storage is cleared before the card mounts", () => {
  const script = readFileSync("scripts/mount-card.sh", "utf8");
  // Comments stripped first: a `// localStorage.clear()` still contains the string, and the check
  // passed on a script where the call had been commented out.
  const live = script.replaceAll(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
  const clear = live.indexOf("localStorage.clear()");
  const render = live.indexOf("createRoot");
  expect(clear).toBeGreaterThan(-1);
  expect(render).toBeGreaterThan(-1);
  expect(clear).toBeLessThan(render);
});
