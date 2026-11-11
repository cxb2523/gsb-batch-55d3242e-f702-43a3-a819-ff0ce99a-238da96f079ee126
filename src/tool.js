// tool.js — the brush you see moving over the panel. It is drawn, hair by hair,
// with canvas paths every frame; there is no sprite. Local x runs from the tip
// of the hairs up the handle.
//
// o: { x, y      tip position, CSS px
//      ang       direction tip -> handle end, radians
//      w         width of the tuft at the ferrule, px
//      kind      'flat' (square end), 'filbert' (rounded end), 'round' / 'liner' (pointed)
//      u         UI scale (1 = the 1920x1080 design size)
//      dpr       device pixel ratio of the canvas
//      press     0..1 how hard the hairs are pushed into the panel
//      bend      -1..1 hairs dragged sideways behind the stroke
//      lift      0..1 height above the panel (moves the shadow away)
//      col       [r,g,b] paint on the hairs, load 0..1 how much of it
//      no        size stamped on the handle (string) or ''
//      len       handle length override, px
//      alpha, shadow }
function drawBrushTool(g, o) {
  'use strict';
  var u = o.u, w = o.w, press = o.press || 0, lift = o.lift || 0, dpr = o.dpr || 1;
  function hsh(n) { n = Math.imul(n ^ (n >>> 15), 0x2c1b3c6d); n = Math.imul(n ^ (n >>> 12), 0x297a2d39); return ((n ^ (n >>> 15)) >>> 0) / 4294967296; }

  var e = o.kind === 'flat' ? 0.72 : o.kind === 'filbert' ? 0.5 : 0;     // how blunt the end of the tuft is
  var tl = ((1.9 - 1.0 * e) * w + (7 + 9 * e) * u) * (1 - 0.14 * press);  // tuft length: flats are short for their width
  var belly = w * 0.5 * (1.05 + 0.24 * press);                           // hairs splay under pressure
  var ey = belly * e;                                                    // half-height of the blunt end
  var fr0 = w * 0.5, fr1 = Math.max(2.1 * u, Math.min(w * 0.4, 11 * u + w * 0.06));   // ferrule: wide at the hairs, pinched to the handle
  var fl = Math.min(1.25 * w + 9 * u, 0.5 * w + 34 * u);
  var hl = o.len || (215 * u + Math.min(2.2 * w, 70 * u));
  var hr0 = fr1 * 0.97, hr1 = Math.max(fr1 * 1.22, 3.1 * u), hr2 = Math.max(fr1 * 0.5, 1.5 * u);
  var x1 = tl + fl, x2 = x1 + hl;
  var bendPx = (o.bend || 0) * w * 0.6 * (0.25 + 0.75 * press);
  function by(x) { var k = 1 - x / tl; return k <= 0 ? 0 : bendPx * k * k; }

  function tuftPath() {
    var cx2 = tl * 0.16 * (1 - e), cy2 = belly * (0.62 + 0.38 * e), b0 = by(0);
    g.beginPath();
    g.moveTo(tl, -fr0);
    g.bezierCurveTo(tl * 0.62, -belly + by(tl * 0.62), cx2, -cy2 + by(cx2), 0, -ey + b0);
    if (e > 0) g.quadraticCurveTo(-ey * (1 - e) * (1 - e) * 3.2, b0, 0, ey + b0);
    g.bezierCurveTo(cx2, cy2 + by(cx2), tl * 0.62, belly + by(tl * 0.62), tl, fr0);
    g.closePath();
  }
  function ferrulePath() {
    g.beginPath(); g.moveTo(tl, -fr0);
    g.bezierCurveTo(tl + fl * 0.5, -fr0, tl + fl * 0.6, -fr1, x1, -fr1);
    g.lineTo(x1, fr1);
    g.bezierCurveTo(tl + fl * 0.6, fr1, tl + fl * 0.5, fr0, tl, fr0); g.closePath();
  }
  function handlePath() {
    g.beginPath();
    g.moveTo(x1, -hr0);
    g.bezierCurveTo(x1 + hl * 0.16, -hr1, x1 + hl * 0.34, -hr1, x1 + hl * 0.6, -(hr1 + hr2) * 0.5);
    g.quadraticCurveTo(x2 - hr2, -hr2, x2, 0);
    g.quadraticCurveTo(x2 - hr2, hr2, x1 + hl * 0.6, (hr1 + hr2) * 0.5);
    g.bezierCurveTo(x1 + hl * 0.34, hr1, x1 + hl * 0.16, hr1, x1, hr0);
    g.closePath();
  }
  function base(extra) {
    g.setTransform(dpr, 0, 0, dpr, o.x * dpr + (extra || 0), o.y * dpr);
  }
  var col = o.col || [120, 90, 50], load = o.load === undefined ? 0.7 : o.load;
  var rgb = col[0] + ',' + col[1] + ',' + col[2], gr, k;

  g.save();
  g.globalAlpha = o.alpha === undefined ? 1 : o.alpha;

  // ---- shadow: the brush leans away from the panel, so its shadow meets the
  // hairs at the tip and swings out along the handle. Drawn by parking the
  // silhouette off-canvas and letting only its blurred shadow land.
  if (o.shadow) {
    var OFF = g.canvas.width + 4000;
    base(OFF);
    g.rotate(o.ang + 0.12 + 0.1 * lift);
    g.shadowColor = 'rgba(0,0,0,' + (0.62 - 0.26 * lift) + ')';
    g.shadowBlur = (7 + 22 * lift) * u * dpr;
    g.shadowOffsetX = -OFF + (4 + 30 * lift) * u * dpr;
    g.shadowOffsetY = (6 + 40 * lift) * u * dpr;
    g.fillStyle = '#000';
    tuftPath(); g.fill(); ferrulePath(); g.fill(); handlePath(); g.fill();
    g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetX = 0; g.shadowOffsetY = 0;
  }

  base(0);
  g.rotate(o.ang);

  // ---- handle: varnished wood with its grain, a dipped end, a lacquer highlight
  gr = g.createLinearGradient(0, -hr1, 0, hr1);
  gr.addColorStop(0, '#e2b074'); gr.addColorStop(0.22, '#b57b3f'); gr.addColorStop(0.58, '#754820'); gr.addColorStop(1, '#2b180a');
  g.fillStyle = gr; handlePath(); g.fill();
  g.save(); handlePath(); g.clip();
  var xd = x1 + hl * 0.83;
  for (k = 0; k < 7; k++) {
    var gy = (hsh(k * 7 + 3) - 0.5) * 1.6 * hr1;
    g.strokeStyle = 'rgba(58,30,8,' + (0.08 + 0.1 * hsh(k + 11)) + ')'; g.lineWidth = Math.max(0.3, 0.6 * u);
    g.beginPath(); g.moveTo(x1, gy); g.quadraticCurveTo((x1 + xd) / 2, gy + (hsh(k + 29) - 0.5) * 3 * u, xd, gy); g.stroke();
  }
  gr = g.createLinearGradient(0, -hr1, 0, hr1);
  gr.addColorStop(0, '#5a5a60'); gr.addColorStop(0.3, '#232326'); gr.addColorStop(1, '#070708');
  g.fillStyle = gr; g.fillRect(xd, -hr1 - 1, x2 - xd + 2, hr1 * 2 + 2);
  gr = g.createLinearGradient(0, -hr1, 0, hr1);
  gr.addColorStop(0, '#fff0b8'); gr.addColorStop(0.4, '#c89a48'); gr.addColorStop(1, '#5a3d12');
  g.fillStyle = gr; g.fillRect(xd - 1.6 * u, -hr1 - 1, 1.6 * u, hr1 * 2 + 2);
  g.restore();
  gr = g.createLinearGradient(x1, 0, x1 + hl * 0.8, 0);
  gr.addColorStop(0, 'rgba(255,248,230,0)'); gr.addColorStop(0.2, 'rgba(255,248,230,.4)'); gr.addColorStop(0.8, 'rgba(255,248,230,.3)'); gr.addColorStop(1, 'rgba(255,248,230,0)');
  g.strokeStyle = gr; g.lineWidth = Math.max(0.5, hr1 * 0.2); g.lineCap = 'round';
  g.beginPath(); g.moveTo(x1 + hl * 0.03, -hr0 * 0.5); g.quadraticCurveTo(x1 + hl * 0.3, -hr1 * 0.62, x1 + hl * 0.8, -hr2 * 0.9); g.stroke();
  if (o.no && hr1 > 2.6 * u && u * dpr > 0.5) {
    var fs = Math.max(5, Math.min(hr1 * 1.05, 9 * u));
    g.font = '600 ' + fs + 'px Georgia,"Times New Roman",serif';
    g.textBaseline = 'middle'; g.fillStyle = 'rgba(246,220,150,.82)';
    g.fillText('No. ' + o.no, x1 + hl * 0.2, hr1 * 0.12);
  }

  // ---- ferrule: nickel (bright band near the top, reflected light below),
  // two crimps, a lip where the hairs go in, a little paint that crept up
  gr = g.createLinearGradient(0, -fr0, 0, fr0);
  gr.addColorStop(0, '#8d897f'); gr.addColorStop(0.12, '#fdfbf4'); gr.addColorStop(0.3, '#cfcabd'); gr.addColorStop(0.5, '#6f6c64');
  gr.addColorStop(0.72, '#3a3835'); gr.addColorStop(0.9, '#8a8375'); gr.addColorStop(1, '#2a2826');
  g.fillStyle = gr; ferrulePath(); g.fill();
  g.save(); ferrulePath(); g.clip();
  var cr = [0.7, 0.86];
  for (k = 0; k < 2; k++) {
    var cx = tl + fl * cr[k];
    g.fillStyle = 'rgba(0,0,0,.36)'; g.fillRect(cx, -fr0, Math.max(0.6, 1.1 * u), fr0 * 2);
    g.fillStyle = 'rgba(255,255,255,.3)'; g.fillRect(cx + Math.max(0.6, 1.1 * u), -fr0, Math.max(0.5, 0.8 * u), fr0 * 2);
  }
  g.fillStyle = 'rgba(0,0,0,.32)'; g.fillRect(tl, -fr0, Math.max(0.8, 1.6 * u), fr0 * 2);
  for (k = 0; k < 3; k++) {
    g.fillStyle = 'rgba(' + rgb + ',.8)'; g.beginPath();
    g.ellipse(tl + fl * (0.03 + 0.12 * hsh(k)), (hsh(k + 17) - 0.5) * 1.4 * fr0, (0.1 + 0.1 * hsh(k + 5)) * fr0 * 1.6, (0.1 + 0.1 * hsh(k + 5)) * fr0, 0, 0, 6.2832); g.fill();
  }
  g.restore();

  // ---- hairs -----------------------------------------------------------------
  gr = g.createLinearGradient(0, 0, tl, 0);
  gr.addColorStop(0, '#8a5f38'); gr.addColorStop(0.55, '#5f3d20'); gr.addColorStop(1, '#2a180b');
  g.fillStyle = gr; tuftPath(); g.fill();
  g.save(); tuftPath(); g.clip();
  // the paint the hairs are carrying, fullest at the tip
  gr = g.createLinearGradient(0, 0, tl, 0);
  gr.addColorStop(0, 'rgba(' + rgb + ',1)');
  gr.addColorStop(Math.min(0.5, 0.12 + 0.25 * load), 'rgba(' + rgb + ',.92)');
  gr.addColorStop(Math.min(0.75, 0.3 + 0.4 * load), 'rgba(' + rgb + ',0)');
  g.fillStyle = gr; g.fillRect(-belly - 2, -belly - Math.abs(bendPx) - 2, tl + belly + 4, 2 * (belly + Math.abs(bendPx)) + 4);
  // single hairs, from the ferrule toward the tip; on a pointed brush the outer hairs stop short
  var n = Math.max(7, Math.min(46, Math.round(w / u * 0.95 + 6)));
  g.lineCap = 'round';
  for (var i = 0; i < n; i++) {
    var s = (i + 0.5) / n * 2 - 1, as = s < 0 ? -s : s, j = hsh(i * 97 + 13);
    var ex = tl * (0.03 + (as * as * 0.2 + j * 0.06) * (1 - e * 0.85));
    var eyy = s * (belly * 0.2 * (1 - e) + ey * 0.96 * (e > 0 ? 1 : 0));
    g.strokeStyle = (i & 1) ? 'rgba(20,10,4,' + (0.2 + 0.2 * j) + ')' : 'rgba(255,236,200,' + (0.1 + 0.16 * j) + ')';
    g.lineWidth = Math.max(0.35, (0.45 + 0.5 * j) * u);
    g.beginPath(); g.moveTo(tl, s * fr0 * 0.94);
    g.quadraticCurveTo(tl * 0.5, s * belly * (0.94 + 0.1 * j) + by(tl * 0.5), ex, eyy + by(ex));
    g.stroke();
  }
  // wet glint on the loaded tip
  gr = g.createLinearGradient(tl * 0.08, 0, tl * 0.44, 0);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.4, 'rgba(255,255,255,' + (0.42 * load) + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.strokeStyle = gr; g.lineWidth = Math.max(0.5, belly * 0.09);
  g.beginPath(); g.moveTo(tl * 0.08, -belly * 0.3 + by(tl * 0.08)); g.quadraticCurveTo(tl * 0.24, -belly * 0.52 + by(tl * 0.24), tl * 0.44, -belly * 0.5 + by(tl * 0.44)); g.stroke();
  g.restore();
  tuftPath(); g.strokeStyle = 'rgba(20,10,4,.5)'; g.lineWidth = Math.max(0.6, 0.9 * u); g.stroke();
  // shade where the hairs enter the ferrule, and two strays
  gr = g.createLinearGradient(tl * 0.7, 0, tl, 0);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.42)');
  g.fillStyle = gr; tuftPath(); g.fill();
  g.strokeStyle = 'rgba(60,36,16,.75)'; g.lineWidth = Math.max(0.35, 0.5 * u);
  g.beginPath();
  g.moveTo(tl * 0.8, -fr0 * 0.9); g.quadraticCurveTo(tl * 0.45, -belly * 1.14 + by(tl * 0.45), tl * 0.2, -belly * 0.98 + by(tl * 0.2));
  g.moveTo(tl * 0.7, fr0 * 0.95); g.quadraticCurveTo(tl * 0.4, belly * 1.1 + by(tl * 0.4), tl * 0.26, belly * 0.86 + by(tl * 0.26));
  g.stroke();

  g.restore();
  g.setTransform(1, 0, 0, 1, 0, 0);
}
