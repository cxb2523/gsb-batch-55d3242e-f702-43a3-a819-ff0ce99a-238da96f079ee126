/**
 * The shared transcript observer.
 *
 * The coalescing is the load-bearing part: a streaming reply mutates the transcript dozens of
 * times per second and one sweep per mutation is how a renderer melts the main thread. That is
 * an invariant about *counts*, which is exactly what a test can hold and a comment cannot.
 *
 * No DOM here, so `MutationObserver`, `document` and the frame callbacks are stubbed. That is
 * enough because the module's own logic — coalesce, start once, tear down at zero — never
 * touches anything else about them.
 */
import { restoreGlobals } from "./globals.ts";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

let pending: (() => void)[] = [];
let observing = 0,
  disconnected = 0,
  cancelled = 0;
let mutate: () => void = () => {};

// Restore after EACH test: the stub below is narrower than other files' (a `document` with
// no `querySelectorAll`), and bun shares one global per RUN. Leaving it installed breaks the
// next file, which looks like a bug there. `./globals.ts` holds the pre-stub originals.
afterEach(restoreGlobals);

beforeEach(() => {
  pending = [];
  observing = 0;
  disconnected = 0;
  cancelled = 0;
  (globalThis as any).requestAnimationFrame = (cb: () => void) => {
    pending.push(cb);
    return pending.length;
  };
  (globalThis as any).cancelAnimationFrame = (id: number) => {
    pending[id - 1] = () => {
      cancelled += 1;
    };
  };
  (globalThis as any).document = { body: {} };
  (globalThis as any).MutationObserver = class {
    constructor(private readonly cb: () => void) {
      mutate = () => this.cb();
    }
    observe() {
      observing += 1;
    }
    disconnect() {
      disconnected += 1;
    }
  };
});

/** Runs whatever frames are queued, the way the browser would before painting. */
const paint = () => {
  const due = pending;
  pending = [];
  for (const cb of due) cb();
};

const load = async () => await import(`../src/client/runtime/observe.ts?${Math.random()}`);

describe("observeTranscript", () => {
  test("many mutations in one frame produce one sweep", async () => {
    const { observeTranscript } = await load();
    let sweeps = 0;
    observeTranscript(() => {
      sweeps += 1;
    });
    paint(); // the immediate sweep on subscribe
    for (let i = 0; i < 50; i++) mutate();
    paint();
    expect(sweeps).toBe(2);
  });

  test("a second listener does not start a second observer", async () => {
    const { observeTranscript } = await load();
    observeTranscript(() => {});
    observeTranscript(() => {});
    expect(observing).toBe(1);
  });

  test("the observer is torn down only when the last listener leaves", async () => {
    const { observeTranscript } = await load();
    const a = observeTranscript(() => {});
    const b = observeTranscript(() => {});
    a();
    expect(disconnected).toBe(0);
    b();
    expect(disconnected).toBe(1);
  });

  test("scheduleSweep drives a listener with no DOM change at all", async () => {
    const { observeTranscript, scheduleSweep } = await load();
    let sweeps = 0;
    observeTranscript(() => {
      sweeps += 1;
    });
    paint();
    scheduleSweep();
    paint();
    expect(sweeps).toBe(2);
  });

  /**
   * A sweep queued for a frame that has not arrived yet must not run after teardown.
   *
   * The listener set is already empty by then, so `flush` iterating it is harmless — which is
   * why deleting the cancel changes nothing any other test can see. What it leaks is the frame
   * itself: a card unmounted mid-stream leaves a callback holding the module alive until the
   * browser gets round to it.
   */
  test("a frame queued before the last listener left is cancelled", async () => {
    const { observeTranscript } = await load();
    let sweeps = 0;
    const stop = observeTranscript(() => {
      sweeps += 1;
    });
    stop();
    paint();
    expect(cancelled).toBe(1);
    expect(sweeps).toBe(0);
  });
});
