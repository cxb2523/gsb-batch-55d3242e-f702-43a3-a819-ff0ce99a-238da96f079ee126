/**
 * Do the screens still contain the renderer?
 *
 * The number that matters is the third row: a card that renders nothing and fires no screen is a
 * defect nobody predicted, and the only honest way to find out a screen set has a hole. It was 0
 * of 378 on 2026-08-23 and any other value is news.
 *
 * Not part of `bun run check` — it needs a corpus, which is not in the repo. Point it at one:
 *
 *     bun scripts/cross-tab.ts /tmp/corpuscards
 */
import { readFileSync, readdirSync } from "node:fs";
import { SCREENS } from "./screens.ts";

const dir = process.argv[2];
if (dir === undefined) {
  console.log("cross-tab: pass a directory of cards");
  process.exit(0);
}

// The paint check owns the rendering; this reads its report rather than re-implementing it, so
// the two can never disagree about what "renders nothing" means.
const report = await new Response(Bun.spawn(["bun", `${import.meta.dir}/paint-cards.ts`, dir]).stdout).text();
const broken = new Set([...report.matchAll(/^(\S+\.tsx)\s+(?:THREW|BLANK)/gm)].map((m) => m[1]));

const counts = { both: 0, screenOnly: 0, paintOnly: 0, neither: 0 };
const unpredicted: string[] = [];
for (const name of readdirSync(dir).filter((n) => n.endsWith(".tsx"))) {
  const fires = Object.values(SCREENS).some((screen) => screen(readFileSync(`${dir}/${name}`, "utf8")));
  const dead = broken.has(name);
  if (fires && dead) counts.both += 1;
  else if (fires) counts.screenOnly += 1;
  else if (dead) {
    counts.paintOnly += 1;
    unpredicted.push(name);
  } else counts.neither += 1;
}

console.log(`screens fire + paints nothing : ${counts.both}`);
console.log(`screens fire + paints fine    : ${counts.screenOnly}   (what the renderer cannot see)`);
console.log(`silent + paints nothing       : ${counts.paintOnly}   (what the screens cannot see)`);
console.log(`clean both ways               : ${counts.neither}`);
if (unpredicted.length > 0) {
  console.log(`\nunpredicted: ${unpredicted.join(", ")}`);
  process.exit(1);
}
console.log("\nthe screens contain the renderer: nothing broke unpredicted");
