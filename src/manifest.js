/*
 * VoxelWeave Studio — JSON manifest builder.
 *
 * The manifest is the machine-readable sidecar for the PNG atlas. Downstream
 * engines locate tiles by palette index: each entry lists every grid cell
 * carrying that color, both as grid coordinates (row/col) and as atlas pixel
 * rectangles derived from the exact same boundary math as the painted canvas.
 *
 * Shape:
 * {
 *   version: 1,
 *   rows, cols, cellSize, seed,
 *   atlas: { width, height },
 *   palette: ["#...", ...],
 *   tiles: [
 *     {
 *       index: 0,
 *       color: "#...",
 *       cells: [ { row, col }, ... ],
 *       rects: [ { x, y, width, height }, ... ]
 *     },
 *     ...
 *   ]
 * }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./render'));
  } else {
    root.VWManifest = factory(root.VWRender);
  }
})(typeof self !== 'undefined' ? self : this, function (VWRender) {
  'use strict';

  var MANIFEST_VERSION = 1;

  function buildManifest(weave) {
    var size = VWRender.atlasSize(weave.rows, weave.cols, weave.cellSize);
    var tiles = weave.palette.map(function (color, index) {
      return {
        index: index,
        color: color,
        cells: [],
        rects: []
      };
    });

    for (var r = 0; r < weave.rows; r++) {
      for (var c = 0; c < weave.cols; c++) {
        var idx = weave.matrix[r][c];
        var x0 = VWRender.cellBoundary(c, weave.cellSize);
        var y0 = VWRender.cellBoundary(r, weave.cellSize);
        var x1 = VWRender.cellBoundary(c + 1, weave.cellSize);
        var y1 = VWRender.cellBoundary(r + 1, weave.cellSize);

        tiles[idx].cells.push({ row: r, col: c });
        tiles[idx].rects.push({
          x: x0,
          y: y0,
          width: x1 - x0,
          height: y1 - y0
        });
      }
    }

    return {
      version: MANIFEST_VERSION,
      rows: weave.rows,
      cols: weave.cols,
      cellSize: weave.cellSize,
      seed: weave.seed,
      atlas: { width: size.width, height: size.height },
      palette: weave.palette.slice(),
      tiles: tiles
    };
  }

  /** Stable, readable JSON suitable for both download and tests. */
  function manifestToJson(manifest) {
    return JSON.stringify(manifest, null, 2);
  }

  return {
    MANIFEST_VERSION: MANIFEST_VERSION,
    buildManifest: buildManifest,
    manifestToJson: manifestToJson
  };
});
