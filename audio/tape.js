// Vaporwave (panel 18): a slowed-down 80s shopping-mall tape.
//
// 1. An original "source" cue is synthesised first, into its own OfflineAudioContext: smooth-jazz /
//    mall muzak at 151.2 BPM, 4 semitones above the film's key — FM electric piano on maj7 / m9
//    chords, fretless bass, an FM "sax" playing a variation of the theme, soft gated-reverb drums.
// 2. That AudioBuffer is played back as a tape: playbackRate 0.7937 (= 2^(−4/12): 151.2 → 120 BPM
//    and back into the film's key), a long wet reverb, a ~4 kHz low-pass, a 0.5 Hz wow on detune,
//    and a little tape hiss.
// 3. Entering the panel the tape slows from 1× to 0.7937× (pitch and tempo slide together); leaving,
//    it speeds back to 1× and lands on the crossing downbeat.
// 4. Bar 2: the needle skips — half a beat of the tape loops four times, then playback resumes
//    where it would have been, so the beat grid is untouched.
//
// Alignment: every source event is placed at S(t), the integral of the tape's playback rate up to the
// film time t where it must be heard, so the notes land exactly on the film's beats whatever the
// rate does (ramps, wow). The preview and the exported WAV run this same code.
import * as I from './instruments.js';
import { noiseBuffer, reverbIR } from './dsp.js';
import { THEME } from './score.js';

const BEAT = 0.5;
export const TAPE_RATE = Math.pow(2, -4 / 12);            // 0.7937
export const SOURCE_BPM = 120 / TAPE_RATE;                 // 151.2
const UP = 4;                                              // the source is 4 semitones higher
const RAMP_IN = 0.6, SPEEDUP = [5.5, 6.0], END = 6.0, TEND = 6.4;
const WOW_HZ = 0.5, WOW_CENTS = 7;
export const SKIP = { at: 3.0, len: 0.25, times: 4 };      // film u: the needle skips here (bar 2)

const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
/** Tape playback rate and wow (cents) at panel time u. */
export function rateAt(u) {
  if (u < RAMP_IN) return 1 + (TAPE_RATE - 1) * smooth(u / RAMP_IN);
  if (u < SPEEDUP[0]) return TAPE_RATE;
  return TAPE_RATE + (1 - TAPE_RATE) * smooth((u - SPEEDUP[0]) / (SPEEDUP[1] - SPEEDUP[0]));
}
export const wowAt = (u) => WOW_CENTS * Math.min(1, u / 1.0) * Math.sin(2 * Math.PI * WOW_HZ * u);

// sampled curves (what the AudioParams receive) and their exact integral S(u)
const DT = 0.005, NS = Math.round(TEND / DT) + 1;
const PR = new Float32Array(NS), DET = new Float32Array(NS), CUM = new Float64Array(NS);
for (let i = 0; i < NS; i++) { PR[i] = rateAt(i * DT); DET[i] = wowAt(i * DT); }
const eff = (i) => PR[i] * Math.pow(2, DET[i] / 1200);
for (let i = 1; i < NS; i++) CUM[i] = CUM[i - 1] + 0.5 * (eff(i - 1) + eff(i)) * DT;
/** Source time (s) the un-skipped tape would reach by panel time u; notes are placed here. */
export function S(u) {
  const x = Math.max(0, Math.min(TEND, u)) / DT, i = Math.min(NS - 2, Math.floor(x)), f = x - i;
  const e0 = eff(i), e1 = eff(i + 1);
  return CUM[i] + (e0 * f + 0.5 * (e1 - e0) * f * f) * DT;
}

// ------------------------------------------------------------------ the needle skip + queryable tape clock
// Everything below is the single source of truth for the skip schedule AND for the
// browser-console / Node query. The synthesiser schedules its snippets with skipSegment()
// and resumes the main playback at S(SKIP_END); tapeState() reads the very same numbers.
const SKIP_END = SKIP.at + SKIP.len * SKIP.times;          // 4.0 s: four 0.25 s repeats
const clampU = (u) => (Number.isFinite(+u) ? Math.max(0, Math.min(END, +u)) : 0);

/** One repetition k (0-based) of the skipped half beat, in panel time and source time. */
function skipSegment(k) {
  const start = SKIP.at + k * SKIP.len;
  return {
    index: k + 1,                                          // 1 … SKIP.times
    start, end: start + SKIP.len,
    source: S(SKIP.at),                                    // every repeat starts at the same tape position
    rate: rateAt(start),                                   // the flat 0.7937× stretch
    detune: wowAt(start),
  };
}

