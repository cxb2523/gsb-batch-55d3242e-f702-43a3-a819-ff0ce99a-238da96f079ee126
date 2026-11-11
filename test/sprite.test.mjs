/* Audio sprite export (toSprite). Node has no Web Audio implementation, so this
   suite stands up a small deterministic OfflineAudioContext mock: just enough of
   the graph the offline renderer actually uses (oscillators, looping noise, gains,
   a biquad passthrough, a feedback-tail convolver, a compressor, buffers). It runs
   fully offline and has no randomness of its own - the library's seeded export RNG
   is what makes repeated renders identical. */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as foley from "../src/foley.js";

const RATE = 44100;

/* ---------------- minimal OfflineAudioContext mock ---------------- */

class Param {
  constructor(initial = 0) { this._initial = initial; this.events = []; }
  get value() { return this._initial; }
  set value(v) { this._initial = v; this.events.length = 0; }
  setValueAtTime(v, t) { this.events.push({ type: "set", t, v }); return this; }
  linearRampToValueAtTime(v, t) {
    this.events.push({ type: "lin", t, v, from: this.valueAt(t) }); return this;
  }
  exponentialRampToValueAtTime(v, t) {
    this.events.push({ type: "exp", t, v, from: this.valueAt(t) }); return this;
  }
  setTargetAtTime(target, t0, tc) { this.events.push({ type: "target", t: t0, v: target, tc }); return this; }
  valueAt(t) {
    let v = this._initial;
    for (const e of this.events) {
      if (t < e.t) break;
      if (e.type === "set") { v = e.v; }
      else if (e.type === "target") {
        const v0 = v;
        v = e.v + (v0 - e.v) * Math.exp(-(t - e.t) / (e.tc || 0.02));
      } else if (t >= e.t) { v = e.v; }
      else {
        const k = (t - this._prevTime(e)) / (e.t - this._prevTime(e));
        v = e.type === "lin"
          ? e.from + (e.v - e.from) * k
          : e.from * Math.pow(e.v / Math.max(1e-9, e.from), k);
      }
    }
    return v;
  }
  _prevTime(e) {
    const i = this.events.indexOf(e);
    return i > 0 ? this.events[i - 1].t : 0;
  }
}

class Node {
  constructor(ctx) { this.ctx = ctx; this.inputs = []; this._frame = -1; this._out = 0; }
  connect(n) { n.inputs.push(this); return n; }
  disconnect() {}
  pull(frame) {
    if (this._frame === frame) return this._out;
    this._frame = frame;
    this._out = this.compute(frame);
    return this._out;
  }
  sum(frame) { let s = 0; for (const i of this.inputs) s += i.pull(frame); return s; }
  compute(frame) { return this.sum(frame); }
}

class Gain extends Node {
  constructor(ctx) { super(ctx); this.gain = new Param(1); }
  compute(frame) { return this.sum(frame) * this.gain.valueAt(frame / this.ctx.sampleRate); }
}

class Biquad extends Node {
  constructor(ctx) { super(ctx); this.type = "bandpass"; this.frequency = new Param(350); this.Q = new Param(1); }
  /* frequency shaping is irrelevant to offset bookkeeping; pass the noise through */
}

class Compressor extends Node {
  constructor(ctx) {
    super(ctx);
    this.threshold = new Param(-10); this.knee = new Param(4); this.ratio = new Param(12);
    this.attack = new Param(0.002); this.release = new Param(0.12);
  }
}

class Convolver extends Node {
  constructor(ctx) { super(ctx); this.buffer = null; this._delay = Math.round(ctx.sampleRate * 0.03); this._ring = new Float32Array(this._delay); this._pos = 0; this._last = -1; }
  compute(frame) {
    /* wet-only echoes with an exponential tail: enough to exercise trimEnd without
       any randomness of its own */
    if (frame !== this._last + 1) { this._ring.fill(0); this._pos = 0; }
    this._last = frame;
    const x = this.sum(frame);
    const d = this._ring[this._pos];
    const y = x + 0.35 * d;
    this._ring[this._pos] = y;
    this._pos = (this._pos + 1) % this._delay;
    return 0.35 * d;
  }
}

