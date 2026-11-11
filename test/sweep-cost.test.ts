/**
 * The sweep's per-frame cost.
 *
 * `collectCanvases` walks every argument string by hand — that is what makes it correct on a
 * half-arrived JSON prefix, and it costs ~0.16ms per canvas. The sweep runs on **every
 * transcript mutation**, so before the calls key was added, the corpus's busiest session (34
 * canvas writes) spent 3.7ms per streamed token re-deriving a result that had not changed.
 *
 * A timing assertion is a blunt instrument, so this one is deliberately loose: it asserts the
 * cheap path is an order of magnitude cheaper than the walk, which is a property of the
 * algorithm rather than of the machine. Measured 3.725ms against 0.014ms — 265×.
 */
import { expect, test } from "bun:test";
import { callsKeyOf } from "../src/client/canvas/auto-open.ts";
import { collectCanvases, type ToolCallView } from "../src/client/canvas/collect.ts";

const code = await Bun.file("test/cards/2048.ui4a.tsx").text();
const calls: ToolCallView[] = Array.from({ length: 34 }, (_, i) => ({
  name: "write",
  argsRaw: JSON.stringify({ file_path: `/w/.dsh/ui4a/canvases/c${i}.ui4a.tsx`, content: code }),
  settled: true,
}));

// The production key, not a copy of it: a test that re-implements the thing it measures only
// proves a re-implementation agrees with itself (§6.5).

/*
 * The BEST of several batches, not the mean of one — and few enough iterations that the whole
 * test stays well inside the default 5s timeout.
 *
 * A mean measures the machine as much as the code: on a loaded box the scheduler can preempt
 * either batch, and whichever it preempts decides the ratio. The minimum is the run that was not
 * interrupted, which is the one that says something about the algorithm — the property under test
 * is a 265x gap, so a sample anywhere near the truth passes easily.
 *
 * The iteration count is part of the fix, not an accident. The first version of this repair took
 * the best of five batches of forty and made the test FIVE TIMES SLOWER, so it started failing on
 * the 5s timeout instead of on the assertion — a "fix" whose failures looked identical to the bug
 * it replaced. The walk is ~0.16ms per canvas over 34 canvases, so 3 x 8 is ~130ms of real work.
 */
const msPerCall = (run: () => void) => {
  for (let i = 0; i < 3; i++) run();
  let best = Infinity;
  for (let batch = 0; batch < 3; batch++) {
    const start = performance.now();
    for (let i = 0; i < 8; i++) run();
    best = Math.min(best, (performance.now() - start) / 8);
  }
  return best;
};

test("the cheap key is an order of magnitude cheaper than the walk", () => {
  const walk = msPerCall(() => collectCanvases(calls));
  const key = msPerCall(() => callsKeyOf(calls));
  expect(key * 10).toBeLessThan(walk);
});

// The key has to MOVE when a streamed argument grows, or the sweep stops opening mid-write —
// which would be a far worse bug than the cost it avoids.
test("a growing argument changes the key", () => {
  const growing = [{ name: "write", argsRaw: '{"file_path":"/w/.dsh/ui4a/canvases/a.ui4a.tsx","content":"exp', settled: false }];
  const before = callsKeyOf(growing);
  growing[0]!.argsRaw += "ort default";
  expect(callsKeyOf(growing)).not.toBe(before);
  // ...and when a call settles, since `complete` flips with no byte added.
  const settling = [{ ...growing[0]!, settled: false }];
  const unsettled = callsKeyOf(settling);
  settling[0]!.settled = true;
  expect(callsKeyOf(settling)).not.toBe(unsettled);
});
