// Metronome scheduling core.
//
// This module owns the timing state machine and nothing else: it never touches
// Web Audio, the DOM, or React. A caller injects the audio clock, the click
// sink (which queues an oscillator into an AudioContext) and timer primitives.
// That keeps the production scheduler on the same code path the Node tests
// drive with a fake clock and fake timers.
//
// Lookahead scheduling is Chris Wilson's "A Tale of Two Clocks": a light timer
// wakes the loop, and the loop only *queues* beats whose audio time falls inside
// the lookahead window. Beats that have already been handed to the audio clock
// are never revisited, so a tempo change only affects beats that have not yet
// been queued.

export const MIN_BPM = 30;
export const MAX_BPM = 280;
export const DEFAULT_BPM = 90;
export const DEFAULT_BEATS_PER_BAR = 4;
export const BEATS_PER_BAR_OPTIONS = [2, 3, 4, 6] as const;

export const LOOKAHEAD_MS = 25;
export const SCHEDULE_AHEAD_S = 0.1;
export const START_DELAY_S = 0.05;

export type TimerHandle = unknown;

export interface MetronomeTimerApi {
  setInterval: (callback: () => void, ms: number) => TimerHandle;
  clearInterval: (handle: TimerHandle) => void;
  setTimeout: (callback: () => void, ms: number) => TimerHandle;
  clearTimeout: (handle: TimerHandle) => void;
}

export interface ScheduledClick {
  /** Position inside the bar; 0 is the downbeat. */
  beatIndex: number;
  /** True for the first beat of a bar (higher pitch, louder envelope). */
  isDownbeat: boolean;
  /** AudioContext time, in seconds, at which the click should sound. */
  time: number;
}

export interface MetronomeEngineDeps extends MetronomeTimerApi {
  /** Current AudioContext time in seconds. */
  audioNow: () => number;
  /** Queue a click into the audio clock. Must not play anything itself. */
  scheduleClick: (click: ScheduledClick) => void;
  /** Called at the audio time of each beat so the UI can highlight it. */
  onBeat?: (beatIndex: number, beatsPerBar: number) => void;
}

export interface MetronomeEngineOptions {
  initialBpm?: number;
  initialBeatsPerBar?: number;
  lookaheadMs?: number;
  scheduleAheadSeconds?: number;
  startDelaySeconds?: number;
}

export function normalizeBpm(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_BPM;
  return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(value)));
}

export function isSupportedBeatsPerBar(value: number): boolean {
  return (BEATS_PER_BAR_OPTIONS as readonly number[]).includes(value);
}

/**
 * Owns the metronome's beat/bar clock.
 *
 * Tempo changes: `setBpm` re-times the next *unqueued* beat only. Anything
 * already queued keeps its audio time; beats queued afterwards use the new
 * interval.
 *
 * Time-signature changes: the bar in progress finishes under the old signature.
 * The requested signature is applied when the next bar's downbeat is scheduled,
 * so a change just after a downbeat can never create two downbeats in a row or
 * skip one.
 *
 * Stop/start: every `start` resets the bar counter to the downbeat.
 */
export class MetronomeEngine {
  private bpmValue: number;
  private requestedBeatsPerBar: number;
  private activeBeatsPerBar: number;
  private pendingBeatsPerBar: number | null = null;
  private runningFlag = false;

  private beatInBar = 0;
  private nextBeatTime = 0;
  private lastScheduledTime: number | null = null;

  private loopHandle: TimerHandle | null = null;
  private readonly uiTimers = new Set<TimerHandle>();
  private generation = 0;

  private readonly deps: MetronomeEngineDeps;
  private readonly loopIntervalMs: number;
  private readonly scheduleAheadSeconds: number;
  private readonly startDelaySeconds: number;

  constructor(deps: MetronomeEngineDeps, options: MetronomeEngineOptions = {}) {
    this.deps = deps;
    this.bpmValue = normalizeBpm(options.initialBpm ?? DEFAULT_BPM);
    const beats = options.initialBeatsPerBar ?? DEFAULT_BEATS_PER_BAR;
    this.requestedBeatsPerBar = isSupportedBeatsPerBar(beats)
      ? beats
      : DEFAULT_BEATS_PER_BAR;
    this.activeBeatsPerBar = this.requestedBeatsPerBar;
    this.loopIntervalMs = options.lookaheadMs ?? LOOKAHEAD_MS;
    this.scheduleAheadSeconds =
      options.scheduleAheadSeconds ?? SCHEDULE_AHEAD_S;
    this.startDelaySeconds = options.startDelaySeconds ?? START_DELAY_S;
  }

  get bpm(): number {
    return this.bpmValue;
  }

