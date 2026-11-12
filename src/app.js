// app.js — the studio around the panel: pacing, the moving brush, the loupe,
// the palette, the brush rack, the timeline. Everything on screen is drawn by
// this file, brush.js and tool.js. Nothing is loaded.
(function () {
  'use strict';
  var W = 600, H = 894, GESSO = [222, 212, 190];
  var DISP = 846 / 894;                       // design px per work unit (panel is 846 px tall at 1920x1080)
  function $(id) { return document.getElementById(id); }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function sm(a, b, x) { x = (x - a) / (b - a); return x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x); }
  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+$)/g, ','); }
  function hsh(n) { n = Math.imul(n ^ (n >>> 15), 0x2c1b3c6d); n = Math.imul(n ^ (n >>> 12), 0x297a2d39); return ((n ^ (n >>> 15)) >>> 0) / 4294967296; }
  var QS = location.search, SYNC = /[?&]sync\b/.test(QS);

  // ---- the stroke list ----------------------------------------------------
  var bin = atob(STROKES), N = Math.floor(bin.length / Codec.BYTES);
  var SX = new Float64Array(N), SY = new Float64Array(N), SA = new Float64Array(N), SL = new Float64Array(N),
      SW = new Float64Array(N), SB = new Float64Array(N), SO = new Float64Array(N), SC = new Uint8Array(N * 3), RAW;
  (function () {
    var D = new Uint8Array(bin.length), i, o;
    for (i = 0; i < bin.length; i++) D[i] = bin.charCodeAt(i);
    var dv = new DataView(D.buffer);
    for (i = 0, o = 0; i < N; i++, o += Codec.BYTES) {
      SX[i] = Codec.xd(dv.getUint16(o, true)); SY[i] = Codec.xd(dv.getUint16(o + 2, true));
      SA[i] = Codec.ad(D[o + 4]); SL[i] = Codec.ld(D[o + 5]); SW[i] = Codec.wd(D[o + 6]); SB[i] = Codec.bd(dv.getInt8(o + 7));
      SC[i * 3] = D[o + 8]; SC[i * 3 + 1] = D[o + 9]; SC[i * 3 + 2] = D[o + 10]; SO[i] = Codec.OPS[D[o + 11] & 3];
    }
    RAW = D;
  })();
  bin = null;

  // ---- the seven brushes, and the pacing ------------------------------------
  // Slow enough at first to watch single strokes land, then faster and faster
  // as the brushes get smaller. KT seconds -> KI stroke number.
  var PH_END = PHASE_ENDS.slice(); PH_END[PH_END.length - 1] = N;
  var NPH = PH_END.length;
  var NAMES = ['Blocking in', 'Big shapes', 'Form', 'Modelling', 'Drawing', 'Detail', 'Finishing'];
  var NOS = ['40', '24', '14', '8', '4', '1', '000'], KINDS = ['flat', 'flat', 'filbert', 'filbert', 'round', 'round', 'liner'];
  var DUR = [6, 4, 5, 5, 6, 7, 8], ICONW = [15, 12, 9.5, 7.5, 5.5, 4, 2.6];
  var PHS = [], KI = [0], KT = [0], TOTAL = 0;
  (function () {
    if (PH_END[0] > 24) { KI.push(12); KT.push(2.5); }
    for (var k = 0; k < NPH; k++) {
      var t0 = TOTAL; TOTAL += DUR[k] || 5; KI.push(PH_END[k]); KT.push(TOTAL);
      PHS.push({ name: NAMES[k] || 'Pass ' + (k + 1), no: NOS[k] || '', kind: KINDS[k] || 'round', a: k ? PH_END[k - 1] : 0, b: PH_END[k], t0: t0, t1: TOTAL, iw: ICONW[k] || 5 });
    }
  })();
  function sched(t) {
    if (t <= 0) return 0;
    var n = KT.length - 1; if (t >= KT[n]) return N;
    var i = 0; while (t > KT[i + 1]) i++;
    var f = (t - KT[i]) / (KT[i + 1] - KT[i]), a = KI[i], b = KI[i + 1];
    return a < 1 ? b * Math.pow(f, 1.3) : a * Math.pow(b / a, f);
  }
  function inv(p) {
    if (p <= 0) return 0; if (p >= N) return TOTAL;
    var i = 0; while (p > KI[i + 1]) i++;
    var a = KI[i], b = KI[i + 1];
    var f = a < 1 ? Math.pow(p / b, 1 / 1.3) : Math.log(p / a) / Math.log(b / a);
    return KT[i] + f * (KT[i + 1] - KT[i]);
  }
  function phaseOf(p) { var k = 0; while (k < NPH - 1 && p >= PH_END[k]) k++; return k; }

  // ---- elements, state -----------------------------------------------------------
  var stage = $('stage'), cv = $('p'), ctx = cv.getContext('2d'), ov = $('o'), og = ov.getContext('2d');
  var lc = $('loupe'), lg = lc.getContext('2d');
  var U = 1, dpr = 1, S = 0, B, C, Hb, img, px8, PW = 0, PH = 0;
  var pos = 0, clock = -0.9, playing = true, speed = 1, seekTo = -1, lit = false;
  var curI = -1, doneT = 0;                       // stroke under the brush, how much of it is laid
  var dx0 = 1e9, dy0 = 1e9, dx1 = -1, dy1 = -1;   // dirty rect
  var rect = { left: 0, top: 0, k: 1 }, compactNow = false;

  function layout() {
    var vw = innerWidth, vh = innerHeight, compact = vw / vh < 1.3;
    document.body.classList.toggle('compact', compact); compactNow = compact;
    var dw = compact ? 760 : 1920, dh = 1080;
    U = Math.min(vw / dw, vh / dh);
    stage.style.width = dw + 'px';
    stage.style.transform = 'translate(' + ((vw - dw * U) / 2) + 'px,' + ((vh - dh * U) / 2) + 'px) scale(' + U + ')';
    dpr = Math.min(3, window.devicePixelRatio || 1);
    ov.width = Math.round(vw * dpr); ov.height = Math.round(vh * dpr);
    var r = cv.getBoundingClientRect(); rect.left = r.left; rect.top = r.top; rect.k = r.width / W;
    var want = clamp(r.height * dpr / H, 1, 2.6);
    if (!S || want > S * 1.12 || want < S * 0.5) build(want);
    sizeAux();
  }
  function build(scale) {
    var keep = seekTo >= 0 ? seekTo : pos;
    S = scale; B = Brush(W, H, S); PW = B.PW; PH = B.PH;
    cv.width = PW; cv.height = PH;
    C = new Float32Array(PW * PH * 3); Hb = new Float32Array(PW * PH);
    img = ctx.createImageData(PW, PH); px8 = img.data;
    for (var i = 3; i < px8.length; i += 4) px8[i] = 255;
    wipe();
    if (keep > 0) seekTo = keep;
  }
  function wipe() {
    for (var i = 0, n = PW * PH * 3; i < n; i += 3) { C[i] = GESSO[0]; C[i + 1] = GESSO[1]; C[i + 2] = GESSO[2]; }
    Hb.fill(0);
    pos = 0; curI = -1; doneT = 0; dx0 = 0; dy0 = 0; dx1 = PW; dy1 = PH;
  }
  // float canvas -> screen. With raking light on, the paint's relief is lit
  // from the upper left; the colours underneath are never changed by it.
  function flush() {
    if (dx1 <= dx0 || dy1 <= dy0) return;
    var x0 = dx0, y0 = dy0, x1 = dx1, y1 = dy1, x, y, i, j, k;
    if (!lit) {
      for (y = y0; y < y1; y++) {
        j = (y * PW + x0) * 3; k = (y * PW + x0) * 4;
        for (x = x0; x < x1; x++, j += 3, k += 4) { px8[k] = C[j]; px8[k + 1] = C[j + 1]; px8[k + 2] = C[j + 2]; }
      }
    } else {
      if (x0 > 0) x0--; if (y0 > 0) y0--; if (x1 < PW) x1++; if (y1 < PH) y1++;
      var gain = S * 0.12;
      for (y = y0; y < y1; y++) {
        var up = y > 0 ? PW : 0, dn = y < PH - 1 ? PW : 0;
        i = y * PW + x0; j = i * 3; k = i * 4;
        for (x = x0; x < x1; x++, i++, j += 3, k += 4) {
          var d = ((Hb[i + (x < PW - 1 ? 1 : 0)] - Hb[i - (x > 0 ? 1 : 0)]) * 0.55 + (Hb[i + dn] - Hb[i - up]) * 0.83) * gain;
          var sh = 1 + (d > 0.22 ? 0.22 : d < -0.2 ? -0.2 : d), sp = d > 0.1 ? (d - 0.1) * (d - 0.1) * 260 : 0;
          if (sp > 14) sp = 14;
          px8[k] = C[j] * sh + sp; px8[k + 1] = C[j + 1] * sh + sp; px8[k + 2] = C[j + 2] * sh + sp * 0.9;
        }
      }
    }
    ctx.putImageData(img, 0, 0, x0, y0, x1 - x0, y1 - y0);
    dx0 = dy0 = 1e9; dx1 = dy1 = -1;
  }

  function paintPart(i, tA, tB) {
    B.paint(C, SX[i], SY[i], SA[i], SL[i], SW[i], SB[i], SO[i], i, SC[i * 3], SC[i * 3 + 1], SC[i * 3 + 2], tA, tB, Hb);
    if (B.w > 0) {
      if (B.x0 < dx0) dx0 = B.x0; if (B.y0 < dy0) dy0 = B.y0;
      if (B.x0 + B.w > dx1) dx1 = B.x0 + B.w; if (B.y0 + B.h > dy1) dy1 = B.y0 + B.h;
    }
  }
  // Paint forward to stroke position target (whole strokes + a fraction).
  // travel is the share of each stroke's time the brush spends in the air
  // getting there; the rest of the time it is dragged along the stroke.
  function advance(target, budget, travel) {
    var t0 = performance.now(), n = 0;
    if (target > N) target = N;
    while (pos < target) {
      var i = Math.floor(pos), f = pos - i, e = target < i + 1 ? target - i : 1;
      if (e < 1 && e - f < 1e-6) break;        // nothing worth a paint call; a whole stroke always finishes
      if (i !== curI) { curI = i; doneT = 0; }
      var tB = e >= 1 ? 1 : e <= travel ? 0 : (e - travel) / (1 - travel);
      if (tB > doneT) { paintPart(i, doneT, tB); doneT = tB; }
      pos = e >= 1 ? i + 1 : i + e;
      if ((SW[i] > 8 || (++n & 31) === 0) && performance.now() - t0 > budget) break;
    }
  }

  // ---- the brush you see --------------------------------------------------------
  var P = [0, 0];
  function strokePoint(i, t) {
    var c = Math.cos(SA[i]), s = Math.sin(SA[i]), q = 2 * t - 1;
    var u = (t - 0.5) * SL[i], v = SB[i] * SL[i] * 0.5 * (1 - q * q);
    P[0] = SX[i] + c * u - s * v; P[1] = SY[i] + s * u + c * v;
  }
  var bv = { wx: W * 0.92, wy: H + 150, ang: 1.15, w: 30, lift: 1, press: 0, bend: 0, alpha: 0 };
  function brushFrame(dt, travel, rate) {
    og.setTransform(1, 0, 0, 1, 0, 0); og.clearRect(0, 0, ov.width, ov.height);
    var done = pos >= N, busy = !done && (playing || seekTo >= 0);
    var fa = 1 - Math.exp(-dt * (done ? 3 : 8));
    bv.alpha += (((done || (!busy && compactNow)) ? 0 : 1) - bv.alpha) * fa;
    var i = Math.min(N - 1, Math.floor(pos)), f = done ? 1 : pos - i;
    var c = Math.cos(SA[i]), s = Math.sin(SA[i]);
    var tx, ty, lift = 0, press = 0, t = i === curI ? doneT : 0;
    if (clock < 0 && pos === 0) {                               // waiting at the edge of the panel
      tx = W * 0.86; ty = H + 110; lift = 1;
    } else if (travel > 0 && f < travel && seekTo < 0) {        // in the air, on the way to the next stroke
      var uu = f / travel, e = uu * uu * (3 - 2 * uu), ax, ay;
      if (i > 0) { strokePoint(i - 1, 1); ax = P[0]; ay = P[1]; } else { ax = W * 0.86; ay = H + 110; }
      strokePoint(i, 0);
      var dd = Math.sqrt((P[0] - ax) * (P[0] - ax) + (P[1] - ay) * (P[1] - ay));
      tx = ax + (P[0] - ax) * e; ty = ay + (P[1] - ay) * e;
      lift = Math.sin(Math.PI * uu) * clamp(dd / 140, 0.3, 1);
    } else {                                                    // on the panel, dragging
      strokePoint(i, t); tx = P[0]; ty = P[1];
      press = t <= 0 ? 0.2 : Math.min(1, 0.3 + 3.2 * t * (1 - t));
    }
    var fast = sm(14, 70, rate), follow = 1 - Math.pow(fast * 0.66, dt * 60);
    if (!busy && !done) { lift = Math.max(lift, 0.75); press = 0; }          // paused: held off the panel
    lift = Math.max(lift, 0.2 * fast); press *= 1 - 0.5 * fast;
    if (done) { tx = W * 0.9; ty = H + 160; lift = 1; follow = 1 - Math.exp(-dt * 2.2); }
    bv.wx += (tx - bv.wx) * follow; bv.wy += (ty - bv.wy) * follow;
    var k2 = 1 - Math.exp(-dt * 10);
    bv.lift += (lift - bv.lift) * (1 - Math.exp(-dt * 16)); bv.press += (press - bv.press) * (1 - Math.exp(-dt * 18));
    var want = Math.atan2(0.92 + s * 0.3, 0.4 + c * 0.3), da = want - bv.ang;
    while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    bv.ang += da * k2;
    var lag = -(-Math.sin(bv.ang) * c + Math.cos(bv.ang) * s) * bv.press;
    bv.bend += (lag - bv.bend) * k2;
    var tw = clamp(SW[i] * rect.k, 3.4 * U, 100 * U); bv.w += (tw - bv.w) * (1 - Math.exp(-dt * 6));
    if (bv.alpha < 0.01) return;
    drawBrushTool(og, {
      x: rect.left + bv.wx * rect.k - 5 * U * bv.lift, y: rect.top + bv.wy * rect.k - 16 * U * bv.lift,
      ang: bv.ang, w: bv.w * (1 + 0.07 * bv.lift), u: U, dpr: dpr, press: bv.press, bend: bv.bend, lift: bv.lift,
      col: [SC[i * 3], SC[i * 3 + 1], SC[i * 3 + 2]], load: 1 - 0.55 * t, no: PHS[phaseOf(pos)].no, kind: PHS[phaseOf(pos)].kind, alpha: bv.alpha, shadow: true
    });
  }
  function reticle(half) {                      // where the loupe is looking
    og.setTransform(dpr, 0, 0, dpr, 0, 0);
    var x = rect.left + lp.cx * rect.k, y = rect.top + lp.cy * rect.k, r = half * rect.k;
    og.beginPath(); og.arc(x, y, r + 1, 0, 6.2832); og.strokeStyle = 'rgba(0,0,0,.55)'; og.lineWidth = 2.5; og.stroke();
    og.beginPath(); og.arc(x, y, r + 1, 0, 6.2832); og.strokeStyle = 'rgba(240,226,186,.95)'; og.lineWidth = 1; og.stroke();
    og.setTransform(1, 0, 0, 1, 0, 0);
  }

  // ---- loupe -------------------------------------------------------------------
  // While the brush is working it magnifies the live pixels around the tip.
  // When the panel is still (paused or finished) it does something a photo
  // cannot: it throws the pixels away and repaints that spot from the stroke
  // list at the loupe's own scale.
  var LP = 0, limg, lpx, Bz, Cz;
  var lp = { cx: 300, cy: 240, zi: 6, key: '', keyT: 0, job: null, sharp: false, cap: '', used: 0 };
  var mouse = { on: false, wx: 0, wy: 0 };
  function loupeBilinear(cx, cy, half) {
    var step = 2 * half / LP, x0w = cx - half, y0w = cy - half, k = 0;
    for (var iy = 0; iy < LP; iy++) {
      var wy = y0w + (iy + 0.5) * step, fy = wy * S - 0.5;
      var yy = Math.floor(fy), ay = fy - yy; if (yy < 0) { yy = 0; ay = 0; } if (yy > PH - 2) { yy = PH - 2; ay = 1; }
      for (var ix = 0; ix < LP; ix++, k += 4) {
        var wx = x0w + (ix + 0.5) * step;
        if (wx < 0 || wx >= W || wy < 0 || wy >= H) { lpx[k] = 30; lpx[k + 1] = 21; lpx[k + 2] = 12; continue; }
        var fx = wx * S - 0.5, xx = Math.floor(fx), ax = fx - xx; if (xx < 0) { xx = 0; ax = 0; } if (xx > PW - 2) { xx = PW - 2; ax = 1; }
        var j = (yy * PW + xx) * 3, j2 = j + PW * 3, w00 = (1 - ax) * (1 - ay), w10 = ax * (1 - ay), w01 = (1 - ax) * ay, w11 = ax * ay;
        lpx[k] = C[j] * w00 + C[j + 3] * w10 + C[j2] * w01 + C[j2 + 3] * w11;
        lpx[k + 1] = C[j + 1] * w00 + C[j + 4] * w10 + C[j2 + 1] * w01 + C[j2 + 4] * w11;
        lpx[k + 2] = C[j + 2] * w00 + C[j + 5] * w10 + C[j2 + 2] * w01 + C[j2 + 5] * w11;
      }
    }
    lg.putImageData(limg, 0, 0);
  }
  function jobStart(cx, cy, half) {
    var Sz = LP / (2 * half), ox = Math.round((cx - half) * Sz), oy = Math.round((cy - half) * Sz);
    Bz.view(Sz, ox, oy);
    for (var i = 0, n = LP * LP * 3; i < n; i += 3) { Cz[i] = GESSO[0]; Cz[i + 1] = GESSO[1]; Cz[i + 2] = GESSO[2]; }
    lp.job = { i: 0, upto: Math.min(N, Math.floor(pos)), part: curI === Math.floor(pos) ? doneT : 0, Sz: Sz, ox: ox, oy: oy,
               x0: cx - half, y0: cy - half, x1: cx + half, y1: cy + half, used: 0 };
  }
  // Repaint one stroke into the loupe window; true if it actually laid paint there.
  function jobPaint(i, tB) { Bz.paint(Cz, SX[i], SY[i], SA[i], SL[i], SW[i], SB[i], SO[i], i, SC[i * 3], SC[i * 3 + 1], SC[i * 3 + 2], 0, tB); return Bz.laid > 0; }
  function jobStep(budget) {
    var j = lp.job, t0 = performance.now(), n = 0;
    for (; j.i < j.upto; j.i++) {
      var i = j.i, r = SL[i] * 0.68 + SW[i] * 0.5 + 3;
      if (SX[i] + r < j.x0 || SX[i] - r > j.x1 || SY[i] + r < j.y0 || SY[i] - r > j.y1) continue;
      if (jobPaint(i, 1)) j.used++;
      if ((++n & 3) === 0 && performance.now() - t0 > budget) { j.i++; return false; }
    }
    if (j.part > 0 && j.upto < N && jobPaint(j.upto, j.part)) j.used++;
    for (var y = 0, k = 0, q = 0; y < LP; y++) {
      var wy = (j.oy + y + 0.5) / j.Sz;
      for (var x = 0; x < LP; x++, k += 4, q += 3) {
        var wx = (j.ox + x + 0.5) / j.Sz;
        if (wx < 0 || wx >= W || wy < 0 || wy >= H) { lpx[k] = 30; lpx[k + 1] = 21; lpx[k + 2] = 12; }
        else { lpx[k] = Cz[q]; lpx[k + 1] = Cz[q + 1]; lpx[k + 2] = Cz[q + 2]; }
      }
    }
    lg.putImageData(limg, 0, 0);
    return true;
  }
  var capEl = $('loupeCap');
  function loupeFrame(dt, still, now) {
    if (compactNow) return;                    // the loupe is not on screen
    var inspect = mouse.on, zoom = inspect ? lp.zi : 4, cap;
    if (inspect) { lp.cx = mouse.wx; lp.cy = mouse.wy; }
    else {
      var gx = pos >= N ? 268 : bv.wx, gy = pos >= N ? 238 : bv.wy, e = 1 - Math.exp(-dt * (pos >= N ? 2.5 : 7));
      lp.cx += (clamp(gx, 0, W) - lp.cx) * e; lp.cy += (clamp(gy, 0, H) - lp.cy) * e;
    }
    var half = 296 / zoom / DISP / 2;
    var zs = '×' + (zoom >= 10 ? zoom.toFixed(0) : zoom.toFixed(1).replace('.0', ''));
    if (!still) {
      lp.key = ''; lp.job = null; lp.sharp = false;
      loupeBilinear(lp.cx, lp.cy, half);
      cap = inspect ? zs + ' · live pixels — pause to repaint this spot from the strokes' : zs + ' · following the brush';
    } else {
      var key = Math.round(lp.cx * 8) + ',' + Math.round(lp.cy * 8) + ',' + zoom.toFixed(2) + ',' + pos.toFixed(3) + ',' + S.toFixed(3) + ',' + LP;
      if (key !== lp.key) { lp.key = key; lp.keyT = now; lp.job = null; lp.sharp = false; loupeBilinear(lp.cx, lp.cy, half); }
      else if (!lp.sharp) {
        if (!lp.job && (SYNC || now - lp.keyT > 90)) jobStart(lp.cx, lp.cy, half);
        if (lp.job) { if (jobStep(SYNC ? 1e9 : 9)) { lp.sharp = true; lp.used = lp.job.used; lp.job = null; } }
      }
      cap = lp.sharp ? zs + ' · repainted from ' + fmt(lp.used) + ' strokes, not enlarged pixels' : zs + ' · repainting from the strokes…';
    }
    if (cap !== lp.cap) { lp.cap = cap; capEl.textContent = cap; }
    if (inspect) reticle(half);
  }

  // ---- palette: the pigments the strokes actually use --------------------------
  var PIG = [['lead white', 236, 230, 214], ['Naples yellow', 226, 196, 128], ['flesh ochre', 214, 170, 120], ['yellow ochre', 198, 152, 74],
    ['raw sienna', 166, 116, 58], ['burnt sienna', 128, 72, 42], ['raw umber', 112, 90, 62], ['burnt umber', 78, 52, 34],
    ['Van Dyke brown', 56, 42, 30], ['bone black', 30, 26, 24], ['green earth', 104, 118, 92], ['verdigris', 84, 128, 112],
    ['azurite', 70, 98, 128], ['smalt grey', 126, 134, 132], ['slate', 70, 76, 74], ['olive earth', 88, 84, 50],
    ['vermilion', 190, 72, 48], ['red lake', 124, 40, 40], ['lead-tin yellow', 232, 214, 150], ['ash grey', 168, 166, 152]];
  function pigment(r, g, b) {
    var best = 0, bd = 1e9;
    for (var i = 0; i < PIG.length; i++) { var p = PIG[i], d = (p[1] - r) * (p[1] - r) + (p[2] - g) * (p[2] - g) + (p[3] - b) * (p[3] - b); if (d < bd) { bd = d; best = i; } }
    return PIG[best][0];
  }
  function hex(r, g, b) { return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1).toUpperCase(); }
  var PAL = (function (K) {                    // weighted k-means over the stroke colours
    var M = Math.min(N, 8000), idx = [], w = [], i, j, k, it;
    var mr = 0, mg = 0, mb = 0, ws = 0;
    for (j = 0; j < M; j++) { i = Math.floor(j * N / M); idx.push(i); var a = SL[i] * SW[i] * SO[i]; w.push(a); mr += SC[i * 3] * a; mg += SC[i * 3 + 1] * a; mb += SC[i * 3 + 2] * a; ws += a; }
    var cen = [[mr / ws, mg / ws, mb / ws]], md = new Float64Array(M).fill(1e12);
    while (cen.length < K) {                   // spread the first guesses out
      var c = cen[cen.length - 1], bj = 0, bv2 = -1;
      for (j = 0; j < M; j++) {
        i = idx[j] * 3; var d = (SC[i] - c[0]) * (SC[i] - c[0]) + (SC[i + 1] - c[1]) * (SC[i + 1] - c[1]) + (SC[i + 2] - c[2]) * (SC[i + 2] - c[2]);
        if (d < md[j]) md[j] = d; var sc = md[j] * Math.pow(w[j], 0.3); if (sc > bv2) { bv2 = sc; bj = j; }
      }
      i = idx[bj] * 3; cen.push([SC[i], SC[i + 1], SC[i + 2]]);
    }
    var wt = [];
    for (it = 0; it < 10; it++) {
      var acc = []; for (k = 0; k < K; k++) acc.push([0, 0, 0, 0]);
      for (j = 0; j < M; j++) {
        i = idx[j] * 3; var bk = 0, bd = 1e12;
        for (k = 0; k < K; k++) { var e = cen[k], dd = (SC[i] - e[0]) * (SC[i] - e[0]) + (SC[i + 1] - e[1]) * (SC[i + 1] - e[1]) + (SC[i + 2] - e[2]) * (SC[i + 2] - e[2]); if (dd < bd) { bd = dd; bk = k; } }
        var q = acc[bk]; q[0] += SC[i] * w[j]; q[1] += SC[i + 1] * w[j]; q[2] += SC[i + 2] * w[j]; q[3] += w[j];
      }
      for (k = 0; k < K; k++) if (acc[k][3] > 0) cen[k] = [acc[k][0] / acc[k][3], acc[k][1] / acc[k][3], acc[k][2] / acc[k][3]];
      wt = acc.map(function (q) { return q[3]; });
    }
    var out = cen.map(function (c, k) { return { r: Math.round(c[0]), g: Math.round(c[1]), b: Math.round(c[2]), w: wt[k] }; });
    out.sort(function (a, b) { return (b.r * 0.3 + b.g * 0.59 + b.b * 0.11) - (a.r * 0.3 + a.g * 0.59 + a.b * 0.11); });
    var wm = 0; out.forEach(function (p) { if (p.w > wm) wm = p.w; });
    out.forEach(function (p, k) { p.x = 116 + k * (320 / (K - 1)); p.y = 50 + 9 * Math.sin(k * 1.3 + 0.5); p.rad = 11 + 6 * Math.sqrt(p.w / wm); p.name = pigment(p.r, p.g, p.b); });
    return out;
  })(9);
  var pal0 = $('pal0'), pal1 = $('pal1'), pg0 = pal0.getContext('2d'), pg1 = pal1.getContext('2d'), PS = 0;
  var mix = { slots: [], n: 0, last: [-99, -99, -99], lastT: 0, active: -1, dirty: true, col: null };
  function blob(g, x, y, r, seed) {
    var n = 11, pts = [], i;
    for (i = 0; i < n; i++) { var a = i / n * 6.2832, rr = r * (0.84 + 0.3 * hsh(seed * 31 + i)); pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]); }
    g.beginPath();
    g.moveTo((pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2);
    for (i = 0; i < n; i++) { var p = pts[i], q = pts[(i + 1) % n]; g.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2); }
    g.closePath();
  }
  function boardPath(g) {
    g.beginPath(); g.moveTo(40, 152);
    g.bezierCurveTo(0, 112, 18, 32, 122, 22); g.bezierCurveTo(232, 8, 404, 6, 472, 40);
    g.bezierCurveTo(524, 66, 514, 152, 450, 178); g.bezierCurveTo(380, 204, 300, 190, 250, 188);
    g.bezierCurveTo(200, 186, 190, 152, 150, 162); g.bezierCurveTo(110, 174, 70, 178, 40, 152); g.closePath();
  }
  function paletteStatic() {
    var g = pg0; g.setTransform(PS, 0, 0, PS, 0, 0); g.clearRect(0, 0, 516, 206);
    g.save(); g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 20 * PS; g.shadowOffsetY = 9 * PS;
    var gr = g.createLinearGradient(30, 10, 480, 200);
    gr.addColorStop(0, '#c2925b'); gr.addColorStop(0.5, '#96683a'); gr.addColorStop(1, '#6b4523');
    g.fillStyle = gr; boardPath(g); g.fill(); g.restore();
    g.save(); boardPath(g); g.clip();
    for (var i = 0; i < 22; i++) {            // wood grain
      var y = 8 + i * 9.4 + 5 * hsh(i * 7 + 1);
      g.strokeStyle = 'rgba(52,28,8,' + (0.05 + 0.1 * hsh(i * 13 + 5)) + ')'; g.lineWidth = 0.6 + 1.4 * hsh(i * 3 + 9);
      g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(140, y + 10 * hsh(i + 40) - 5, 330, y + 14 * hsh(i + 80) - 7, 520, y + 8 * hsh(i + 120) - 4); g.stroke();
    }
    g.restore();
    g.strokeStyle = 'rgba(255,232,186,.3)'; g.lineWidth = 1; boardPath(g); g.stroke();
    g.save(); g.translate(112, 122); g.rotate(-0.32);                       // thumb hole
    g.beginPath(); g.ellipse(0, 0, 25, 17, 0, 0, 6.2832); g.fillStyle = '#120d08'; g.fill();
    g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 2; g.stroke();
    g.beginPath(); g.ellipse(0, 1.5, 25, 17, 0, 0.2, 2.9); g.strokeStyle = 'rgba(255,226,170,.28)'; g.lineWidth = 1; g.stroke(); g.restore();
    PAL.forEach(function (p, k) {                                           // the piles
      g.save(); g.shadowColor = 'rgba(30,14,4,.55)'; g.shadowBlur = 5 * PS; g.shadowOffsetY = 2.5 * PS;
      var c = g.createRadialGradient(p.x - p.rad * 0.35, p.y - p.rad * 0.4, p.rad * 0.1, p.x, p.y, p.rad * 1.15);
      c.addColorStop(0, 'rgb(' + Math.min(255, p.r * 1.22 + 14) + ',' + Math.min(255, p.g * 1.22 + 14) + ',' + Math.min(255, p.b * 1.22 + 14) + ')');
      c.addColorStop(0.5, 'rgb(' + p.r + ',' + p.g + ',' + p.b + ')');
      c.addColorStop(1, 'rgb(' + Math.round(p.r * 0.72) + ',' + Math.round(p.g * 0.72) + ',' + Math.round(p.b * 0.72) + ')');
      g.fillStyle = c; blob(g, p.x, p.y, p.rad, k + 3); g.fill(); g.restore();
      g.strokeStyle = 'rgba(255,255,255,.34)'; g.lineWidth = 1.3; g.lineCap = 'round';
      g.beginPath(); g.arc(p.x, p.y, p.rad * 0.58, 3.5, 4.5); g.stroke();
    });
  }
  function paletteDynamic() {
    var g = pg1; g.setTransform(PS, 0, 0, PS, 0, 0); g.clearRect(0, 0, 516, 206);
    mix.slots.forEach(function (m) {                                        // where the colours got mixed
      g.save(); g.translate(m.x, m.y); g.rotate(m.a); g.scale(1.9, 0.78);
      g.fillStyle = 'rgba(' + m.c[0] + ',' + m.c[1] + ',' + m.c[2] + ',.93)'; blob(g, 0, 0, m.r, m.s); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.13)'; g.lineWidth = 1.1;
      g.beginPath(); g.moveTo(-m.r * 0.6, -m.r * 0.25); g.quadraticCurveTo(0, -m.r * 0.5, m.r * 0.6, -m.r * 0.2); g.stroke();
      g.strokeStyle = 'rgba(0,0,0,.14)'; g.beginPath(); g.moveTo(-m.r * 0.5, m.r * 0.2); g.quadraticCurveTo(0, m.r * 0.42, m.r * 0.55, m.r * 0.18); g.stroke();
      g.restore();
    });
    if (mix.active >= 0) {
      var p = PAL[mix.active];
      g.beginPath(); g.arc(p.x, p.y, p.rad + 3.5, 0, 6.2832); g.strokeStyle = 'rgba(240,226,186,.95)'; g.lineWidth = 1.3; g.stroke();
      g.beginPath(); g.moveTo(p.x, p.y + p.rad + 9); g.lineTo(p.x - 3.5, p.y + p.rad + 15); g.lineTo(p.x + 3.5, p.y + p.rad + 15); g.closePath(); g.fillStyle = 'rgba(240,226,186,.95)'; g.fill();
    }
  }
  var chip = $('chip'), capText = document.createTextNode('');
  $('palCap').appendChild(capText);
  function paletteFrame(now) {
    if (pos >= N) {                             // brush is down: nothing is "on the brush" any more
      if (mix.active >= 0) { mix.active = -1; mix.last = [-99, -99, -99]; mix.dirty = true; chip.style.display = 'none'; capText.nodeValue = PAL.length + ' pigments, ' + fmt(N) + ' strokes'; }
      if (mix.dirty) { mix.dirty = false; paletteDynamic(); }
      return;
    }
    if (curI >= 0) {
      var r = SC[curI * 3], g = SC[curI * 3 + 1], b = SC[curI * 3 + 2], l = mix.last;
      var d = (r - l[0]) * (r - l[0]) + (g - l[1]) * (g - l[1]) + (b - l[2]) * (b - l[2]);
      if (d > 500 && now - mix.lastT > 130) {
        mix.last = [r, g, b]; mix.lastT = now;
        var n = mix.n++, slot = n % 8;
        mix.slots[slot] = { c: [r, g, b], x: 318 + (hsh(n * 5 + 1) - 0.5) * 120, y: 130 + (hsh(n * 5 + 2) - 0.5) * 44, a: (hsh(n * 5 + 3) - 0.5) * 0.9, r: 13 + 8 * hsh(n * 5 + 4), s: n };
        var best = 0, bd = 1e9;
        PAL.forEach(function (p, k) { var e = (p.r - r) * (p.r - r) + (p.g - g) * (p.g - g) + (p.b - b) * (p.b - b); if (e < bd) { bd = e; best = k; } });
        mix.active = best; mix.dirty = true;
        drawRow(phaseOf(pos), [r, g, b]);       // the brush in the rack shows the colour it is carrying
        chip.style.backgroundColor = hex(r, g, b); chip.style.display = 'inline-block';
        capText.nodeValue = 'on the brush ' + hex(r, g, b) + ' \u00b7 nearest pigment: ' + pigment(r, g, b);
      }
    } else if (mix.slots.length || mix.active >= 0) { mix.slots = []; mix.n = 0; mix.active = -1; mix.last = [-99, -99, -99]; mix.dirty = true; chip.style.display = 'none'; capText.nodeValue = PAL.length + ' pigments found in the strokes'; }
    if (mix.dirty) { mix.dirty = false; paletteDynamic(); }
  }

  // ---- brush rack (left) and timeline (bottom) ----------------------------------
  var rows = [], tlbs = [];
  (function () {
    var host = $('rows'), tl = $('tl');
    function mk(tag, cls, text) { var e = document.createElement(tag); e.className = cls; if (text) e.textContent = text; return e; }
    PHS.forEach(function (ph, k) {
      var mr = 0, mg = 0, mb = 0, ws = 0;
      for (var i = ph.a; i < ph.b; i++) { var a = SL[i] * SW[i]; mr += SC[i * 3] * a; mg += SC[i * 3 + 1] * a; mb += SC[i * 3 + 2] * a; ws += a; }
      ph.col = [Math.round(mr / ws), Math.round(mg / ws), Math.round(mb / ws)];
      var el = document.createElement('div'); el.className = 'row';
      var ic = document.createElement('canvas'), nm = mk('div', 'nm'), ck = mk('span', 'ck', '\u2713'), mt = mk('div', 'mt'), pg = mk('div', 'pg');
      nm.appendChild(ck); nm.appendChild(document.createTextNode(ph.name));
      mt.appendChild(document.createTextNode('No. ' + ph.no + ' ' + ph.kind)); mt.appendChild(document.createElement('br'));
      mt.appendChild(document.createTextNode(fmt(ph.b - ph.a) + ' strokes'));
      el.appendChild(ic); el.appendChild(nm); el.appendChild(mt); el.appendChild(pg);
      host.appendChild(el);
      rows.push({ el: el, cv: el.firstChild, pg: el.lastChild, cls: '', w: -1 });
      if (k < NPH - 1) { var t = document.createElement('div'); t.className = 'tick'; t.style.left = (ph.t1 / TOTAL * 100) + '%'; tl.appendChild(t); }
      var lb = document.createElement('div'); lb.className = 'tlb'; lb.textContent = ph.name; lb.style.left = 'calc(' + (ph.t0 / TOTAL * 100) + '% + ' + (k ? 8 : 0) + 'px)'; tl.appendChild(lb);
      tlbs.push(lb);
    });
  })();
  function drawRow(k, col) {
    var r = rows[k], ph = PHS[k], g = r.cv.getContext('2d'), u = 0.5, w = ph.iw;
    r.cv.width = Math.round(150 * PS); r.cv.height = Math.round(30 * PS);
    drawBrushTool(g, { x: 5, y: 15, ang: 0, w: w, u: u, dpr: PS, col: col, load: 0.8, kind: ph.kind, len: 96, no: '', alpha: 1, shadow: false });
  }
  function sizeAux() {
    var n = clamp(Math.round(296 * U * dpr), 120, 640);
    if (n !== LP) {
      LP = n; lc.width = lc.height = n; limg = lg.createImageData(n, n); lpx = limg.data;
      for (var i = 3; i < lpx.length; i += 4) lpx[i] = 255;
      Bz = Brush(W, H, 1, { x: 0, y: 0, w: n, h: n }); Cz = new Float32Array(n * n * 3);
      lp.key = ''; lp.job = null; lp.sharp = false;
    }
    var ps = clamp(U * dpr, 0.5, 3);
    if (ps !== PS) {
      PS = ps; pal0.width = pal1.width = Math.round(516 * PS); pal0.height = pal1.height = Math.round(206 * PS);
      paletteStatic(); mix.dirty = true;
      for (var k = 0; k < NPH; k++) drawRow(k, PHS[k].col);
    }
    var gc = $('grain'), gw = Math.max(1, Math.round(innerWidth / 2)), gh = Math.max(1, Math.round(innerHeight / 2));
    if (gc.width !== gw || gc.height !== gh) {              // a little tooth on the wall
      gc.width = gw; gc.height = gh;
      var gx = gc.getContext('2d'), gi = gx.createImageData(gw, gh), gd = gi.data;
      for (var q = 0; q < gd.length; q += 4) { var v = hsh(q + 17) > 0.5 ? 255 : 0; gd[q] = gd[q + 1] = gd[q + 2] = v; gd[q + 3] = hsh(q * 3 + 5) * 11; }
      gx.putImageData(gi, 0, 0);
    }
  }

  // ---- sound: a bristle swish per stroke, synthesised from noise -----------------
  var AC = null, noise = null, master = null, sndOn = false, lastSw = 0, swI = -1;
  function soundToggle() {
    if (!AC) {
      var A = window.AudioContext || window.webkitAudioContext; if (!A) return;
      AC = new A(); noise = AC.createBuffer(1, Math.floor(AC.sampleRate * 1.5), AC.sampleRate);
      var d = noise.getChannelData(0), b = 0;
      for (var i = 0; i < d.length; i++) { var wn = Math.random() * 2 - 1; b = 0.86 * b + 0.14 * wn; d[i] = wn * 0.55 + b * 1.6; }
      master = AC.createGain(); master.gain.value = 0.5; master.connect(AC.destination);
    }
    sndOn = !sndOn; if (sndOn && AC.state === 'suspended') AC.resume();
    $('bSound').className = sndOn ? 'on' : '';
  }
  function swish(i, dur) {
    var t = AC.currentTime, wd = SW[i], nz = AC.createBufferSource(), bp = AC.createBiquadFilter(), g = AC.createGain();
    nz.buffer = noise; nz.loop = true; nz.playbackRate.value = 0.75 + Math.random() * 0.5;
    var f = clamp(5600 / Math.pow(Math.max(1, wd), 0.45), 500, 6000);
    bp.type = 'bandpass'; bp.Q.value = 0.8; bp.frequency.setValueAtTime(f * 1.25, t); bp.frequency.exponentialRampToValueAtTime(f * 0.7, t + dur);
    var vol = 0.035 + 0.16 * sm(1, 70, wd);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.04, dur * 0.3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    nz.connect(bp); bp.connect(g);
    if (AC.createStereoPanner) { var pn = AC.createStereoPanner(); pn.pan.value = clamp((SX[i] / W - 0.5) * 1.2, -1, 1); g.connect(pn); pn.connect(master); } else g.connect(master);
    nz.start(t, Math.random()); nz.stop(t + dur + 0.05);
  }
  function soundFrame(now, rate) {
    if (!sndOn || curI < 0 || curI === swI || doneT <= 0 || now - lastSw < 58) return;
    swI = curI; lastSw = now;
    swish(curI, clamp(0.75 / Math.max(1, rate), 0.06, 0.5));
  }

  // ---- readouts ---------------------------------------------------------------------
  var el = { stroke: $('vStroke'), rate: $('vRate'), brush: $('vBrush'), time: $('vTime'), fill: $('fill'), knob: $('knob'),
             play: $('bPlay'), speed: $('bSpeed'), end: $('bEnd'), light: $('bLight'), img: $('lImg'), req: $('lReq'), ext: $('lExt') };
  var txt = {}, rateS = 0, lastPos = 0, frameN = 0, doneShown = false, recI = -2, rec1 = $('rec1'), rec2 = $('rec2');
  function set(k, v) { if (txt[k] !== v) { txt[k] = v; el[k].textContent = v; } }
  function hud(dt) {
    var done = pos >= N, k = phaseOf(pos), ph = PHS[k];
    if (doneShown !== done) { doneShown = done; document.body.classList.toggle('done', done); }   // the picture light warms up
    if (recI !== curI) {                        // the record being painted right now: 12 bytes, and what they mean
      recI = curI;
      if (curI < 0) { rec1.textContent = '\u2014'; rec2.textContent = 'x, y, heading, length, width, bend, r, g, b, opacity'; }
      else {
        for (var hx = '', j = 0; j < 12; j++) hx += (j ? ' ' : '') + (256 + RAW[curI * 12 + j]).toString(16).slice(1);
        rec1.textContent = hx;
        rec2.textContent = 'x ' + SX[curI].toFixed(1) + '  y ' + SY[curI].toFixed(1) + '  ' + Math.round(SA[curI] * 57.2958) + '\u00b0  ' + SL[curI].toFixed(1) + ' \u00d7 ' + SW[curI].toFixed(1) +
          '  ' + hex(SC[curI * 3], SC[curI * 3 + 1], SC[curI * 3 + 2]) + '  ' + Math.round(SO[curI] * 100) + '%';
      }
    }
    var inst = dt > 0 ? Math.max(0, pos - lastPos) / dt : 0; lastPos = pos;
    rateS += (inst - rateS) * (1 - Math.exp(-dt * 5)); if (done) rateS = 0; else if (!playing && seekTo < 0) rateS *= 0.8;
    set('stroke', fmt(Math.floor(pos)));
    set('rate', rateS < 0.05 ? '0' : rateS < 20 ? rateS.toFixed(1) : fmt(Math.round(rateS)));
    set('brush', done ? 'laid down' : pos < 1e-9 ? 'bare panel' : 'No. ' + ph.no + ' ' + ph.kind);
    var tt = Math.floor(clamp(inv(pos), 0, TOTAL)); set('time', Math.floor(tt / 60) + ':' + ('0' + tt % 60).slice(-2));
    var fr = (clamp(inv(pos), 0, TOTAL) / TOTAL * 100).toFixed(2) + '%';
    if (txt.fr !== fr) { txt.fr = fr; el.fill.style.width = fr; el.knob.style.left = fr; }
    set('play', done ? 'again' : playing ? 'pause' : 'play');
    for (var i = 0; i < NPH; i++) {
      var r = rows[i], cls = done || i < k ? 'row done' : i === k && pos > 0 ? 'row cur' : 'row';
      if (r.cls !== cls) { r.cls = cls; r.el.className = cls; tlbs[i].className = i === k && !done && pos > 0 ? 'tlb cur' : 'tlb'; if (PS) drawRow(i, PHS[i].col); }
      var w = done || i < k ? 100 : i === k ? Math.round((pos - PHS[i].a) / (PHS[i].b - PHS[i].a) * 200) / 2 : 0;
      if (r.w !== w) { r.w = w; r.pg.style.width = w + '%'; }
    }
    if ((frameN++ % 40) === 0) {              // measured, not asserted
      set('img', String(document.images.length + document.querySelectorAll('picture,video,svg,image,object,embed,iframe').length));
      set('req', String(performance.getEntriesByType ? performance.getEntriesByType('resource').length : 0));
      set('ext', String(document.querySelectorAll('script[src],link[href]').length));
    }
  }

  // ---- the loop -------------------------------------------------------------------
  var last = performance.now();
  function frame(now) {
    var dt = Math.min(0.1, Math.max(0.001, (now - last) / 1000)); last = now;
    var rate = 0, travel = 0, was = pos;
    if (seekTo >= 0) {
      advance(seekTo, SYNC ? 1e9 : 26, 0); rate = 2000;
      if (pos >= seekTo - 1e-6) { clock = inv(pos); seekTo = -1; }
    } else if (playing && pos < N) {
      clock += dt * speed;
      rate = (sched(clock + 0.05) - sched(clock)) / 0.05 * speed;
      travel = 0.32 * (1 - sm(5, 20, rate));
      var tgt = sched(clock);
      advance(tgt, 11, travel);
      if (pos < tgt - 0.5) clock = inv(pos);        // the brush sets the pace, not the clock
    }
    var still = pos === was && seekTo < 0;
    flush();
    brushFrame(dt, travel, rate);
    loupeFrame(dt, still && (pos >= N || !playing), now);
    paletteFrame(now);
    if (pos !== was) soundFrame(now, rate);
    hud(dt);
    requestAnimationFrame(frame);
  }

  // ---- controls ---------------------------------------------------------------------
  function seek(p) {
    if (!(p >= 0)) return;
    p = clamp(p, 0, N);
    if (p < pos) wipe();
    if (p <= 0) { seekTo = -1; clock = 0; } else seekTo = p;
  }
  function replay() { wipe(); seekTo = -1; clock = -0.9; playing = true; bv.wx = W * 0.92; bv.wy = H + 150; bv.lift = 1; }
  function toggle() { if (pos >= N) replay(); else playing = !playing; }
  function cycle() { speed = speed === 1 ? 2 : speed === 2 ? 4 : speed === 4 ? 0.5 : 1; set('speed', (speed === 0.5 ? '½' : speed) + '×'); }
  function light(v) { lit = v === undefined ? !lit : !!v; el.light.className = lit ? 'on' : ''; dx0 = 0; dy0 = 0; dx1 = PW; dy1 = PH; }
  el.play.onclick = toggle; $('bReplay').onclick = replay; el.speed.onclick = cycle;
  el.end.onclick = function () { seek(N); }; el.light.onclick = function () { light(); }; $('bSound').onclick = soundToggle;
  addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    var k = e.key.toLowerCase();
    if (e.code === 'Space') { e.preventDefault(); toggle(); }
    else if (k === 'r') replay(); else if (k === 's') cycle(); else if (k === 'e') seek(N);
    else if (k === 'l') light(); else if (k === 'm') soundToggle();
  });
  var hit = $('hit'), drag = false;
  function scrub(e) { var r = $('track').getBoundingClientRect(); seek(sched(clamp((e.clientX - r.left) / r.width, 0, 1) * TOTAL)); }
  hit.addEventListener('pointerdown', function (e) { drag = true; if (hit.setPointerCapture) hit.setPointerCapture(e.pointerId); scrub(e); });
  hit.addEventListener('pointermove', function (e) { if (drag) scrub(e); });
  hit.addEventListener('pointerup', function () { drag = false; });
  hit.addEventListener('pointercancel', function () { drag = false; });
  cv.addEventListener('pointermove', function (e) { mouse.on = true; mouse.wx = (e.clientX - rect.left) / rect.k; mouse.wy = (e.clientY - rect.top) / rect.k; });
  cv.addEventListener('pointerleave', function () { mouse.on = false; });
  cv.addEventListener('wheel', function (e) { e.preventDefault(); lp.zi = clamp(lp.zi * Math.exp(-e.deltaY * 0.0022), 3, 60); }, { passive: false });
  var rz; addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(layout, 120); });

  // ---- go ----------------------------------------------------------------------------
  $('nStrokes').textContent = fmt(N);
  $('vOf').textContent = 'of ' + fmt(N);
  $('plateSub').textContent = 'after Leonardo da Vinci · ' + fmt(N) + ' strokes of JavaScript';
  capText.nodeValue = PAL.length + ' pigments found in the strokes';
  layout();
  if (/[?&]end\b/.test(QS)) seek(N);
  var m = /[?&]at=(\d+(?:\.\d+)?)/.exec(QS); if (m) { seek(+m[1]); playing = false; }
  if (/[?&]light\b/.test(QS)) light(true);
  window.__mona = {
    seek: seek, replay: replay, light: light,
    hover: function (wx, wy, zoom) { if (wx === undefined) { mouse.on = false; return; } mouse.on = true; mouse.wx = wx; mouse.wy = wy; if (zoom) lp.zi = clamp(zoom, 3, 60); },
    state: function () { return { pos: pos, N: N, S: S, PW: PW, PH: PH, clock: clock, playing: playing, U: U, dpr: dpr, LP: LP, sharp: lp.sharp, lit: lit }; },
    checksum: function () { var d = ctx.getImageData(0, 0, PW, PH).data, s = 0; for (var i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] * 3 + d[i + 2] * 7; return s; }
  };
  requestAnimationFrame(frame);
})();