/** Which repetition (1…4) is playing at panel time u; 0 outside the skip. */
export function skipPassAt(u) {
  const x = clampU(u);
  if (x < SKIP.at || x >= SKIP_END) return 0;
  return Math.min(SKIP.times, Math.floor((x - SKIP.at) / SKIP.len) + 1);
}

/**
 * The tape's playback state at panel time u (seconds; 0 = the crossing into panel 18).
 * This is the queryable form of the same rate curve and skip schedule the synthesiser uses.
 *
 *   rate        playbackRate (1× → 0.7937× over the first 0.6 s; 0.7937× → 1× over 5.5–6.0 s)
 *   sourceTime  source-tape seconds heard at u. During the skip it is the position inside the
 *               repeated half beat; after it, it is the un-interrupted S(u) (so at u = 4.0 it is
 *               S(4.0), where the main playback resumes).
 *   skipPass    1…4 while the needle skips (u ∈ [3.0, 4.0)), 0 outside
 *   skipping    skipPass > 0
 *
 * Browser console:  const { tapeState } = await import('/audio/tape.js'); tapeState(3.1)
 * Node:             node -e "import('./audio/tape.js').then(m => console.log(m.tapeState(3.1)))"
 */
export function tapeState(u) {
  const at = clampU(u), pass = skipPassAt(at);
  let sourceTime;
  if (pass) {
    const seg = skipSegment(pass - 1);
    sourceTime = seg.source + (at - seg.start) * seg.rate * Math.pow(2, seg.detune / 1200);
  } else {
    sourceTime = S(at);                                    // includes the 0.5 Hz wow
  }
  return { u: at, rate: rateAt(at), sourceTime, skipPass: pass, skipping: pass > 0 };
}
/** Alias of tapeState(u), matching the rateAt / wowAt naming already used in this file. */
export const tapeAt = tapeState;

// The preview page loads audio/tape.js with the score; expose the query there too, so it can be
// called straight from the browser console (window.tapeState(3.1), window.tapeAt(3.1)).
if (typeof globalThis !== 'undefined') {
  globalThis.tapeState = tapeState;
  globalThis.tapeAt = tapeAt;
}

/** Float32Array slice of a sampled control curve over panel time [u0, u1] (inclusive). */
const curveSlice = (curve, u0, u1) => curve.slice(Math.round(u0 / DT), Math.round(u1 / DT) + 1);

// ------------------------------------------------------------------ the source cue (written in D; synthesised +4)
const ep = I.epiano({ ratio: 1, index: 1.6, level: 0.11, decay: 3.2 });
const epBell = I.epiano({ ratio: 14, index: 0.35, level: 0.025, decay: 1.2 });      // the FM tine sparkle
const fretless = I.synth({ wave: 'sawtooth', octave: -1, level: 0.11, attack: 0.03, decay: 0.45, sustain: 0.55, release: 0.14, lp: 620, env: 1.9, envTime: 0.22 });
const sax = I.fmLead({ level: 0.075, index: 1.9, lp: 3000, vib: 0.01, breath: 0.025 });
const kick = I.drum({ freq: 56, decay: 0.28, level: 0.42, pitchFrom: 1.8, pitchTime: 0.04 });
const snare = I.noiseHit({ type: 'bandpass', freq: 1700, q: 0.7, decay: 0.12, level: 0.13, seed: 171, body: 200 });
const hat = I.noiseHit({ type: 'highpass', freq: 8500, decay: 0.025, level: 0.035, seed: 179 });
const shaker = I.noiseHit({ type: 'bandpass', freq: 6200, q: 1.2, decay: 0.05, level: 0.025, seed: 181 });