class Oscillator extends Node {
  constructor(ctx) { super(ctx); this.type = "sine"; this.frequency = new Param(440); this._phase = 0; this._start = 0; this._stop = Infinity; }
  start(t) { this._start = t; }
  stop(t) { this._stop = t; }
  compute(frame) {
    const t = frame / this.ctx.sampleRate;
    if (t < this._start || t >= this._stop) return 0;
    this._phase += 2 * Math.PI * this.frequency.valueAt(t) / this.ctx.sampleRate;
    const p = this._phase;
    switch (this.type) {
      case "triangle": return (2 / Math.PI) * Math.asin(Math.sin(p));
      case "square": return Math.sin(p) >= 0 ? 1 : -1;
      case "sawtooth": return 2 * ((p / (2 * Math.PI)) - Math.floor(p / (2 * Math.PI) + 0.5));
      default: return Math.sin(p);
    }
  }
}

class BufferSource extends Node {
  constructor(ctx) { super(ctx); this.buffer = null; this.loop = false; this._start = 0; this._stop = Infinity; }
  start(t) { this._start = t; }
  stop(t) { this._stop = t; }
  compute(frame) {
    const t = frame / this.ctx.sampleRate;
    if (!this.buffer || t < this._start || t >= this._stop) return 0;
    const d = this.buffer.getChannelData(0);
    const i = Math.round((t - this._start) * this.ctx.sampleRate);
    return d[this.loop ? i % d.length : Math.min(i, d.length - 1)];
  }
}

class AudioBufferMock {
  constructor(channels, length, rate) {
    this.numberOfChannels = channels; this.length = length; this.sampleRate = rate;
    this._ch = Array.from({ length: channels }, () => new Float32Array(length));
  }
  getChannelData(ch) { return this._ch[ch]; }
}

class Destination extends Node {
  constructor(ctx, length) {
    super(ctx);
    this.left = new Float32Array(length); this.right = new Float32Array(length);
  }
  compute(frame) {
    const v = this.sum(frame);
    this.left[frame] = v; this.right[frame] = v; /* offline graph is mono-mid */
    return v;
  }
}

class OfflineAudioContextMock {
  constructor(channels, length, rate) {
    this.numberOfChannels = channels; this._length = length; this.sampleRate = rate;
    this.destination = new Destination(this, length);
  }
  createGain() { return new Gain(this); }
  createBiquadFilter() { return new Biquad(this); }
  createDynamicsCompressor() { return new Compressor(this); }
  createConvolver() { return new Convolver(this); }
  createOscillator() { return new Oscillator(this); }
  createBufferSource() { return new BufferSource(this); }
  createBuffer(ch, len, rate) { return new AudioBufferMock(ch, len, rate); }
  async startRendering() {
    const buf = new AudioBufferMock(this.numberOfChannels, this._length, this.sampleRate);
    for (let f = 0; f < this._length; f++) this.destination.pull(f);
    buf.getChannelData(0).set(this.destination.left);
    buf.getChannelData(1).set(this.destination.right);
    return buf;
  }
}

globalThis.OfflineAudioContext = OfflineAudioContextMock;

/* ---------------- WAV decoding helper ---------------- */

async function parseWav(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const dv = new DataView(bytes.buffer);
  const id = (o) => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
  assert.equal(id(0), "RIFF"); assert.equal(id(8), "WAVE"); assert.equal(id(12), "fmt "); assert.equal(id(36), "data");
  const dataBytes = dv.getUint32(40, true);
  return {
    bytes,
    audioFormat: dv.getUint16(20, true),
    channels: dv.getUint16(22, true),
    sampleRate: dv.getUint32(24, true),
    blockAlign: dv.getUint16(32, true),
    bitsPerSample: dv.getUint16(34, true),
    frames: dataBytes / 4,
    samples: new Int16Array(bytes.buffer, 44, dataBytes / 2),
  };
}
const frameAt = (wav, f) => ({ l: wav.samples[f * 2], r: wav.samples[f * 2 + 1] });
const silent = (wav, f) => frameAt(wav, f).l === 0 && frameAt(wav, f).r === 0;
const names = Object.keys(foley.cues);

