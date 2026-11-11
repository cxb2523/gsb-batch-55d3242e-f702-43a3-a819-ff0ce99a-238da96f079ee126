// render.js — replay the stroke list offline, at any pixel scale, to a PPM.
//   node tools/render.js [scale=2] [out=work/render.ppm] [strokeCount=all]
// Same brush code as the page, so the output is what the browser paints.
const fs = require('fs'), path = require('path');
const { Brush, Codec } = require('../src/brush.js');
const S = +(process.argv[2] || 2), out = process.argv[3] || path.join(__dirname, '..', 'work', 'render.ppm'), W = 600, H = 894;
const b = require('./strokes.js').load().bytes;
const n = Math.min(b.length / Codec.BYTES, +(process.argv[4] || 1e9));
const B = Brush(W, H, S), C = new Float32Array(B.PW * B.PH * 3);
for (let i = 0; i < B.PW * B.PH; i++) { C[i * 3] = 222; C[i * 3 + 1] = 212; C[i * 3 + 2] = 190; }
const t0 = Date.now();
for (let i = 0, o = 0; i < n; i++, o += Codec.BYTES)
  B.paint(C, Codec.xd(b.readUInt16LE(o)), Codec.xd(b.readUInt16LE(o + 2)), Codec.ad(b[o + 4]), Codec.ld(b[o + 5]), Codec.wd(b[o + 6]),
    Codec.bd(b.readInt8(o + 7)), Codec.OPS[b[o + 11] & 3], i, b[o + 8], b[o + 9], b[o + 10]);
const px = new Uint8ClampedArray(C.length); for (let i = 0; i < C.length; i++) px[i] = C[i];
let sum = 0; for (let i = 0; i < px.length; i += 3) sum += px[i] + px[i + 1] * 3 + px[i + 2] * 7;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.concat([Buffer.from(`P6\n${B.PW} ${B.PH}\n255\n`), Buffer.from(px.buffer)]));
console.log(`${n} strokes at ${B.PW}x${B.PH} in ${Date.now() - t0} ms -> ${out}  checksum ${sum}`);
