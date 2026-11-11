// optimize.js — the painter. Looks at the photo, looks at the canvas, and
// keeps asking "where is the painting most wrong, and which single brush
// stroke would fix the most of it?". Writes the stroke list to src/strokes.js.
//
// It needs something to look at: work/target.rgb, a 600x894 raw RGB copy of
// the reference photo (painter/prepare.py makes it from any image you supply;
// no photo is kept in this repository).
//
//   node painter/optimize.js            paint from a bare panel
//   node painter/optimize.js --resume   keep painting on top of work/strokes.bin
//   PHASES='[[wmin,wmax,lrmin,lrmax,count],...]' overrides the schedule
'use strict';
const fs = require('fs');
const path = require('path');
const { Brush, Codec } = require('../src/brush.js');

const W = 600, H = 894, N = W * H;
const OUT = path.join(__dirname, '..', 'work');
const RESUME = process.argv.includes('--resume');
const K0 = +(process.env.K0 || 28), MUT = +(process.env.MUT || 44);
const GESSO = [222, 212, 190];

// ---- rng ---------------------------------------------------------------
let rs = (+(process.env.SEED || 1503)) >>> 0;
function rnd() { rs = (rs + 0x6D2B79F5) | 0; let t = Math.imul(rs ^ (rs >>> 15), 1 | rs); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
function gauss() { return (rnd() + rnd() + rnd() + rnd() - 2) * 1.22; }

// ---- target ------------------------------------------------------------
const raw = fs.readFileSync(path.join(OUT, 'target.rgb'));
const T = new Float32Array(N * 3);
for (let i = 0; i < N * 3; i++) T[i] = raw[i];

// what matters most: the face, then the hands
const WT = new Float32Array(N);
function blob(cx, cy, rx, ry, amt) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x - cx) / rx, dy = (y - cy) / ry, d = dx * dx + dy * dy;
    if (d < 4) WT[y * W + x] += amt * Math.exp(-d * 1.2);
  }
}
WT.fill(1);
blob(268, 226, 78, 108, 4.0);   // face
blob(240, 202, 26, 13, 3.0);    // her right eye
blob(300, 200, 26, 13, 3.0);    // her left eye
blob(266, 280, 34, 14, 3.0);    // mouth
blob(262, 246, 20, 24, 1.5);    // nose
blob(300, 690, 120, 60, 1.6);   // hands
blob(300, 400, 110, 70, 0.8);   // chest / neckline

// ---- orientation field (structure tensor), at three scales --------------
function blur(src, sigma) {
  const r = Math.max(1, Math.ceil(sigma * 2.5)), k = new Float32Array(2 * r + 1);
  let s = 0; for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-i * i / (2 * sigma * sigma)); s += k[i + r]; }
  for (let i = 0; i < k.length; i++) k[i] /= s;
  const tmp = new Float32Array(N), dst = new Float32Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let a = 0; for (let i = -r; i <= r; i++) { let xx = x + i; xx = xx < 0 ? 0 : xx >= W ? W - 1 : xx; a += src[y * W + xx] * k[i + r]; }
    tmp[y * W + x] = a;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let a = 0; for (let i = -r; i <= r; i++) { let yy = y + i; yy = yy < 0 ? 0 : yy >= H ? H - 1 : yy; a += tmp[yy * W + x] * k[i + r]; }
    dst[y * W + x] = a;
  }
  return dst;
}
const gray = new Float32Array(N);
for (let i = 0; i < N; i++) gray[i] = 0.3 * T[i * 3] + 0.59 * T[i * 3 + 1] + 0.11 * T[i * 3 + 2];
function field(sigma) {
  const g = blur(gray, sigma), jxx = new Float32Array(N), jyy = new Float32Array(N), jxy = new Float32Array(N);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x, gx = g[i + 1] - g[i - 1], gy = g[i + W] - g[i - W];
    jxx[i] = gx * gx; jyy[i] = gy * gy; jxy[i] = gx * gy;
  }
  const a = blur(jxx, sigma * 2), b = blur(jyy, sigma * 2), c = blur(jxy, sigma * 2);
  const ang = new Float32Array(N);
  for (let i = 0; i < N; i++) ang[i] = 0.5 * Math.atan2(2 * c[i], a[i] - b[i]) + Math.PI / 2;
  return ang;
}
const FIELDS = [field(1.2), field(3), field(8)];

