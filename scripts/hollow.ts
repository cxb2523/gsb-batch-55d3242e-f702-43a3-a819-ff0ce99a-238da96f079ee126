/**
 * Does the behaviour a rule created actually WORK, or is it just present?
 *
 * A rule that lands has a failure mode a screen cannot see: the attribute appears because the
 * rule asked for it and does nothing. A `:focus-visible` rule whose selector matches no element
 * in the card, an `AbortController` created and never aborted, an `aria-live` region rendered
 * alongside the content it announces rather than around it.
 *
 * These are 50–100× more common in post-rule cards than in the corpus, which makes them
 * effectively new constructs in that population — and new constructs are where cargo-culting
 * shows up.
 *
 *     bun scripts/hollow.ts /tmp/allfresh
 */
import { readFileSync, readdirSync } from "node:fs";

const dir = process.argv[2] ?? "/tmp/allfresh";
// Comments stripped first. A card explaining `:focus-visible` in prose is not a card applying it,
// and two reference cards do exactly that — the same mistake `TRANSITION-WITHOUT-TRANSFORM` made
// on its own negative control earlier the same day.
const cards = readdirSync(dir)
  .filter((name) => name.endsWith(".tsx"))
  .map((name) => [name, readFileSync(`${dir}/${name}`, "utf8").replaceAll(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "")] as const);

const CHECKS: [string, (source: string) => boolean | null][] = [
  // null means "the card does not use this", so it is neither correct nor hollow.
  [
    ":focus-visible selects something",
    (source) => {
      const rules = [...source.matchAll(/([^{}\n]+):focus-visible[^{]*\{/g)];
      if (rules.length === 0) return null;
      return rules.some((rule) => {
        const selector = rule[1].trim().replace(/^[^a-zA-Z.#]*/, "");
        if (/^(button|input|select|textarea|a|\*|:where|summary)/.test(selector)) return true;
        const className = /\.([\w-]+)/.exec(selector)?.[1];
        return className !== undefined && new RegExp(String.raw`["'\`][^"'\`]*\b${className}\b`).test(source);
      });
    },
  ],
  [
    "AbortController is aborted and passed",
    (source) => {
      if (!/new AbortController/.test(source)) return null;
      return /\.abort\(\)/.test(source) && /signal:\s*\w+\.signal|signal\)/.test(source);
    },
  ],
  [
    "aria-live is not inside its own conditional",
    (source) => {
      const regions = [...source.matchAll(/aria-live/g)];
      if (regions.length === 0) return null;
      // A region opened by `{x && (` announces nothing: it enters the DOM with the content.
      return regions.every((m) => !/\{\s*\w+\s*&&\s*\($|\?\s*\($/.test(source.slice(Math.max(0, m.index - 120), m.index).trimEnd()));
    },
  ],
  [
    "localStorage writes are guarded",
    (source) => {
      const writes = [...source.matchAll(/localStorage\.setItem/g)];
      if (writes.length === 0) return null;
      return writes.every((m) => /try\s*\{[^}]{0,200}$/.test(source.slice(Math.max(0, m.index - 200), m.index)));
    },
  ],
];

let hollow = 0;
for (const [label, check] of CHECKS) {
  const used = cards.map(([name, source]) => [name, check(source)] as const).filter(([, verdict]) => verdict !== null);
  const bad = used.filter(([, verdict]) => verdict === false).map(([name]) => name);
  console.log(`${label.padEnd(42)} ${used.length - bad.length}/${used.length}${bad.length > 0 ? `   ${bad.join(" ")}` : ""}`);
  hollow += bad.length;
}

console.log(hollow === 0 ? "\nnothing hollow: every use of a created behaviour does its job" : `\n${hollow} hollow use(s)`);
if (hollow > 0) process.exit(1);
