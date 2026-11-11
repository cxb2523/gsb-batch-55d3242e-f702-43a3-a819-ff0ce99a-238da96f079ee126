/*
 * VoxelWeave Studio — render layer.
 *
 * The same geometry helper drives both the canvas painter and the manifest
 * coordinates, so "export matches the current canvas" is structural rather
 * than hoped-for. A pure rasterizer (writes RGBA bytes with no DOM) lets the
 * Node test suite assert exact pixels.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VWRender = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Rounded pixel boundary of cell index i at the given cell size. */
  function cellBoundary(index, cellSize) {
    return Math.round(index * cellSize);
  }

  /** Atlas pixel dimensions (width/height may differ when rows != cols). */
  function atlasSize(rows, cols, cellSize) {
    return {
      width: Math.round(cols * cellSize),
      height: Math.round(rows * cellSize)
    };
  }

  /**
   * Paint a generated weave into a flat RGBA byte array (length w*h*4).
   * Pure function — no canvas, no globals — so it is byte-identical in the
   * browser and under Node, and therefore testable offline.
   */
  function rasterize(weave) {
    var size = atlasSize(weave.rows, weave.cols, weave.cellSize);
    var width = size.width;
    var height = size.height;
    var data = new Uint8ClampedArray(width * height * 4);
    var rgba = weave.paletteRgba;
    var cellSize = weave.cellSize;

    for (var r = 0; r < weave.rows; r++) {
      var y0 = cellBoundary(r, cellSize);
      var y1 = cellBoundary(r + 1, cellSize);
      for (var c = 0; c < weave.cols; c++) {
        var x0 = cellBoundary(c, cellSize);
        var x1 = cellBoundary(c + 1, cellSize);
        var color = rgba[weave.matrix[r][c]];

        for (var y = y0; y < y1; y++) {
          var rowOffset = (y * width + x0) * 4;
          for (var x = 0; x < (x1 - x0); x++) {
            var p = rowOffset + x * 4;
            data[p] = color[0];
            data[p + 1] = color[1];
            data[p + 2] = color[2];
            data[p + 3] = color[3];
          }
        }
      }
    }

    return { width: width, height: height, data: data };
  }

  /** Wrap rasterized bytes in a browser ImageData object. */
  function toImageData(weave, ImageDataCtor) {
    var frame = rasterize(weave);
    if (typeof ImageDataCtor === 'function') {
      return new ImageDataCtor(frame.data, frame.width, frame.height);
    }
    // In browsers the bare ImageData constructor is a real global; in Node
    // (tests) it is undefined and callers fall back to fillRect instead.
    if (typeof ImageData === 'function') {
      return new ImageData(frame.data, frame.width, frame.height);
    }
    throw new Error('当前环境不支持 ImageData，无法构建图像数据');
  }

  /**
   * Paint a weave onto a canvas 2D context. The canvas backing store is sized
   * to the exact atlas pixels; CSS may scale it for preview.
   * Returns the rasterized frame so callers/export can reuse the bytes.
   *
   * A context opts into the ImageData path by setting `supportsImageData`
   * (real browser contexts created by the page do this in app.js). Minimal
   * stub contexts without that flag get the fillRect fallback instead.
   */
  function paintToCanvas(weave, canvas, ctx) {
    var frame = rasterize(weave);
    canvas.width = frame.width;
    canvas.height = frame.height;

    if (ctx && ctx.supportsImageData === true && typeof ctx.putImageData === 'function') {
      var imageData = toImageData(weave);
      ctx.putImageData(imageData, 0, 0);
    } else if (ctx && typeof ctx.fillRect === 'function') {
      // Fallback for environments without ImageData (e.g. minimal stubs).
      var cellSize = weave.cellSize;
      for (var r = 0; r < weave.rows; r++) {
        for (var c = 0; c < weave.cols; c++) {
          var color = weave.paletteRgba[weave.matrix[r][c]];
          ctx.fillStyle = 'rgba(' + color[0] + ',' + color[1] + ',' +
            color[2] + ',' + color[3] / 255 + ')';
          ctx.fillRect(
            cellBoundary(c, cellSize),
            cellBoundary(r, cellSize),
            cellBoundary(c + 1, cellSize) - cellBoundary(c, cellSize),
            cellBoundary(r + 1, cellSize) - cellBoundary(r, cellSize)
          );
        }
      }
    }
    return frame;
  }

  return {
    cellBoundary: cellBoundary,
    atlasSize: atlasSize,
    rasterize: rasterize,
    toImageData: toImageData,
    paintToCanvas: paintToCanvas
  };
});