// chords (beat, beats, voicing) — maj7 / m9 colours over the phrase-B roots D · B · A
const CHORDS = [
  [0, 1.5, [54, 57, 61, 64]], [1.5, 2.5, [54, 57, 61, 64]],          // Dmaj9   (F# A C# E)
  [4, 1.5, [57, 61, 62, 66]], [5.5, 2.5, [57, 61, 62, 66]],          // Bm9     (A C# D F#)
  [8, 2, [55, 59, 62, 66]],                                           // Em9     (G B D F#)
  [10, 1.5, [55, 59, 61, 66]], [11.5, 0.5, [55, 59, 61, 66]],        // A13     (G B C# F#)
];
const BASS = [   // [beat, beats, midi, slideFrom]
  [0, 1.5, 38], [1.5, 0.5, 45, 44], [2, 1, 50], [3, 1, 49],
  [4, 1.5, 47], [5.5, 0.5, 54, 53], [6, 1, 57], [7, 1, 59, 57],
  [8, 1, 40], [9, 1, 47], [10, 1.5, 45, 43], [11.5, 0.5, 44],
];
/** The theme (phrase B) re-phrased for the sax: scoops into long notes, two notes pushed ahead of the beat. */
function saxLine() {
  const out = [];
  for (const [b, len, m, v] of THEME.B) {
    let bb = b, l = len, slide = null;
    if (b === 2 || b === 8) { bb = b - 0.25; l = len + 0.25; }                  // push ahead of the beat
    if (len >= 1) slide = m - 2;                                               // scoop up into long notes
    out.push([bb, l, m, 0.85 * v, slide]);
  }
  return out;
}

async function renderSource(sr, clicks) {
  const len = S(TEND) + 2;
  const ctx = new OfflineAudioContext(2, Math.ceil(len * sr), sr);
  const out = ctx.createGain(); out.gain.value = 1; out.connect(ctx.destination);
  // gated reverb for the snare (the 80s "big" snare, cut short)
  const gv = ctx.createConvolver(); gv.buffer = reverbIR(ctx, 1.2, { damp: 0.4, seed: 31 }); gv.normalize = true;
  const gate = ctx.createGain(); gate.gain.value = 0; gv.connect(gate).connect(out);
  const st = (beat) => S(beat * BEAT);                      // source time of a film beat in this panel
  const sd = (beat, beats) => S((beat + beats) * BEAT) - S(beat * BEAT);
  if (clicks) {   // sync test (tools/audio.mjs --tape-clicks): one click per film beat instead of the music
    for (let b = 0; b <= 12; b++) {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 3000;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.8, st(b)); g.gain.setValueAtTime(0, st(b) + 0.002);
      o.connect(g).connect(out); o.start(st(b)); o.stop(st(b) + 0.003);
    }
    return ctx.startRendering();
  }
  for (const [b, l, v] of CHORDS) for (const m of v) {
    ep(ctx, out, st(b), m + UP, sd(b, l), 0.55, { pan: (m - 60) / 20 });
    epBell(ctx, out, st(b), m + UP + 12, sd(b, l) * 0.5, 0.4, { pan: (m - 60) / 20 });
  }
  for (const [b, l, m, sl] of BASS) fretless(ctx, out, st(b), m + UP, sd(b, l), 0.8, sl != null ? { slideFrom: sl + UP, slideTime: 0.09 } : {});
  for (const [b, l, m, v, sl] of saxLine()) sax(ctx, out, st(b), m + UP, sd(b, l) * 0.95, v, sl != null ? { slideFrom: sl + UP, slideTime: 0.08, pan: 0.1 } : { pan: 0.1 });
  for (let b = 0; b < 12; b++) {
    if (b % 2 === 0) kick(ctx, out, st(b), 60, 0.3, b % 4 === 0 ? 0.9 : 0.6);
    else {
      const t = st(b);
      snare(ctx, out, t, 60, 0.2, 0.75);
      snare(ctx, gv, t, 60, 0.2, 0.9);
      gate.gain.setValueAtTime(1, t); gate.gain.setValueAtTime(1, t + 0.2); gate.gain.linearRampToValueAtTime(0, t + 0.215);
    }
    hat(ctx, out, st(b + 0.5), 60, 0.03, 0.7, { pan: 0.25 });
    shaker(ctx, out, st(b + 0.25), 60, 0.04, 0.5, { pan: -0.3 });
    shaker(ctx, out, st(b + 0.75), 60, 0.04, 0.4, { pan: -0.3 });
  }
  return ctx.startRendering();
}

const cache = new Map();
/** The source buffer (rendered once per sample rate). */
export function sourceBuffer(sr) {
  const clicks = !!globalThis.__tapeClicks, key = `${sr}:${clicks}`;
  if (!cache.has(key)) cache.set(key, renderSource(sr, clicks));
  return cache.get(key);
}