  /** The signature shown in the UI; takes effect at the next bar boundary. */
  get beatsPerBar(): number {
    return this.requestedBeatsPerBar;
  }

  get isRunning(): boolean {
    return this.runningFlag;
  }

  /** The signature actually governing the bar being sounded right now. */
  get soundingBeatsPerBar(): number {
    return this.activeBeatsPerBar;
  }

  start(): void {
    if (this.runningFlag) return;

    this.generation += 1;
    this.runningFlag = true;
    this.beatInBar = 0;
    this.activeBeatsPerBar = this.requestedBeatsPerBar;
    this.pendingBeatsPerBar = null;
    this.lastScheduledTime = null;
    this.nextBeatTime = this.deps.audioNow() + this.startDelaySeconds;

    // Queue the downbeat immediately so the first click is inside the first
    // lookahead window, then let the timer keep topping it up.
    this.tick();
    this.loopHandle = this.deps.setInterval(
      () => this.tick(),
      this.loopIntervalMs,
    );
  }

  stop(): void {
    this.generation += 1;
    this.runningFlag = false;

    if (this.loopHandle !== null) {
      this.deps.clearInterval(this.loopHandle);
      this.loopHandle = null;
    }
    for (const handle of this.uiTimers) {
      this.deps.clearTimeout(handle);
    }
    this.uiTimers.clear();

    // The next start always begins a fresh bar on the downbeat.
    this.beatInBar = 0;
    this.lastScheduledTime = null;
    this.activeBeatsPerBar = this.requestedBeatsPerBar;
    this.pendingBeatsPerBar = null;
  }

  setBpm(value: number): number {
    const next = normalizeBpm(value);
    if (next === this.bpmValue) return next;
    this.bpmValue = next;

    if (this.runningFlag && this.lastScheduledTime !== null) {
      // Re-time only the beat that has not been queued yet. The latest queued
      // click is the anchor, so the new interval runs from the next beat
      // boundary and no queued audio time is moved or duplicated.
      const candidate = this.lastScheduledTime + this.secondsPerBeat();
      const now = this.deps.audioNow();
      this.nextBeatTime = candidate > now ? candidate : now;
    }

    return next;
  }

  setBeatsPerBar(value: number): number {
    if (!isSupportedBeatsPerBar(value)) return this.requestedBeatsPerBar;
    this.requestedBeatsPerBar = value;

    if (!this.runningFlag) {
      this.activeBeatsPerBar = value;
      this.pendingBeatsPerBar = null;
      return value;
    }

    if (value === this.activeBeatsPerBar) {
      // Switching back to the signature already in force cancels the pending
      // change, even if it was queued several beats ago.
      this.pendingBeatsPerBar = null;
    } else {
      this.pendingBeatsPerBar = value;
    }

    return value;
  }

  private secondsPerBeat(): number {
    return 60 / this.bpmValue;
  }

  private tick(): void {
    if (!this.runningFlag) return;

    const horizon = this.deps.audioNow() + this.scheduleAheadSeconds;

    while (this.nextBeatTime < horizon) {
      // A requested signature change lands on the next bar's downbeat, never
      // mid-bar. The old signature counts out the bar that is in progress.
      if (this.beatInBar === 0 && this.pendingBeatsPerBar !== null) {
        this.activeBeatsPerBar = this.pendingBeatsPerBar;
        this.pendingBeatsPerBar = null;
      }

      const time = this.nextBeatTime;
      const beatIndex = this.beatInBar;
      const soundingBeatsPerBar = this.activeBeatsPerBar;

      this.deps.scheduleClick({
        beatIndex,
        isDownbeat: beatIndex === 0,
        time,
      });
      this.queueUiBeat(beatIndex, time, soundingBeatsPerBar);

      this.lastScheduledTime = time;
      this.nextBeatTime = time + this.secondsPerBeat();
      this.beatInBar = (beatIndex + 1) % this.activeBeatsPerBar;
    }
  }

  private queueUiBeat(
    beatIndex: number,
    time: number,
    beatsPerBar: number,
  ): void {
    const onBeat = this.deps.onBeat;
    if (!onBeat) return;

    const delayMs = Math.max(0, (time - this.deps.audioNow()) * 1000);
    const generation = this.generation;
    const handle = this.deps.setTimeout(() => {
      this.uiTimers.delete(handle);
      // A stop (or stop+start) bumps the generation; stale highlights cannot
      // leak into the new run.
      if (this.runningFlag && this.generation === generation) {
        onBeat(beatIndex, beatsPerBar);
      }
    }, delayMs);
    this.uiTimers.add(handle);
  }
}
