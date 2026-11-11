/*
 * VoxelWeave Studio — color parsing / normalization.
 *
 * Supports the CSS color forms an offline palette tool needs without any
 * network or third-party dependency:
 *   - #rgb        (#fff)
 *   - #rrggbb     (#ffffff)
 *   - #rrggbbaa   (#ffffff80)
 *   - rgb(r, g, b)        / rgba(r, g, b, a)
 *
 * Every accepted color is normalized to an 8-bit [r, g, b, a] array so the
 * rasterizer never has to re-parse strings. The original string is kept in
 * the manifest for downstream tooling.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VWColors = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function clampByte(v) {
    v = Math.round(v);
    if (v < 0) return 0;
    if (v > 255) return 255;
    return v;
  }

  function parseHex(input) {
    var hex = input.trim();
    if (hex[0] !== '#') return null;
    var body = hex.slice(1);
    if (!/^[0-9a-fA-F]+$/.test(body)) return null;

    if (body.length === 3 || body.length === 4) {
      body = body.split('').map(function (ch) { return ch + ch; }).join('');
    }
    if (body.length !== 6 && body.length !== 8) return null;

    var r = parseInt(body.slice(0, 2), 16);
    var g = parseInt(body.slice(2, 4), 16);
    var b = parseInt(body.slice(4, 6), 16);
    var a = body.length === 8 ? parseInt(body.slice(6, 8), 16) : 255;
    return [r, g, b, a];
  }

  function parseRgbFunctional(input) {
    var m = /^rgba?\(\s*([^)]+)\)$/i.exec(input.trim());
    if (!m) return null;
    var parts = m[1].split(',').map(function (p) { return p.trim(); });
    if (parts.length !== 3 && parts.length !== 4) return null;

    var channels = parts.map(function (raw, idx) {
      var token = raw;
      if (idx === 3 && token === '') return 1;
      if (token.endsWith('%')) {
        var pct = parseFloat(token.slice(0, -1));
        if (!Number.isFinite(pct)) return NaN;
        return idx === 3 ? pct / 100 : (pct / 100) * 255;
      }
      return parseFloat(token);
    });

    if (channels.some(function (v) { return !Number.isFinite(v); })) return null;
    var alpha = channels.length === 4 ? channels[3] : 1;
    if (alpha < 0) alpha = 0;
    if (alpha > 1) alpha = 1;
    return [
      clampByte(channels[0]),
      clampByte(channels[1]),
      clampByte(channels[2]),
      clampByte(alpha * 255)
    ];
  }

  /**
   * Parse a single color string to [r, g, b, a] (bytes).
   * Throws Error with a readable Chinese message on unsupported input.
   */
  function parseColor(input) {
    if (typeof input !== 'string') {
      throw new Error('颜色必须是字符串，例如 "#3fb950"，收到：' + String(input));
    }
    var trimmed = input.trim();
    if (!trimmed) {
      throw new Error('调色板中存在空颜色，请输入如 #3fb950 的颜色值');
    }
    var rgba = parseHex(trimmed) || parseRgbFunctional(trimmed);
    if (!rgba) {
      throw new Error(
        '无法识别颜色 "' + input + '"，支持 #rgb、#rrggbb、#rrggbbaa、rgb() 与 rgba() 格式'
      );
    }
    return rgba;
  }

  /** rgba byte array -> canvas/css style string. */
  function rgbaToCss(rgba) {
    return 'rgba(' + rgba[0] + ',' + rgba[1] + ',' + rgba[2] + ',' +
      (Math.round(rgba[3] * 1000) / 1000 / 255).toFixed(3) + ')';
  }

  return {
    parseColor: parseColor,
    rgbaToCss: rgbaToCss
  };
});
