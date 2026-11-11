// verify.js — the "no cheating" audit. Run: node tools/verify.js
//
// It checks, mechanically, the claims the README makes:
//   1. index.html is exactly what tools/build.js produces from src/.
//   2. index.html contains no image, no media, no external file reference and
//      no network API, by name or by the usual ways of hiding a name; and it
//      carries a Content-Security-Policy of default-src 'none', so the browser
//      itself refuses any load the page might attempt.
//   3. The stroke list really is a stroke list: it is not an image or an
//      archive in disguise, and every 12-byte record decodes to a sane stroke.
//   4. The repository holds no image, font, media or other binary file.
// Exit code 0 = every check passed.
'use strict';
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail: detail || '' }); }

// ---- 1. the shipped file is the build of the sources ------------------------
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
{
  const read = f => fs.readFileSync(path.join(root, 'src', f), 'utf8');
  let built = read('page.html');
  for (const [mark, file] of [['/*__BRUSH__*/', 'brush.js'], ['/*__TOOL__*/', 'tool.js'], ['/*__STROKES__*/', 'strokes.js'], ['/*__APP__*/', 'app.js']])
    built = built.replace(mark, () => read(file).trimEnd());
  const n = require('./strokes.js').load().bytes.length / 12;
  built = built.split('__COUNT__').join(n.toLocaleString('en-US'));
  check('index.html is the exact build of src/', built === html, `${Buffer.byteLength(html)} bytes`);
}