/** Play the tape for panel E (see eras.js). */
export async function vaporTape(E) {
  const ctx = E.ctx, buf = await sourceBuffer(ctx.sampleRate);
  if (E.range && E.range.from > E.t0 + 0.01) return;        // partial renders starting inside the panel: skip
  const T = (u) => E.T(u / BEAT);
  // the tape chain: low-pass → dry + long wet reverb → era bus
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4000; lp.Q.value = 0.5;
  const dry = ctx.createGain(); dry.gain.value = 0.55;
  const verb = ctx.createConvolver(); verb.buffer = reverbIR(ctx, 4.5, { damp: 0.7, pre: 0.03, seed: 18 }); verb.normalize = true;
  const wet = ctx.createGain(); wet.gain.setValueAtTime(0.8, T(0)); wet.gain.setValueAtTime(0.8, T(END)); wet.gain.linearRampToValueAtTime(0, T(END + 0.9));
  lp.connect(dry).connect(E.bus.input);
  lp.connect(verb).connect(wet).connect(E.bus.input);
  // main playback, split at the skip: the first source stops on the needle drop, and the second
  // explicitly resumes at S(SKIP_END) — the source time the un-skipped tape would have reached —
  // so the bar-2 skip never shifts the beat grid after it.
  const k0 = T(SKIP.at), k1 = T(SKIP_END), F = 0.004;
  const mainA = ctx.createBufferSource(); mainA.buffer = buf;
  mainA.playbackRate.setValueCurveAtTime(curveSlice(PR, 0, SKIP.at), T(0), SKIP.at);
  mainA.detune.setValueCurveAtTime(curveSlice(DET, 0, SKIP.at), T(0), SKIP.at);
  const mgA = ctx.createGain();
  mgA.gain.setValueAtTime(1, T(0));
  mgA.gain.setValueAtTime(1, k0 - F); mgA.gain.linearRampToValueAtTime(0, k0);
  mainA.connect(mgA).connect(lp);
  mainA.start(T(0), 0); mainA.stop(k0);
  const mainB = ctx.createBufferSource(); mainB.buffer = buf;
  mainB.playbackRate.setValueCurveAtTime(curveSlice(PR, SKIP_END, TEND), k1, TEND - SKIP_END);
  mainB.detune.setValueCurveAtTime(curveSlice(DET, SKIP_END, TEND), k1, TEND - SKIP_END);
  const mgB = ctx.createGain();
  mgB.gain.setValueAtTime(0, k1); mgB.gain.linearRampToValueAtTime(1, k1 + F);
  mgB.gain.setValueAtTime(1, T(END)); mgB.gain.linearRampToValueAtTime(0, T(END) + 0.12);
  mainB.connect(mgB).connect(lp);
  mainB.start(k1, S(SKIP_END)); mainB.stop(T(TEND));
  // the needle skip: the same half beat, four times, each with a faint click
  for (let k = 0; k < SKIP.times; k++) {
    const seg = skipSegment(k);
    const t = T(seg.start), d = T(seg.end) - t;
    const src = ctx.createBufferSource(); src.buffer = buf;
    src.playbackRate.value = seg.rate; src.detune.value = seg.detune;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + F);
    g.gain.setValueAtTime(1, t + d - F); g.gain.linearRampToValueAtTime(0, t + d);
    src.connect(g).connect(lp); src.start(t, seg.source); src.stop(t + d + 0.01);
    const n = ctx.createBufferSource(); n.buffer = noiseBuffer(ctx, 0.1, 401 + k);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0.05, t); ng.gain.exponentialRampToValueAtTime(0.0005, t + 0.02);
    n.connect(hp).connect(ng).connect(E.bus.input); n.start(t); n.stop(t + 0.03);
  }
  // tape hiss under everything
  const h = ctx.createBufferSource(); h.buffer = noiseBuffer(ctx, 2, 407); h.loop = true;
  const hb = ctx.createBiquadFilter(); hb.type = 'bandpass'; hb.frequency.value = 5000; hb.Q.value = 0.4;
  const hg = ctx.createGain();
  hg.gain.setValueAtTime(0, T(0)); hg.gain.linearRampToValueAtTime(0.012, T(0.3));
  hg.gain.setValueAtTime(0.012, T(END)); hg.gain.linearRampToValueAtTime(0, T(END) + 0.2);
  h.connect(hb).connect(hg).connect(E.bus.input); h.start(T(0)); h.stop(T(END) + 0.25);
}