/* ---------------- format & coverage ---------------- */

test("sprite WAV is 16-bit 44.1kHz stereo PCM and the map covers all 28 cues", async () => {
  const { blob, map } = await foley.toSprite();
  const wav = await parseWav(blob);
  assert.equal(wav.audioFormat, 1, "PCM format tag");
  assert.equal(wav.channels, 2);
  assert.equal(wav.sampleRate, RATE);
  assert.equal(wav.bitsPerSample, 16);
  assert.equal(wav.blockAlign, 4);
  assert.deepEqual(Object.keys(map).sort(), [...names].sort());
  for (const n of names) {
    assert.equal(typeof map[n].start, "number");
    assert.equal(typeof map[n].duration, "number");
    assert.ok(map[n].duration > 0, `${n} has no duration`);
    assert.ok(map[n].start >= 0, `${n} starts before zero`);
  }
});

/* ---------------- offset table matches the written samples ---------------- */

test("map offsets are whole-sample positions of the actual WAV layout", async () => {
  const { blob, map } = await foley.toSprite();
  const wav = await parseWav(blob);

  for (const n of names) {
    const startFrames = map[n].start * RATE;
    const durFrames = map[n].duration * RATE;
    /* the map is expressed in true seconds of integer frame counts */
    assert.ok(Math.abs(startFrames - Math.round(startFrames)) < 1e-6, `${n}.start not sample-aligned`);
    assert.ok(Math.abs(durFrames - Math.round(durFrames)) < 1e-6, `${n}.duration not sample-aligned`);
  }

  /* each cue occupies exactly [start, start+duration): audible inside, and the
     first frame really is the cue's first sample */
  for (const n of names) {
    const s = Math.round(map[n].start * RATE);
    const d = Math.round(map[n].duration * RATE);
    assert.ok(!silent(wav, s), `${n} starts on silence - start points past its first sample`);
    let heard = 0;
    for (let f = s; f < s + d; f++) if (!silent(wav, f)) heard++;
    assert.ok(heard > 0, `${n} region contains no audio`);
  }

  /* gaps between cues are exactly silent, with no tail bleeding in */
  for (let i = 1; i < names.length; i++) {
    const prev = map[names[i - 1]], cur = map[names[i]];
    const prevEnd = Math.round((prev.start + prev.duration) * RATE);
    const curStart = Math.round(cur.start * RATE);
    for (let f = prevEnd; f < curStart; f++) {
      assert.ok(silent(wav, f), `gap before ${names[i]} is not silent at frame ${f}`);
    }
  }

  /* the file ends exactly on the last cue: no trailing silence */
  const last = map[names[names.length - 1]];
  const expectedFrames = Math.round((last.start + last.duration) * RATE);
  assert.equal(wav.frames, expectedFrames, "WAV length differs from last cue's end");
  assert.equal(wav.bytes.length - 44, expectedFrames * 4);
});

test("default gap is 0.05s and is applied as rounded whole-sample silence", async () => {
  const { map: def } = await foley.toSprite();
  const { map: explicit, blob, map } = await foley.toSprite(0.05);
  assert.deepEqual(explicit, def, "omitting gap must equal passing 0.05");
  const wav = await parseWav(blob);
  const gapFrames = Math.round(0.05 * RATE); /* 2205 */
  assert.equal(gapFrames, 2205);
  for (let i = 1; i < names.length; i++) {
    const prevEnd = (map[names[i - 1]].start + map[names[i - 1]].duration) * RATE;
    const curStart = map[names[i]].start * RATE;
    assert.equal(Math.round(curStart - prevEnd), gapFrames);
  }
});

