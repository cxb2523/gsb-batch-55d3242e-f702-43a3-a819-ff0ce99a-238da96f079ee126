/*
 * VoxelWeave Studio — minimal PNG encoder (RGBA, 8-bit, no filters).
 *
 * Used by the Node test harness to produce real .png bytes from the same
 * rasterizer the browser uses, so exports can be verified end-to-end without
 * a browser or any third-party package. The browser itself encodes through
 * canvas.toBlob() (see export.js); both paths consume identical RGBA bytes,
 * which is what the test suite checks.
 *
 * Requires Node's built-in zlib; guarded so merely loading this file in a
 * browser (it is not referenced by index.html) never throws at import time.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('zlib'));
  } else {
    root.VWPng = factory(null);
  }
})(typeof self !== 'undefined' ? self : this, function (zlib) {
  'use strict';

  function ensureZlib() {
    if (!zlib) {
      throw new Error('PNG 编码器仅在 Node 环境中可用；浏览器请使用 canvas.toBlob()');
    }
    return zlib;
  }

  var PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function crc32(buf) {
    var c = ~0;
    for (var i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (var k = 0; k < 8; k++) {
        c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
      }
    }
    return (~c) >>> 0;
  }

  function chunk(type, payload) {
    var typeBuf = Buffer.from(type, 'ascii');
    var lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(payload.length, 0);

    var crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, payload])), 0);

    return Buffer.concat([lenBuf, typeBuf, payload, crcBuf]);
  }

  /**
   * Encode an RGBA raster ({ width, height, data: Uint8ClampedArray/Uint8Array })
   * to a complete PNG Buffer.
   */
  function encodePng(frame) {
    ensureZlib();
    var width = frame.width;
    var height = frame.height;
    var rgba = frame.data;

    // One filter byte (0 = none) per scanline.
    var stride = width * 4;
    var raw = Buffer.alloc((stride + 1) * height);
    for (var y = 0; y < height; y++) {
      var rowStart = y * (stride + 1);
      raw[rowStart] = 0;
      Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride)
        .copy(raw, rowStart + 1);
    }

    var ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;  // bit depth
    ihdr[9] = 6;  // color type RGBA
    ihdr[10] = 0; // compression
    ihdr[11] = 0; // filter
    ihdr[12] = 0; // interlace

    var idat = zlib.deflateSync(raw);

    return Buffer.concat([
      PNG_SIGNATURE,
      chunk('IHDR', ihdr),
      chunk('IDAT', idat),
      chunk('IEND', Buffer.alloc(0))
    ]);
  }

  return {
    encodePng: encodePng,
    crc32: crc32
  };
});
