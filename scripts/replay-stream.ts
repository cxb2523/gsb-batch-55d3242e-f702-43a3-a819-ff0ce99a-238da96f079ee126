/**
 * Replays a card as streamed prefixes and reports whether any remount lands on a visible card.
 *
 * The renderer keeps state only while the hook signature holds, so a hook gained mid-stream
 * remounts the tree. Early ones are free; one after the card paints is a visible blank-and-rebuild.
 *
 * Usage: bun scripts/replay-stream.ts <card.tsx>...
 *
 * A checker that reports zero on every input is indistinguishable from one that is broken —
 * this one reported zero for months because it only ever ran on the six cards it was written
 * against, and reported 35 false positives the first time it saw real ones. So it ends by
 * running `test/cards-negative/`, where every card is *supposed* to fail, and exits non-zero
 * if any of them passes.
 */
import { statSync } from "node:fs";
import { REPLAY_CONTROLS } from "./screens.ts";
import { cardsIn, compileCard, initTsxFromDisk } from "./tsx-node.ts";
import { normalizeGeneratedTsxCompat } from "../src/client/runtime/normalize.ts";

await initTsxFromDisk();
const hooks = (s: string) => (s.match(/\buse[A-Z]\w*\s*\(/g) ?? []).length;
// "visible" means the DEFAULT export has begun returning markup — a helper component's
// `return` earlier in the file says nothing about whether the card paints yet.
const defaultPaints = (s: string) => {
  const at = s.search(/export\s+default\s+function/);
  // `return (` is not enough: an effect's cleanup is `return () => {`, and a metronome writes
  // several of those before any markup exists. Require a JSX tag right after the paren.
  return at !== -1 && /return\s*\(\s*</.test(s.slice(at));
};
// A directory or a list of files. Its siblings (`compile-cards`, `paint-cards`, `corpus-rates`)
// all take a directory, and passing one here used to fail with `EISDIR` from deep inside a read.
const expand = (path: string) => (statSync(path).isDirectory() ? cardsIn(path).map((name) => `${path}/${name}`) : [path]);
const paths = process.argv.length > 2 ? process.argv.slice(2).flatMap(expand) : expand("test/cards");
let bad = 0;
for (const path of paths) {
  const src = await Bun.file(path).text();
  const step = Math.max(100, Math.floor(src.length / 60));
  let prev = -1,
    painted = false,
    changes = 0,
    late = 0,
    frames = 0,
    broken = 0,
    unnormalizable = 0;
  for (let n = step; n <= src.length; n += step) {
    let out: string;
    // A prefix normalize cannot repair is skipped — and COUNTED. `frames=12` on a card with 60
    // prefixes reads as a short card rather than as a pass that gave up on 48 of them.
    try {
      out = normalizeGeneratedTsxCompat(src.slice(0, n), { mode: "streaming" });
    } catch {
      unnormalizable += 1;
      continue;
    }
    frames += 1;
    // A frame that fails to compile is a card that blinks out mid-generation. `transform` is a
    // tolerant parser — it rejects structural damage (unclosed tags, unterminated strings, stray
    // braces) and shrugs at odd expressions, which is the right sensitivity here since truncation
    // produces exactly the structural kind: 58 of 65 raw prefixes of a real card fail, 0 after
    // normalize.
    try {
      compileCard("f.tsx", out);
    } catch {
      broken += 1;
    }
    const h = hooks(out);
    // `painted` is the PREVIOUS frame's state, deliberately. A hook and the card's first
    // markup arriving in the same frame is not a visible remount — there was nothing on
    // screen to blank. Testing the current frame counted every card whose `useState` and
    // `return (<` land in one chunk, which is most of them: 35 of 362 real cards were
    // reported as late remounts and every one was this.
    if (prev !== -1 && h !== prev) {
      changes += 1;
      if (painted) late += 1;
    }
    prev = h;
    painted ||= defaultPaints(out);
  }
  if (late > 0 || broken > 0) bad += 1;
  console.log(`${(path.split("/").pop() ?? "").padEnd(26)} frames=${frames} hookChanges=${changes} afterDefaultPaints=${late} brokenFrames=${broken}${unnormalizable ? ` unnormalizable=${unnormalizable}` : ""}${late ? "  <-- visible remount" : ""}`);
}

// The positive control: a hook in a helper component below a long default export, so the card
// is demonstrably painting before the hook count changes. If this stops being reported, the
// detector has gone blind and every clean run above is meaningless.
// One named card, not the whole directory — `test/cards-negative/` holds a control per checker
// and the others are supposed to be clean here.
for (const name of REPLAY_CONTROLS) {
  const src = await Bun.file(`test/cards-negative/${name}`).text();
  const step = Math.max(100, Math.floor(src.length / 60));
  let prev = -1,
    painted = false,
    late = 0;
  for (let n = step; n <= src.length; n += step) {
    let out: string;
    try {
      out = normalizeGeneratedTsxCompat(src.slice(0, n), { mode: "streaming" });
    } catch {
      continue;
    }
    const h = hooks(out);
    if (prev !== -1 && h !== prev && painted) late += 1;
    prev = h;
    painted ||= defaultPaints(out);
  }
  if (late === 0) {
    console.log(`control ${name}: DETECTOR BLIND — expected a late remount, saw none`);
    bad += 1;
  } else console.log(`control ${name}: ok, ${late} late remount(s) detected`);
}

// Non-zero so `bun run check` fails when a card would blank mid-stream, or when the control does not.
if (bad > 0) process.exit(1);