test("an odd gap is rounded to whole samples and the same rounding drives the map", async () => {
  const g = 0.0123;
  const gapFrames = Math.round(g * RATE); /* 542 */
  assert.equal(gapFrames, 542);
  const { blob, map } = await foley.toSprite(g);
  const wav = await parseWav(blob);
  for (let i = 1; i < names.length; i++) {
    const prevEnd = (map[names[i - 1]].start + map[names[i - 1]].duration) * RATE;
    const curStart = map[names[i]].start * RATE;
    assert.equal(Math.round(curStart - prevEnd), gapFrames);
    for (let f = Math.round(prevEnd); f < Math.round(curStart); f++) assert.ok(silent(wav, f));
  }
});

/* ---------------- gap boundaries ---------------- */

test("gap 0 packs cues back-to-back with zero silence between them", async () => {
  const { blob, map } = await foley.toSprite(0);
  const wav = await parseWav(blob);
  let sumDur = 0;
  for (let i = 0; i < names.length; i++) {
    const d = Math.round(map[names[i]].duration * RATE);
    sumDur += d;
    if (i > 0) {
      const prevEnd = Math.round((map[names[i - 1]].start + map[names[i - 1]].duration) * RATE);
      assert.equal(Math.round(map[names[i]].start * RATE), prevEnd, "adjacent cues must touch");
    }
  }
  assert.equal(wav.frames, sumDur, "no gap means the WAV is exactly the cue lengths");
});

test("negative, infinite, and non-numeric gaps are all treated as 0", async () => {
  const zero = await foley.toSprite(0);
  for (const bad of [-1, -0.05, NaN, Infinity, -Infinity, "0.05", {}, null /* null is the default, checked separately */]) {
    if (bad === null) continue;
    const got = await foley.toSprite(bad);
    assert.deepEqual(got.map, zero.map, `gap ${String(bad)} must match gap 0`);
    assert.equal(got.blob.size, zero.blob.size, `gap ${String(bad)} changed the WAV length`);
  }
  /* null/undefined keep the documented 50ms default rather than collapsing to 0 */
  const def = await foley.toSprite();
  const undef = await foley.toSprite(undefined);
  assert.deepEqual(undef.map, def.map);
  assert.ok(def.blob.size > zero.blob.size);
  /* no negative offsets, no overlaps, starts are strictly ascending */
  const starts = names.map((n) => Math.round(def.map[n].start * RATE));
  assert.ok(starts.every((s) => s >= 0));
  assert.deepEqual(starts, [...starts].sort((a, b) => a - b));
  for (let i = 1; i < starts.length; i++) assert.ok(starts[i] > starts[i - 1]);
});

/* ---------------- repeatability ---------------- */

test("repeated exports with the same settings give identical WAV bytes and maps", async () => {
  const a = await foley.toSprite(0.03);
  const b = await foley.toSprite(0.03);
  assert.deepEqual(b.map, a.map);
  assert.equal(b.blob.size, a.blob.size);
  const [ab, bb] = await Promise.all([a.blob.arrayBuffer(), b.blob.arrayBuffer()]);
  assert.deepEqual(new Uint8Array(bb), new Uint8Array(ab));
});

test("exports honor theme and space, stay deterministic, and leave settings intact", async () => {
  foley.set({ theme: "glass", space: 0.8 });
  try {
    const a = await foley.toSprite(0.04);
    const b = await foley.toSprite(0.04);
    assert.deepEqual(b.map, a.map, "same theme/space must reproduce the offset table");
    assert.equal(b.blob.size, a.blob.size);
    assert.equal(Object.keys(a.map).length, 28);
    /* every cue still maps to an in-bounds, sample-aligned, non-empty region */
    const wav = await parseWav(a.blob);
    for (const n of names) {
      const s = Math.round(a.map[n].start * RATE), d = Math.round(a.map[n].duration * RATE);
      assert.ok(s >= 0 && s + d <= wav.frames);
      assert.ok(d > 0);
      assert.ok(!silent(wav, s));
    }
    assert.equal(foley.get().theme, "glass");
    assert.equal(foley.get().space, 0.8);
  } finally {
    foley.set({ theme: "default", space: 0.22 });
  }
  /* after restoring defaults, exports are back to the default-shaped sprite */
  const back = await foley.toSprite(0.04);
  const fresh = await foley.toSprite(0.04);
  assert.deepEqual(back.map, fresh.map);
});