// ---- 2. nothing in the page can be, load or fetch an image ---------------------
// The base64 stroke string is cut out first so its random letters cannot
// produce false matches; it is examined on its own in section 3.
const m = /var STROKES = "([A-Za-z0-9+/=]*)";/.exec(html);
check('exactly one stroke blob in the page', m && html.split('var STROKES = "').length === 2);
const page = m ? html.replace(m[1], '') : html;
const FORBIDDEN = [
  ['image / media / embed elements', /<\s*(img|image|picture|video|audio|source|track|svg|canvas[^>]*\ssrc|iframe|frame|object|embed|applet|link|base|input[^>]*type\s*=\s*["']?image)\b/i],
  ['src / srcset / href / poster / background attributes', /\b(src|srcset|href|poster|background|xlink:href|action|formaction|ping|manifest)\s*=/i],
  ['CSS url(), @import, @font-face, image-set', /url\s*\(|@import|@font-face|image-set\s*\(|-webkit-mask|cursor\s*:\s*[^;]*\//i],
  ['data:, blob:, http(s):, ftp:, ws(s):, file: or // URLs', /\b(data|blob|https?|ftp|wss?|file|javascript)\s*:\s*[^\s;}'"]|["'(]\/\/[a-z0-9]/i],
  ['image decoding APIs (drawImage, Image, createImageBitmap, ImageDecoder, createPattern)', /drawImage|createImageBitmap|\bImage\s*\(|new\s+Image\b|ImageDecoder|createPattern|HTMLImageElement|OffscreenCanvas|VideoFrame/],
  ['network APIs (fetch, XHR, WebSocket, EventSource, beacon, WebRTC, WebTransport)', /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|RTCPeerConnection|WebTransport|navigator\s*\.\s*serviceWorker/],
  ['loading more code (import, importScripts, Worker, eval, Function, timers given a string)', /\bimport\s*[\s("'{*]|importScripts|\bWorker\s*\(|SharedWorker|\beval\s*\(|new\s+Function|\bFunction\s*\(|WebAssembly|createObjectURL|set(?:Timeout|Interval)\s*\(\s*["'`]/],
  ['HTML injection (innerHTML, outerHTML, insertAdjacentHTML, document.write, DOMParser, srcdoc)', /innerHTML|outerHTML|insertAdjacentHTML|document\s*\.\s*write|DOMParser|srcdoc|createContextualFragment|setHTML/],
  ['stored or decoded payloads (localStorage, indexedDB, caches, cookie, TextDecoder, decodeURIComponent, fromCharCode, unescape)', /localStorage|sessionStorage|indexedDB|\bcaches\b|document\s*\.\s*cookie|TextDecoder|decodeURIComponent|fromCharCode|\bunescape\s*\(|DecompressionStream/],
  ['dynamic property access that could hide an API name (window[...], document[...], globalThis)', /\b(window|document|self|globalThis|top|parent)\s*\[|globalThis|\bReflect\b|\bProxy\b/],
  // the same names again without requiring a call, so an alias (var f = self.fetch) is caught too
  ['API names reachable without a call (fetch, eval, Function, Image, Audio, Worker, Blob, FileReader, constructor)', /\b(fetch|eval|Function|Image|Audio|Worker|FontFace|Blob|FileReader|Request|constructor)\b/],
  ['computed member access with a string key (obj["dr" + "awImage"])', /[\w$)\]]\s*\[[^\]\n]*["'`]/],
  ['navigation away from the page (location other than location.search)', /\blocation\b(?!\s*\.\s*search\b)/],
  ['URL scheme text of any kind, even split from its payload', /\b(data|blob|https?|ftp|wss?|file|javascript):/i],
  ['template literals', /`/],
  ['pixel data written out as a long list of numbers', /(?:-?\d+(?:\.\d+)?\s*,\s*){200,}/],
  ['second encoded payload (any 64+ character base64-like run outside the stroke list)', /[A-Za-z0-9+\/]{64,}/]
];
for (const [name, re] of FORBIDDEN) {
  const hit = re.exec(page);
  check('no ' + name, !hit, hit ? 'found "' + page.slice(Math.max(0, hit.index - 30), hit.index + 40).replace(/\s+/g, ' ') + '"' : '');
}
{
  const made = [...page.matchAll(/createElement\s*\(\s*([^)]*)\)/g)].map(x => x[1].trim());
  const allowed = new Set(["'div'", "'canvas'", "'br'", 'tag']);
  const bad = made.filter(x => !allowed.has(x));
  check('createElement only ever makes div / canvas / br / span', bad.length === 0 && made.length > 0, bad.length ? 'unexpected: ' + bad.join(', ') : made.length + ' call sites');
  const mkCalls = (page.match(/\bmk\s*\(/g) || []).length - 1;          // minus the definition
  const mkOk = (page.match(/\bmk\s*\(\s*'(?:div|span)'/g) || []).length;
  check('mk() helper is only ever called with a literal div or span', mkCalls > 0 && mkCalls === mkOk && (page.match(/createElement\s*\(\s*tag\s*\)/g) || []).length === 1, `${mkOk} of ${mkCalls} calls`);
  const CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'">`;
  check("Content-Security-Policy is default-src 'none' (no image, media, font, connection or frame can load) and is the only http-equiv", page.split(CSP).length === 2 && (page.match(/http-equiv/gi) || []).length === 1);
  check('the page without its stroke list is small (no room for a hidden picture)', Buffer.byteLength(page) <= 90000, Buffer.byteLength(page) + ' bytes of markup, CSS and code');
  const atobs = page.split('atob(').length - 1;
  check('atob() is called once, on the stroke list', atobs === 1 && /atob\(STROKES\)/.test(page));
  const scripts = [...page.matchAll(/<script\b([^>]*)>/gi)].map(x => x[1].trim());
  check('every <script> is inline and attribute-free', scripts.length === 4 && scripts.every(a => a === ''), scripts.length + ' script tags');
}

// ---- 3. the stroke list is a stroke list -----------------------------------------
if (m) {
  const b = Buffer.from(m[1], 'base64');
  const { Codec } = require('../src/brush.js');
  check('stroke blob length is a whole number of 12-byte records', b.length % Codec.BYTES === 0, `${b.length} bytes = ${b.length / 12} strokes`);
  const head = b.subarray(0, 16), hx = head.toString('hex'), tx = head.toString('latin1');
  const magic = [['PNG', /^89504e47/], ['JPEG', /^ffd8ff/], ['GIF', /^47494638/], ['BMP', /^424d/], ['TIFF', /^(49492a00|4d4d002a)/], ['gzip', /^1f8b/],
    ['zlib', /^78(01|5e|9c|da)/], ['zip', /^504b0304/], ['PDF', /^25504446/], ['ICO', /^00000100/], ['JPEG-XL', /^(ff0a|0000000c4a584c20)/], ['zstd', /^28b52ffd/], ['brotli-ish/7z/xz', /^(377abcaf|fd377a58)/]];
  const hit = magic.filter(([, re]) => re.test(hx)).map(x => x[0]);
  if (/RIFF|WEBP|ftyp|avif|heic|<svg|<\?xml/i.test(b.subarray(0, 64).toString('latin1'))) hit.push('container/SVG signature');
  check('stroke blob does not start with any image / archive signature', hit.length === 0, hit.join(', ') || 'first bytes ' + hx.slice(0, 16));
  let bad = 0, wmin = 1e9, wmax = 0, inside = 0; const n = b.length / 12;
  for (let o = 0; o < b.length; o += 12) {
    const x = Codec.xd(b.readUInt16LE(o)), y = Codec.xd(b.readUInt16LE(o + 2)), L = Codec.ld(b[o + 5]), Wd = Codec.wd(b[o + 6]);
    if (b[o + 11] > 3) bad++;                                   // opacity is a 2-bit code
    if (x > -40 && x < 640 && y > -40 && y < 934) inside++;
    if (L < Wd * 0.8 * 0.97) bad++;                             // the painter never makes a stroke shorter than 0.8 of its width
    if (Wd < wmin) wmin = Wd; if (Wd > wmax) wmax = Wd;
  }
  check('every record decodes to a legal stroke (opacity code 0-3, length >= 0.8 x width)', bad === 0, bad + ' bad records');
  check('strokes sit on or near the 600 x 894 panel', inside / n > 0.999, (100 * inside / n).toFixed(2) + '% within 40 units of the panel');
  // painted biggest brush first: mean width must fall from one tenth of the list to the next
  const dec = []; for (let d = 0; d < 10; d++) { let s = 0, c = 0; for (let i = Math.floor(n * d / 10); i < Math.floor(n * (d + 1) / 10); i++) { s += Math.log(Codec.wd(b[i * 12 + 6])); c++; } dec.push(Math.exp(s / c)); }
  check('brush width shrinks as the painting goes on (a painting order, not a scanline order)', dec[0] > dec[4] && dec[4] > dec[9] && dec[0] > 4 * dec[9], 'geometric mean width by tenth: ' + dec.map(v => v.toFixed(1)).join(' '));
  // a bitmap stored row by row would have x/y marching in order; stroke positions jump around
  let asc = 0; for (let o = 12; o < b.length; o += 12) if (b.readUInt16LE(o + 2) >= b.readUInt16LE(o - 10)) asc++;
  check('stroke positions are not in raster order', Math.abs(asc / n - 0.5) < 0.1, (100 * asc / n).toFixed(1) + '% of strokes are lower on the panel than the one before');
  check('brush widths span big blocking-in brushes to hairline detail', wmax > 60 && wmin < 1.5, `${wmin.toFixed(2)} .. ${wmax.toFixed(1)} work units`);
}

// ---- 4. no binary anywhere in what gets published -------------------------------
{
  const BIN_EXT = /\.(png|jpe?g|gif|webp|avif|heic|bmp|tiff?|ico|svgz?|psd|pdf|mp4|mov|webm|mp3|wav|ogg|ttf|otf|woff2?|eot|bin|rgb|ppm|zip|gz|wasm)$/i;
  // what git publishes, when this is a git checkout; otherwise every file on disk outside work/
  let files = null, source = 'git ls-files';
  try {
    files = require('child_process').execFileSync('git', ['ls-files', '-z'], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().split('\0').filter(Boolean);
  } catch (e) { files = null; }
  if (!files || !files.length) {
    source = 'directory walk'; files = [];
    (function walk(dir) {
      for (const f of fs.readdirSync(dir)) {
        if (dir === root && (f === '.git' || f === 'work' || f === 'node_modules' || f === '.DS_Store')) continue;
        const p = path.join(dir, f);
        if (fs.statSync(p).isDirectory()) walk(p); else files.push(path.relative(root, p));
      }
    })(root);
  }
  const offenders = [];
  for (const rel of files) {
    const f = path.join(root, rel);
    if (/^work\//.test(rel)) { offenders.push(rel + ' (inside work/)'); continue; }
    if (!fs.existsSync(f)) continue;
    if (BIN_EXT.test(rel)) { offenders.push(rel + ' (extension)'); continue; }
    const buf = fs.readFileSync(f);
    if (buf.includes(0)) { offenders.push(rel + ' (binary content)'); continue; }
    // only the stroke list and the page built from it may carry an encoded payload
    if (rel !== 'src/strokes.js' && rel !== 'index.html' && /[A-Za-z0-9+\/]{200,}/.test(buf.toString('latin1'))) offenders.push(rel + ' (encoded payload)');
  }
  check('published files are all text: no image, font, media, binary or stray encoded payload', offenders.length === 0, offenders.join(', ') || `${files.length} files from ${source}`);
  const gi = fs.existsSync(path.join(root, '.gitignore')) ? fs.readFileSync(path.join(root, '.gitignore'), 'utf8') : '';
  check('work/ (where your own reference photo goes) is git-ignored', /^work\/?$/m.test(gi));
}

// ---- report ------------------------------------------------------------------------
let fail = 0;
for (const r of results) { if (!r.ok) fail++; console.log((r.ok ? '  ok   ' : '  FAIL ') + r.name + (r.detail ? '  — ' + r.detail : '')); }
console.log(fail ? `\n${fail} of ${results.length} checks FAILED` : `\nall ${results.length} checks passed`);
process.exit(fail ? 1 : 0);
