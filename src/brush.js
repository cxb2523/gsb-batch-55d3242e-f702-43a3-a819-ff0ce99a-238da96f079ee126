// brush.js — the paintbrush.
//
// One implementation, used by the painter (node) and by the page, so the page
// lays down exactly the strokes the painter judged. Everything is defined in
// "work" units (the painting is 600 x 894 work units), which makes a stroke a
// small vector shape: it can be rasterised at any pixel scale S, or into any
// window of the painting (that is how the loupe re-renders a detail at 30x).
//
// A stroke is: centre (cx,cy), heading ang, length L, width Wd, bend (how far
// the spine bows sideways, as a fraction of L), opacity op, and a seed that
// picks the hairs. The brush lays down:
//   - a spine that bows like a wrist turning (a parabola across the stroke),
//   - a body that lands round, bellies out under pressure and lifts to a point,
//   - hairs: clumps and single hairs, each a little lighter or darker than its
//     neighbour, that wander across the stroke as it is dragged,
//   - a paint load: the brush runs dry toward the lift, so hairs drop out and
//     the ground shows through the tail (how dry depends on the seed),
//   - relief: how thick the paint sits (ridges along the hairs, a lip at the
//     edges). The colour never depends on it; the page uses it for raking light.
(function (root) {
  'use strict';
  var TAB = 128;
  var tabA = new Float32Array(TAB), tabB = new Float32Array(TAB), tabS = new Float32Array(TAB);

  function hash(n) {
    n = Math.imul(n ^ (n >>> 15), 0x2c1b3c6d);
    n = Math.imul(n ^ (n >>> 12), 0x297a2d39);
    return ((n ^ (n >>> 15)) >>> 0) / 4294967296;
  }
  function sm(a, b, x) {
    x = (x - a) / (b - a);
    return x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
  }
  function vnoise(k, x) {
    var i = Math.floor(x), f = x - i; f = f * f * (3 - 2 * f);
    var a = hash(k + i), b = hash(k + i + 1);
    return a + (b - a) * f;
  }
  // one row of hairs across the brush width: clumps plus single hairs.
  // tabA is the row where the brush lands, tabB where it lifts.
  function hairs(seed, Wd) {
    var nb = Math.max(2, Math.min(30, Wd * 0.7)), nf = Math.max(4, Math.min(90, Wd * 2.4));
    var k = Math.imul(seed + 1, 131);
    for (var i = 0; i < TAB; i++) {
      var u = i / (TAB - 1);
      tabA[i] = 0.62 * vnoise(k, u * nb) + 0.38 * vnoise(k + 5003, u * nf);
      tabB[i] = 0.62 * vnoise(k + 9001, u * nb) + 0.38 * vnoise(k + 14009, u * nf);
      tabS[i] = 0.55 * vnoise(k + 20011, u * nb) + 0.45 * vnoise(k + 25013, u * nf);
    }
  }

  // W,H: painting size in work units. S: pixels per work unit.
  // win (optional): {x,y,w,h} in pixels — rasterise only that window.
  function Brush(W, H, S, win) {
    var ox = win ? win.x : 0, oy = win ? win.y : 0;
    var PW = win ? win.w : Math.round(W * S), PH = win ? win.h : Math.round(H * S);
    var MA = new Float32Array(PW * PH), MS = new Float32Array(PW * PH), MR = new Float32Array(PW * PH);
    var o = { PW: PW, PH: PH, S: S, MA: MA, MS: MS, MR: MR, x0: 0, y0: 0, w: 0, h: 0, thick: 0 };

    // Point the same scratch buffers at another scale / window origin.
    o.view = function (S2, x, y) { S = S2; ox = x; oy = y; o.S = S2; };

    // Rasterise one stroke into the scratch mask: alpha MA, shade MS, relief MR.
    // tA..tB limits it to part of its length, so the page can show the brush
    // being dragged along the stroke. Returns the mask pixel count (0 = nothing).
    o.mask = function (cx, cy, ang, L, Wd, bend, op, seed, tA, tB) {
      if (tA === undefined) { tA = 0; tB = 1; }
      var c = Math.cos(ang), s = Math.sin(ang), hw = Wd * 0.5;
      var soft = Math.min(2.5, Math.max(0.8, Wd * 0.22));
      var lat = hw + Math.abs(bend) * L * 0.5 + soft, lon = L * 0.5;
      var ex = Math.abs(c) * lon + Math.abs(s) * lat;
      var ey = Math.abs(s) * lon + Math.abs(c) * lat;
      var x0 = Math.floor((cx - ex) * S), x1 = Math.ceil((cx + ex) * S);
      var y0 = Math.floor((cy - ey) * S), y1 = Math.ceil((cy + ey) * S);
      if (x0 < ox) x0 = ox; if (y0 < oy) y0 = oy;
      if (x1 > ox + PW) x1 = ox + PW; if (y1 > oy + PH) y1 = oy + PH;
      var w = x1 - x0, h = y1 - y0;
      o.x0 = x0 - ox; o.y0 = y0 - oy; o.w = w; o.h = h;
      if (w <= 0 || h <= 0) { o.w = o.h = 0; return 0; }
      var hairy = sm(1.5, 7, Wd);
      if (hairy > 0) hairs(seed, Wd);
      var dryness = 0.5 + 0.55 * hash(Math.imul(seed + 1, 7919) + 3);   // 0.5 loaded .. 1.05 dry
      var shAmp = 0.2 * hairy;
      o.thick = Math.min(1.7, 0.36 * Math.sqrt(Wd));
      var e0 = Math.min(0.5, hw / L), e1 = Math.min(0.5, 1.7 * hw / L);
      var iS = 1 / S, iL = 1 / L, bl = bend * L * 0.5, ihw = 0.5 / hw, isoft = 1 / soft;
      var ie0 = 1 / e0, ie1 = 1 / e1, t1 = 1 - e1;
      var k = 0;
      for (var py = y0; py < y1; py++) {
        var wy = (py + 0.5) * iS - cy;
        var ub = wy * s, vb = wy * c;
        for (var px = x0; px < x1; px++, k++) {
          var wx = (px + 0.5) * iS - cx;
          var t = (wx * c + ub) * iL + 0.5;
          if (t <= tA || t > tB) { MA[k] = 0; continue; }
          var q = 2 * t - 1;
          var v = vb - wx * s - bl * (1 - q * q);
          var hh = hw * (1 - 0.1 * q * q), z;                 // belly under pressure
          if (t < e0) { z = 1 - t * ie0; hh *= Math.sqrt(1 - z * z); }
          else if (t > t1) { z = (t - t1) * ie1; hh *= Math.sqrt(1 - z * z); }
          var av = v < 0 ? -v : v;
          var a = (hh - av) * isoft + 0.5;
          if (a <= 0) { MA[k] = 0; continue; }
          if (a > 1) a = 1;
          var tip = 2 * hh * isoft; if (tip < 1) a *= tip;
          var sh = 1, rg = 0.5;
          if (hairy > 0) {
            var vn = v * ihw + 0.5;
            var fi = vn <= 0 ? 0 : vn >= 1 ? TAB - 1 : (vn * (TAB - 1)) | 0;
            var hr = tabA[fi] + (tabB[fi] - tabA[fi]) * t;     // hairs wander along the stroke
            var th = 1 - dryness * t * Math.sqrt(t);           // paint left on the brush
            var gap = (hr - th + 0.16) * 3.4;                  // hairs above the line have run dry
            gap = gap <= 0 ? 0 : gap >= 1 ? 1 : gap * gap * (3 - 2 * gap);
            a *= (1 - 0.16 * hairy * hr) * (1 - 0.86 * hairy * gap);
            sh = 1 + shAmp * (tabS[fi] - 0.5);
            rg = (0.3 + 0.7 * tabS[fi]) * (1 - 0.7 * gap);
          }
          var en = av / hh; if (en > 0.55) { en = en > 0.95 ? 1 : (en - 0.55) * 2.5; rg += 0.45 * en * en * (3 - 2 * en); }
          MA[k] = a * op; MS[k] = sh; MR[k] = rg;
        }
      }
      return w * h;
    };

    // Lay the stroke on a float RGB canvas C (values 0..255, PW*PH*3).
    // Hb (optional, PW*PH) collects paint thickness for raking light.
    o.paint = function (C, cx, cy, ang, L, Wd, bend, op, seed, r, g, b, tA, tB, Hb) {
      if (!o.mask(cx, cy, ang, L, Wd, bend, op, seed, tA, tB)) return;
      var x0 = o.x0, y0 = o.y0, w = o.w, h = o.h, k = 0, thick = o.thick;
      for (var y = 0; y < h; y++) {
        var i = (y0 + y) * PW + x0, j = i * 3;
        for (var x = 0; x < w; x++, k++, i++, j += 3) {
          var a = MA[k]; if (a === 0) continue;
          var sh = MS[k], ia = 1 - a, as = a * sh, n;
          n = C[j] * ia + r * as; C[j] = n > 255 ? 255 : n;
          n = C[j + 1] * ia + g * as; C[j + 1] = n > 255 ? 255 : n;
          n = C[j + 2] * ia + b * as; C[j + 2] = n > 255 ? 255 : n;
          if (Hb) Hb[i] += a * (thick * MR[k] - 0.55 * Hb[i]);
        }
      }
    };
    return o;
  }

  // ---- stroke record: 12 bytes ------------------------------------------
  // x u16, y u16, ang u8, L u8, Wd u8, bend i8, r, g, b, op u8
  var OPS = [0.45, 0.65, 0.85, 1.0];
  var Codec = {
    BYTES: 12, OPS: OPS,
    xq: function (x) { var c = Math.round((x + 40) * 64); return c < 0 ? 0 : c > 65535 ? 65535 : c; },
    xd: function (c) { return c / 64 - 40; },
    aq: function (a) { return Math.round(a / Math.PI * 256) & 255; },
    ad: function (c) { return c * Math.PI / 256; },
    lq: function (L) { var c = Math.round(Math.log(L / 0.8) / Math.log(1.0235)); return c < 0 ? 0 : c > 255 ? 255 : c; },
    ld: function (c) { return 0.8 * Math.pow(1.0235, c); },
    wq: function (w) { var c = Math.round(Math.log(w / 0.6) / Math.log(1.021)); return c < 0 ? 0 : c > 255 ? 255 : c; },
    wd: function (c) { return 0.6 * Math.pow(1.021, c); },
    bq: function (b) { var c = Math.round(b / 0.35 * 127); return c < -127 ? -127 : c > 127 ? 127 : c; },
    bd: function (c) { return c / 127 * 0.35; }
  };

  root.Brush = Brush; root.Codec = Codec;
})(typeof module !== 'undefined' ? module.exports : window);
