"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_BEATS_PER_BAR,
  DEFAULT_BPM,
  MetronomeEngine,
  isSupportedBeatsPerBar,
  normalizeBpm,
  type ScheduledClick,
} from "./metronome-engine";

// The timing state machine lives in ./metronome-engine so it can run under
// Node with an injected clock. This hook is the browser adapter: it owns the
// AudioContext, turns scheduled clicks into oscillator + gain envelopes, and
// mirrors the engine's beat events into React state.

export interface UseMetronomeOptions {
  initialBpm?: number;
  initialBeatsPerBar?: number;
}

export function useMetronome(opts: UseMetronomeOptions = {}) {
  const [bpm, setBpmState] = useState(() =>
    normalizeBpm(opts.initialBpm ?? DEFAULT_BPM),
  );
  const [beatsPerBar, setBeatsPerBarState] = useState(() => {
    const beats = opts.initialBeatsPerBar ?? DEFAULT_BEATS_PER_BAR;
    return isSupportedBeatsPerBar(beats) ? beats : DEFAULT_BEATS_PER_BAR;
  });
  const [running, setRunning] = useState(false);
  const [currentBeat, setCurrentBeat] = useState<number | null>(null);
  // The signature governing the bar currently sounding. It can lag the picker
  // by a few beats while the old bar finishes.
  const [soundingBeatsPerBar, setSoundingBeatsPerBar] = useState(beatsPerBar);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const engineRef = useRef<MetronomeEngine | null>(null);

  if (engineRef.current === null) {
    engineRef.current = new MetronomeEngine(
      {
        audioNow: () => audioCtxRef.current?.currentTime ?? 0,
        // Only queue audio events here. The oscillator is created at the
        // requested audio time, so the scheduling loop never plays a click
        // itself.
        scheduleClick: (click: ScheduledClick) => {
          const ctx = audioCtxRef.current;
          if (!ctx) return;
          const osc = ctx.createOscillator();
          const env = ctx.createGain();
          osc.frequency.value = click.isDownbeat ? 1200 : 800;
          env.gain.setValueAtTime(0.0001, click.time);
          env.gain.exponentialRampToValueAtTime(
            click.isDownbeat ? 0.6 : 0.4,
            click.time + 0.001,
          );
          env.gain.exponentialRampToValueAtTime(0.0001, click.time + 0.05);
          osc.connect(env).connect(ctx.destination);
          osc.start(click.time);
          osc.stop(click.time + 0.06);
        },
        onBeat: (beatIndex, beatsPerBarOfBeat) => {
          setCurrentBeat(beatIndex);
          setSoundingBeatsPerBar(beatsPerBarOfBeat);
        },
        setInterval: (callback, ms) => globalThis.setInterval(callback, ms),
        clearInterval: (handle) =>
          globalThis.clearInterval(handle as number),
        setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
        clearTimeout: (handle) => globalThis.clearTimeout(handle as number),
      },
      {
        initialBpm: bpm,
        initialBeatsPerBar: beatsPerBar,
      },
    );
  }

  const engine = engineRef.current;

  useEffect(() => {
    return () => {
      engine.stop();
    };
  }, [engine]);

  const start = useCallback(() => {
    if (engine.isRunning) return;
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    const ctx = audioCtxRef.current;
    if (ctx.state === "suspended") void ctx.resume();
    setSoundingBeatsPerBar(engine.beatsPerBar);
    engine.start();
    setRunning(true);
  }, [engine]);

  const stop = useCallback(() => {
    engine.stop();
    setRunning(false);
    setCurrentBeat(null);
    setSoundingBeatsPerBar(engine.beatsPerBar);
  }, [engine]);

  const toggle = useCallback(() => {
    if (engine.isRunning) stop();
    else start();
  }, [engine, start, stop]);

  const setBpm = useCallback(
    (value: number) => {
      const normalized = engine.setBpm(value);
      setBpmState(normalized);
    },
    [engine],
  );

  const setBeatsPerBar = useCallback(
    (value: number) => {
      if (!isSupportedBeatsPerBar(value)) return;
      engine.setBeatsPerBar(value);
      setBeatsPerBarState(value);
      if (!engine.isRunning) setSoundingBeatsPerBar(value);
    },
    [engine],
  );

  return {
    bpm,
    setBpm,
    beatsPerBar,
    soundingBeatsPerBar,
    setBeatsPerBar,
    running,
    currentBeat,
    start,
    stop,
    toggle,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tap-tempo helper. Pure function, easy to test.
// Returns BPM averaged from the last N taps (or null if not enough data).
// Resets the rolling window if a gap > 2s between taps is observed.

const MAX_TAPS = 6;
const TAP_GAP_RESET_MS = 2000;

export function makeTapTempo() {
  let timestamps: number[] = [];

  function tap(now: number = performance.now()): number | null {
    const last = timestamps[timestamps.length - 1];
    if (last && now - last > TAP_GAP_RESET_MS) {
      timestamps = [];
    }
    timestamps.push(now);
    if (timestamps.length > MAX_TAPS) timestamps.shift();
    if (timestamps.length < 2) return null;
    const intervals: number[] = [];
    for (let i = 1; i < timestamps.length; i++) {
      intervals.push(timestamps[i] - timestamps[i - 1]);
    }
    const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    return Math.round(60000 / avgMs);
  }

  function reset() {
    timestamps = [];
  }

  return { tap, reset };
}
