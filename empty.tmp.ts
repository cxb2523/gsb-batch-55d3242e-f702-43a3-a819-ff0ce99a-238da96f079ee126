// Indexing an array by `length - 1` without a length check. Passes a `!x` guard, throws on [].
import { readdirSync } from "node:fs";
const PAT = /(\w+)\[\s*\1\.length\s*-\s*1\s*\]\s*\./;
let hits = 0;
for (const name of readdirSync("/tmp/corpuscards")) {
  const src = await Bun.file(`/tmp/corpuscards/${name}`).text();
  const m = PAT.exec(src);
  if (!m) continue;
  // guarded if a length check on the same identifier appears anywhere
  const guarded = new RegExp(`${m[1]}\\.length\\s*(===?\\s*0|>\\s*0|\\?)|!${m[1]}\\.length`).test(src);
  // An array built from a literal or a counted loop cannot be empty; one filled from outside
  // the card — bash, fs, ai, fetch — can, and that is the only case worth flagging.
  const external = new RegExp(`set${m[1][0].toUpperCase()}${m[1].slice(1)}\\b`).test(src) || /\$dsh\/(exec|fs|ai)/.test(src);
  if (!guarded && external) {
    hits++;
    console.log(`${name}: ${m[0]}`);
  }
}
console.log({ unguardedLastIndex: hits, of: readdirSync("/tmp/corpuscards").length });
