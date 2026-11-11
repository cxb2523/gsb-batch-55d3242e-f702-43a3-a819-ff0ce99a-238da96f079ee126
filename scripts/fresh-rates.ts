/**
 * The post-rules card set, scored the same way as the corpus.
 *
 * The corpus rates are derivable (`corpus-rates.ts`) and checked against the record
 * (`audit-rates.py`). These were not: "17 of 17", then 30, then 34 — three edits in a day, each
 * one a hand-updated number in prose, and two of them briefly wrong.
 *
 * Usage: bun scripts/fresh-rates.ts [dir]   (default: the generated cards under /tmp)
 */
import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { SCREENS } from "./screens.ts";
import { cardsIn } from "./tsx-node.ts";

const dir = process.argv[2] ?? "/tmp/allfresh";
if (!existsSync(dir)) {
  console.log(`no generated cards at ${dir} — see test/eval-fixtures.md for the prompts`);
  process.exit(0);
}

const cards = cardsIn(dir);
let clean = 0,
  ring = 0;
const flagged = new Map<string, string[]>();
for (const name of cards) {
  const src = readFileSync(`${dir}/${name}`, "utf8");
  const hits = Object.entries(SCREENS)
    .filter(([, fires]) => fires(src))
    .map(([screen]) => screen);
  if (hits.length === 0) clean += 1;
  else for (const hit of hits) (flagged.get(hit) ?? flagged.set(hit, []).get(hit)!).push(name);
  if (/:focus-visible/.test(src)) ring += 1;
}

console.log(`${clean} of ${cards.length} clean under all ${Object.keys(SCREENS).length} screens`);
// A screen added after a card was written flags it retroactively, and reporting only the current
// number makes a streak look broken by cards that were clean when generated. `UNANNOUNCED-ASYNC-
// RESULT` did exactly this: 60 of 60 became 45 of 60 the moment it landed. Both numbers are true;
// printing only one of them is what misleads.
const retro = [...flagged].filter(([, names]) => names.length >= cards.length / 5);
if (retro.length > 0) console.log(`  (${retro.map(([screen, names]) => `${screen} flags ${names.length}, most of them written before it existed`).join("; ")})`);
console.log(`${ring} of ${cards.length} use :focus-visible (${Math.round((ring / cards.length) * 100)}%)`);

// How many INDEPENDENT accessibility signals each card carries. The single sharpest number in the
// record — no corpus card in 378 has three, and most fresh cards do — and it came from a throwaway
// script that could not be re-run when the set grew. Derived here so the claim stays checkable.
const SIGNALS = [/:focus-visible/, /aria-label/, /prefers-reduced-motion/, /role="/];
const histogram = new Map<number, number>();
for (const name of cards) {
  const src = readFileSync(`${dir}/${name}`, "utf8");
  const n = SIGNALS.filter((re) => re.test(src)).length;
  histogram.set(n, (histogram.get(n) ?? 0) + 1);
}
const three = (histogram.get(3) ?? 0) + (histogram.get(4) ?? 0);
console.log(`${three} of ${cards.length} carry three or more accessibility signals (${[0, 1, 2, 3, 4].map((n) => `${n}→${histogram.get(n) ?? 0}`).join(" ")})`);
for (const [screen, names] of [...flagged].toSorted()) console.log(`  ${screen}: ${names.join(" ")}`);