// ---- canvas, error map ---------------------------------------------------
const B = Brush(W, H, 1), MA = B.MA, MS = B.MS;
const C = new Float32Array(N * 3);
for (let i = 0; i < N; i++) { C[i * 3] = GESSO[0]; C[i * 3 + 1] = GESSO[1]; C[i * 3 + 2] = GESSO[2]; }
const E = new Float32Array(N);
const G = 4, GW = Math.ceil(W / G), GH = Math.ceil(H / G);
const cell = new Float64Array(GW * GH), cum = new Float64Array(GW * GH);
function errAt(i) { const j = i * 3, a = C[j] - T[j], b = C[j + 1] - T[j + 1], c = C[j + 2] - T[j + 2]; return WT[i] * (a * a + b * b + c * c); }
function refresh(x0, y0, x1, y1) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) E[y * W + x] = errAt(y * W + x);
  const gx0 = (x0 / G) | 0, gy0 = (y0 / G) | 0, gx1 = Math.min(GW, Math.ceil(x1 / G)), gy1 = Math.min(GH, Math.ceil(y1 / G));
  for (let gy = gy0; gy < gy1; gy++) for (let gx = gx0; gx < gx1; gx++) {
    let s = 0; const ye = Math.min(H, gy * G + G), xe = Math.min(W, gx * G + G);
    for (let y = gy * G; y < ye; y++) for (let x = gx * G; x < xe; x++) s += E[y * W + x];
    cell[gy * GW + gx] = s;
  }
}
let total = 0;
function rebuild() { let s = 0; for (let i = 0; i < cell.length; i++) { s += cell[i]; cum[i] = s; } total = s; }
function pick() {
  const r = rnd() * total; let lo = 0, hi = cum.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < r) lo = m + 1; else hi = m; }
  const gx = lo % GW, gy = (lo / GW) | 0;
  let bx = 0, by = 0, be = -1;
  for (let k = 0; k < 4; k++) {
    const x = Math.min(W - 1, gx * G + ((rnd() * G) | 0)), y = Math.min(H - 1, gy * G + ((rnd() * G) | 0));
    const e = E[y * W + x]; if (e > be) { be = e; bx = x; by = y; }
  }
  return [bx + 0.5, by + 0.5];
}
function rmse() { let s = 0; for (let i = 0; i < N * 3; i++) { const d = Math.min(255, C[i]) - T[i]; s += d * d; } return Math.sqrt(s / (N * 3)); }
function rmseBox(x0, y0, x1, y1) { let s = 0, n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) for (let c = 0; c < 3; c++) { const d = C[(y * W + x) * 3 + c] - T[(y * W + x) * 3 + c]; s += d * d; n++; } return Math.sqrt(s / n); }

