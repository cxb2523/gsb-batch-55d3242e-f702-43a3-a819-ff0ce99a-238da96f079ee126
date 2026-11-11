import assert from "node:assert/strict";
import { test } from "node:test";
import { importTs } from "./support/load-ts.mjs";

const { MetronomeEngine } = await importTs("lib/audio/metronome-engine.ts");

const EPSILON = 1e-9;

function assertTime(actual, expected, message) {
  assert.ok(
    Math.abs(actual - expected) < 1e-6,
    `${message}: expected ${expected}s, got ${actual}s`,
  );
}

// A controllable audio clock plus timer wheel. `audioNow` is in seconds, the
// timers fire in milliseconds; `advance` moves both together so the engine's
// lookahead loop behaves exactly as it would under a real interval.
function createHarness({ initialBpm = 90, initialBeatsPerBar = 4 } = {}) {
  let nowMs = 0;
  let nextId = 1;
  const timers = new Map();

  const api = {
    setInterval(callback, ms) {
      const id = nextId++;
      timers.set(id, { id, due: nowMs + ms, every: ms, callback });
      return id;
    },
    clearInterval(id) {
      timers.delete(id);
    },
    setTimeout(callback, ms) {
      const id = nextId++;
      timers.set(id, { id, due: nowMs + ms, every: null, callback });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
  };

  const clicks = [];
  const beats = [];

  const engine = new MetronomeEngine(
    {
      ...api,
      audioNow: () => nowMs / 1000,
      scheduleClick: (click) => clicks.push({ ...click }),
      onBeat: (beatIndex, beatsPerBar) =>
        beats.push({ beatIndex, beatsPerBar, at: nowMs / 1000 }),
    },
    { initialBpm, initialBeatsPerBar },
  );

  function advance(ms) {
    const target = nowMs + ms;
    while (true) {
      let earliest = null;
      for (const timer of timers.values()) {
        if (timer.due > target) continue;
        if (
          earliest === null ||
          timer.due < earliest.due ||
          (timer.due === earliest.due && timer.id < earliest.id)
        ) {
          earliest = timer;
        }
      }
      if (earliest === null) break;

      nowMs = earliest.due;
      if (earliest.every === null) {
        timers.delete(earliest.id);
      } else {
        earliest.due = nowMs + earliest.every;
      }
      earliest.callback();
    }
    nowMs = target;
  }

  return {
    engine,
    clicks,
    beats,
    advance,
    now: () => nowMs / 1000,
  };
}

test("BPM 90 -> 120 retimes new beats to 60/120 while keeping queued clicks", () => {
  const harness = createHarness({ initialBpm: 90 });
  harness.engine.start();

  // At 0.65s the click at 0.05 + 60/90 = 0.7166... is already in the audio
  // clock, inside the 0.1s lookahead window.
  harness.advance(650);
  const queued = harness.clicks.find((click) => Math.abs(click.time - 0.7166666667) < 1e-6);
  assert.ok(queued, "the beat at the old tempo should already be queued");

  harness.engine.setBpm(120);
  harness.advance(2000);
  harness.engine.stop();

  // The queued click is not withdrawn or moved.
  assert.ok(
    harness.clicks.some((click) => Math.abs(click.time - queued.time) < EPSILON),
    "an already queued click must not be retracted by a tempo change",
  );

  // Every beat queued after that protected click is 60/120 = 0.5s apart.
  const afterQueued = harness.clicks.filter(
    (click) => click.time > queued.time + EPSILON,
  );
  assert.ok(afterQueued.length >= 3, "expected several beats after the change");
  for (let i = 1; i < afterQueued.length; i++) {
    assertTime(
      afterQueued[i].time - afterQueued[i - 1].time,
      60 / 120,
      `interval between beats ${i - 1} and ${i} after the BPM change`,
    );
  }

  // No beat is scheduled twice and audio time never moves backwards.
  for (let i = 1; i < harness.clicks.length; i++) {
    assert.ok(
      harness.clicks[i].time > harness.clicks[i - 1].time,
      "scheduled audio times must be strictly increasing",
    );
  }
});

test("BPM change takes effect at the next beat boundary (90 -> 120)", () => {
  const harness = createHarness({ initialBpm: 90 });
  harness.engine.start();
  harness.advance(100); // one downbeat queued at 0.05s

  harness.engine.setBpm(120);
  harness.advance(2000);
  harness.engine.stop();

  const times = harness.clicks.map((click) => click.time);
  assert.ok(times.length >= 4, "expected the run to produce several beats");
  assertTime(times[0], 0.05, "first beat");
  for (let i = 1; i < times.length; i++) {
    assertTime(times[i] - times[i - 1], 0.5, `interval ${i}`);
  }
});

test("4/4 -> 3/4 finishes the old bar and starts the next bar on its downbeat", () => {
  const harness = createHarness({ initialBpm: 120, initialBeatsPerBar: 4 });
  harness.engine.start();
  harness.advance(600); // two beats of the 4/4 bar are scheduled
  harness.engine.setBeatsPerBar(3);
  harness.advance(3000);
  harness.engine.stop();

  assert.deepEqual(
    harness.clicks.map((click) => ({ time: click.time, beatIndex: click.beatIndex })),
    [
      { time: 0.05, beatIndex: 0 },
      { time: 0.55, beatIndex: 1 },
      { time: 1.05, beatIndex: 2 },
      { time: 1.55, beatIndex: 3 }, // rest of the old 4/4 bar
      { time: 2.05, beatIndex: 0 }, // first beat of the new 3/4 bar
      { time: 2.55, beatIndex: 1 },
      { time: 3.05, beatIndex: 2 },
      { time: 3.55, beatIndex: 0 }, // next 3/4 downbeat
    ],
    "beat indices and times should follow the bar boundary",
  );

  const downbeatTimes = harness.clicks
    .filter((click) => click.isDownbeat)
    .map((click) => click.time);
  assert.deepEqual(downbeatTimes, [0.05, 2.05, 3.55]);

  // The bar after the change is three beats long: 3.55 - 2.05 = 1.5s.
  assertTime(
    downbeatTimes[2] - downbeatTimes[1],
    3 * 0.5,
    "the new 3/4 bar should contain three beats",
  );

  // No two downbeats in a row.
  for (let i = 1; i < harness.clicks.length; i++) {
    assert.ok(
      !(harness.clicks[i].isDownbeat && harness.clicks[i - 1].isDownbeat),
      "two consecutive downbeats must never be scheduled",
    );
  }

  // The UI is told the signature of the bar each highlight belongs to: the
  // old 4/4 bar keeps four dots, then the new bar switches to three.
  assert.deepEqual(
    harness.beats.map((beat) => beat.beatsPerBar),
    [4, 4, 4, 4, 3, 3, 3, 3],
    "highlights should follow the sounding bar's signature",
  );
});

test("switching just after a downbeat does not create or skip a downbeat", () => {
  const harness = createHarness({ initialBpm: 120, initialBeatsPerBar: 4 });
  harness.engine.start();
  harness.advance(60); // downbeat at 0.05s has just been scheduled

  harness.engine.setBeatsPerBar(3);
  harness.advance(3600);
  harness.engine.stop();

  assert.deepEqual(
    harness.clicks.map((click) => ({ time: click.time, beatIndex: click.beatIndex })),
    [
      { time: 0.05, beatIndex: 0 },
      { time: 0.55, beatIndex: 1 },
      { time: 1.05, beatIndex: 2 },
      { time: 1.55, beatIndex: 3 },
      { time: 2.05, beatIndex: 0 },
      { time: 2.55, beatIndex: 1 },
      { time: 3.05, beatIndex: 2 },
      { time: 3.55, beatIndex: 0 },
    ],
  );
  assert.deepEqual(
    harness.clicks.filter((click) => click.isDownbeat).map((click) => click.time),
    [0.05, 2.05, 3.55],
  );
});

test("stop then start resets the beat count and begins on a downbeat", () => {
  const harness = createHarness({ initialBpm: 120, initialBeatsPerBar: 4 });
  harness.engine.start();
  harness.advance(700); // mid-bar: beats 0 and 1 are queued
  harness.engine.stop();

  const clicksAtStop = harness.clicks.length;
  const beatsAtStop = harness.beats.length;
  harness.advance(500);
  assert.equal(harness.clicks.length, clicksAtStop, "stop must halt scheduling");
  assert.equal(harness.beats.length, beatsAtStop, "stop must cancel pending UI beats");

  harness.engine.start();
  harness.advance(1100);
  harness.engine.stop();

  const restarted = harness.clicks.slice(clicksAtStop);
  assert.ok(restarted.length >= 1, "restart should schedule beats");
  assert.equal(restarted[0].beatIndex, 0, "restart begins on the downbeat");
  assert.equal(restarted[0].isDownbeat, true, "restart first beat is a downbeat");
  assertTime(restarted[0].time, 1.25, "first beat after restart (1.2 + 0.05)");

  const restartedBeats = harness.beats.filter((beat) => beat.at > 1.2);
  assert.ok(restartedBeats.length >= 1, "restart should publish a beat highlight");
  assert.equal(restartedBeats[0].beatIndex, 0, "highlight starts on beat 0");
  assertTime(restartedBeats[0].at, restarted[0].time, "highlight tracks the click time");
});

test("a stopped engine does not leak the previous run's UI highlight", () => {
  const harness = createHarness();
  harness.engine.start();
  harness.advance(10); // first click is queued at 0.05s, highlight pending
  harness.engine.stop();
  harness.advance(100);
  assert.equal(harness.beats.length, 0, "no highlight should fire after stop");
});