// ---- strokes ---------------------------------------------------------------
let strokes = [];           // arrays of 12 codes
let phaseEnds = [];
function decode(c) { return { cx: Codec.xd(c[0]), cy: Codec.xd(c[1]), ang: Codec.ad(c[2]), L: Codec.ld(c[3]), Wd: Codec.wd(c[4]), bend: Codec.bd(c[5]), r: c[6], g: c[7], b: c[8], op: Codec.OPS[c[9]] }; }
// snap a candidate to what the 12-byte record can hold, so the optimizer
// judges exactly the stroke the page will draw
function snap(p) {
  p.xc = Codec.xq(p.cx); p.cx = Codec.xd(p.xc);
  p.yc = Codec.xq(p.cy); p.cy = Codec.xd(p.yc);
  p.ac = Codec.aq(p.ang); p.ang = Codec.ad(p.ac);
  p.wc = Codec.wq(p.Wd); p.Wd = Codec.wd(p.wc);
  if (p.L < p.Wd * 0.8) p.L = p.Wd * 0.8;
  p.lc = Codec.lq(p.L); p.L = Codec.ld(p.lc);
  p.bc = Codec.bq(p.bend); p.bend = Codec.bd(p.bc);
  p.op = Codec.OPS[p.oc];
  return p;
}
// best colour for this stroke shape (least squares), and how much total
// error the stroke would remove (negative = better painting)
function evalS(p, seed) {
  if (!B.mask(p.cx, p.cy, p.ang, p.L, p.Wd, p.bend, p.op, seed)) return 0;
  const x0 = B.x0, y0 = B.y0, w = B.w, h = B.h;
  let nr = 0, ng = 0, nb = 0, den = 0, k = 0, peak = 0;
  for (let y = 0; y < h; y++) {
    let i = (y0 + y) * W + x0, j = i * 3;
    for (let x = 0; x < w; x++, k++, i++, j += 3) {
      const a = MA[k]; if (a === 0) continue;
      if (a > peak) peak = a;
      const as = a * MS[k], ia = 1 - a, wa = WT[i] * as;
      den += wa * as;
      nr += wa * (T[j] - C[j] * ia); ng += wa * (T[j + 1] - C[j + 1] * ia); nb += wa * (T[j + 2] - C[j + 2] * ia);
    }
  }
  // a mark this grid barely catches (it falls between pixel centres) would get a
  // wild least-squares colour and show as a speck at higher zoom: not a candidate
  if (den < 1e-4 || peak < 0.5 * p.op) return 0;
  let r = Math.round(nr / den), g = Math.round(ng / den), b = Math.round(nb / den);
  r = r < 0 ? 0 : r > 255 ? 255 : r; g = g < 0 ? 0 : g > 255 ? 255 : g; b = b < 0 ? 0 : b > 255 ? 255 : b;
  p.r = r; p.g = g; p.b = b;
  let d = 0; k = 0;
  for (let y = 0; y < h; y++) {
    let i = (y0 + y) * W + x0, j = i * 3;
    for (let x = 0; x < w; x++, k++, i++, j += 3) {
      const a = MA[k]; if (a === 0) continue;
      const as = a * MS[k], ia = 1 - a;
      let n, e = 0, t;
      n = C[j] * ia + r * as; if (n > 255) n = 255; t = n - T[j]; e += t * t;
      n = C[j + 1] * ia + g * as; if (n > 255) n = 255; t = n - T[j + 1]; e += t * t;
      n = C[j + 2] * ia + b * as; if (n > 255) n = 255; t = n - T[j + 2]; e += t * t;
      d += WT[i] * e - E[i];
    }
  }
  return d;
}
function commit(p) {
  const seed = strokes.length;
  B.paint(C, p.cx, p.cy, p.ang, p.L, p.Wd, p.bend, p.op, seed, p.r, p.g, p.b);
  refresh(B.x0, B.y0, B.x0 + B.w, B.y0 + B.h);
  strokes.push([p.xc, p.yc, p.ac, p.lc, p.wc, p.bc, p.r, p.g, p.b, p.oc]);
}
function clone(p) { return { cx: p.cx, cy: p.cy, ang: p.ang, L: p.L, Wd: p.Wd, bend: p.bend, oc: p.oc, r: 0, g: 0, b: 0 }; }

function paintPhase(ph, label) {
  const [wmin, wmax, lrmin, lrmax, count] = ph;
  const fld = wmax < 5 ? FIELDS[0] : wmax < 20 ? FIELDS[1] : FIELDS[2];
  const t0 = Date.now(); let done = 0, tries = 0, sinceRebuild = 1e9;
  const every = wmax > 20 ? 1 : wmax > 6 ? 4 : 16;
  while (done < count && tries < count * 3) {
    tries++;
    if (sinceRebuild >= every) { rebuild(); sinceRebuild = 0; }
    const [px, py] = pick();
    const seed = strokes.length;
    const fa = fld[(py | 0) * W + (px | 0)];
    let best = null, bd = 0;
    for (let i = 0; i < K0; i++) {
      const Wd = wmin * Math.pow(wmax / wmin, rnd());
      const p = snap({
        cx: px + gauss() * Wd * 0.3, cy: py + gauss() * Wd * 0.3,
        ang: rnd() < 0.65 ? fa + gauss() * 0.22 : rnd() * Math.PI,
        L: Wd * (lrmin + rnd() * (lrmax - lrmin)), Wd,
        bend: rnd() < 0.4 ? 0 : (rnd() - 0.5) * 0.45, oc: rnd() < 0.6 ? 3 : (rnd() * 4) | 0, r: 0, g: 0, b: 0
      });
      const d = evalS(p, seed);
      if (d < bd) { bd = d; best = p; }
    }
    if (!best) continue;
    for (let i = 0; i < MUT; i++) {
      const p = clone(best), m = (rnd() * 6) | 0, sc = i < MUT / 2 ? 1 : 0.45;
      if (m === 0) { p.cx += gauss() * p.Wd * 0.35 * sc; p.cy += gauss() * p.Wd * 0.35 * sc; }
      else if (m === 1) p.ang += gauss() * 0.22 * sc;
      else if (m === 2) p.L *= Math.exp(gauss() * 0.28 * sc);
      else if (m === 3) p.Wd = Math.min(wmax * 1.25, Math.max(wmin * 0.7, p.Wd * Math.exp(gauss() * 0.2 * sc)));
      else if (m === 4) p.bend += gauss() * 0.09 * sc;
      else { p.oc = Math.max(0, Math.min(3, p.oc + (rnd() < 0.5 ? -1 : 1))); p.cx += gauss() * p.Wd * 0.15; p.cy += gauss() * p.Wd * 0.15; }
      if (p.L > 300) p.L = 300;
      snap(p);
      const d = evalS(p, seed);
      if (d < bd) { bd = d; best = p; }
    }
    commit(best); done++; sinceRebuild++;
  }
  console.log(`${label} w ${wmin}-${wmax}  +${done} strokes (${tries} tries)  total ${strokes.length}  rmse ${rmse().toFixed(2)}  face ${rmseBox(190, 120, 350, 340).toFixed(2)}  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

function save(tag) {
  const out = Buffer.alloc(strokes.length * Codec.BYTES);
  strokes.forEach((c, i) => {
    const o = i * Codec.BYTES;
    out.writeUInt16LE(c[0], o); out.writeUInt16LE(c[1], o + 2);
    out[o + 4] = c[2]; out[o + 5] = c[3]; out[o + 6] = c[4]; out.writeInt8(c[5], o + 7);
    out[o + 8] = c[6]; out[o + 9] = c[7]; out[o + 10] = c[8]; out[o + 11] = c[9];
  });
  fs.writeFileSync(path.join(OUT, 'strokes.bin'), out);
  // the painting, as the page and the tools read it: plain text, no binary
  fs.writeFileSync(path.join(__dirname, '..', 'src', 'strokes.js'),
    '// strokes.js \u2014 the painting. ' + strokes.length + ' brush strokes, 12 bytes each, base64.\n' +
    '// Written by painter/optimize.js; record layout is in src/brush.js (Codec).\n' +
    '// PHASE_ENDS: the stroke count at which each brush size was put down.\n' +
    'var PHASE_ENDS = ' + JSON.stringify(phaseEnds) + ';\n' +
    'var STROKES = "' + out.toString('base64') + '";\n');
  fs.writeFileSync(path.join(OUT, 'phases.json'), JSON.stringify(phaseEnds));
  const img = Buffer.alloc(N * 3);
  for (let i = 0; i < N * 3; i++) img[i] = Math.max(0, Math.min(255, Math.round(C[i])));
  fs.writeFileSync(path.join(OUT, `canvas_${tag}.rgb`), img);
}

// ---- go ------------------------------------------------------------------
if (RESUME) {
  const b = fs.readFileSync(path.join(OUT, 'strokes.bin'));
  for (let o = 0; o < b.length; o += Codec.BYTES) {
    const c = [b.readUInt16LE(o), b.readUInt16LE(o + 2), b[o + 4], b[o + 5], b[o + 6], b.readInt8(o + 7), b[o + 8], b[o + 9], b[o + 10], b[o + 11]];
    const p = decode(c);
    B.paint(C, p.cx, p.cy, p.ang, p.L, p.Wd, p.bend, p.op, strokes.length, p.r, p.g, p.b);
    strokes.push(c);
  }
  phaseEnds = JSON.parse(fs.readFileSync(path.join(OUT, 'phases.json'), 'utf8'));
  console.log(`resumed ${strokes.length} strokes`);
}
refresh(0, 0, W, H);
console.log(`start rmse ${rmse().toFixed(2)}`);
const PHASES = process.env.PHASES ? JSON.parse(process.env.PHASES) : [
  [60, 118, 1.4, 3.6, 110],
  [26, 60, 1.4, 4.5, 420],
  [12, 26, 1.3, 5, 1300],
  [6, 12, 1.2, 6, 3600],
  [3, 6, 1.1, 7, 9000],
  [1.6, 3, 1, 8, 18000],
  [0.8, 1.6, 1, 9, 30000]
];
PHASES.forEach((ph, i) => { paintPhase(ph, `phase ${i}`); phaseEnds.push(strokes.length); });
save('final');
console.log(`done: ${strokes.length} strokes, ${strokes.length * Codec.BYTES} bytes`);
