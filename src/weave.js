/*
 * VoxelWeave Studio — deterministic weave (matrix) generator.
 *
 * Contract
 * --------
 *   generateMatrix({ palette, rows, cols, cellSize, seed })
 *     palette  : non-empty array of color strings (hex / rgb() / rgba())
 *     rows/cols: positive integers
 *     cellSize : finite number >= 1 (fractions allowed; rounded at paint time)
 *     seed     : string (empty string is valid)
 *
 *   Returns:
 *   {
 *     rows, cols, cellSize, seed,
 *     palette:     [original color strings...],
 *     paletteRgba: [[r,g,b,a]...],   // same order as palette
 *     matrix:      rows x cols of palette indices (0-based)
 *   }
 *
 * Guarantees
 * ----------
 * 1. Same inputs -> byte-identical matrix (FNV-1a seed hash + mulberry32 PRNG).
 * 2. Different seeds -> different stream of pseudo-random choices; whenever
 *    the grid offers freedom, different seeds produce different matrices.
 * 3. Every used palette color appears at least once. When there are more
 *    colors than cells, only the first `rows*cols` colors are used, and no
 *    index ever goes out of bounds.
 * 4. Orthogonally adjacent cells never share a color — except when the
 *    effective palette has only one color, where repetition is allowed.
 * 5. Invalid parameters throw Errors with readable Chinese messages instead
 *    of producing a blank grid.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./colors'));
  } else {
    root.VWWeave = factory(root.VWColors);
  }
})(typeof self !== 'undefined' ? self : this, function (VWColors) {
  'use strict';

  var MAX_DIMENSION = 1024;
  var MAX_CELLS = 1048576; // 1024 * 1024 safety ceiling

  function isPositiveInt(n) {
    return typeof n === 'number' && Number.isInteger(n) && n > 0;
  }

  /** FNV-1a 32-bit hash of the seed string -> unsigned 32-bit integer. */
  function hashSeed(seed) {
    var h = 0x811c9dc5;
    for (var i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      // 32-bit FNV prime multiply (Math.imul keeps the arithmetic in int32).
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  /** mulberry32 — small, fast, fully deterministic PRNG over [0, 1). */
  function mulberry32(initialState) {
    var state = initialState >>> 0;
    return function next() {
      state = (state + 0x6d2b79f5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Validate and normalize generator options. Exposed separately so callers
   * (and tests) can check inputs without generating.
   */
  function validateOptions(options) {
    if (!options || typeof options !== 'object') {
      throw new Error('生成参数缺失：请提供包含调色板、行列数与单元格尺寸的参数对象');
    }

    var palette = options.palette;
    if (!Array.isArray(palette) || palette.length === 0) {
      throw new Error('调色板不能为空：请至少提供一种颜色，例如 ["#3fb950", "#58a6ff"]');
    }

    if (!isPositiveInt(options.rows)) {
      throw new Error('行数必须是正整数（大于 0 的整数），收到：' + String(options.rows));
    }
    if (!isPositiveInt(options.cols)) {
      throw new Error('列数必须是正整数（大于 0 的整数），收到：' + String(options.cols));
    }
    if (options.rows > MAX_DIMENSION || options.cols > MAX_DIMENSION) {
      throw new Error('行数与列数均不能超过 ' + MAX_DIMENSION + '，以免生成过大的网格');
    }
    if (options.rows * options.cols > MAX_CELLS) {
      throw new Error('格子总数不能超过 ' + MAX_CELLS + '，请减小行数或列数');
    }

    var cellSize = options.cellSize;
    if (typeof cellSize !== 'number' || !Number.isFinite(cellSize) || cellSize < 1) {
      throw new Error('单元格尺寸必须是不小于 1 的数字，收到：' + String(cellSize));
    }

    if (typeof options.seed !== 'string') {
      throw new Error('种子必须是字符串（可以为空字符串），收到：' + String(options.seed));
    }

    var cellCount = options.rows * options.cols;
    var usedCount = Math.min(palette.length, cellCount);
    var paletteRgba = [];
    for (var i = 0; i < usedCount; i++) {
      paletteRgba.push(VWColors.parseColor(palette[i]));
    }

    return {
      rows: options.rows,
      cols: options.cols,
      cellSize: cellSize,
      seed: options.seed,
      usedCount: usedCount,
      palette: palette.slice(0, usedCount),
      paletteRgba: paletteRgba
    };
  }

  /**
   * Generate the cell matrix. See file header for the guarantee list.
   */
  function generateMatrix(options) {
    var cfg = validateOptions(options);
    var rows = cfg.rows;
    var cols = cfg.cols;
    var k = cfg.usedCount;
    var total = rows * cols;

    var rng = mulberry32(hashSeed(cfg.seed));
    var matrix = new Array(rows);
    var used = new Array(k).fill(false);
    var usedCount = 0;

    for (var r = 0; r < rows; r++) {
      matrix[r] = new Array(cols);
      for (var c = 0; c < cols; c++) {
        var left = c > 0 ? matrix[r][c - 1] : -1;
        var up = r > 0 ? matrix[r - 1][c] : -1;

        var chosen;

        if (k === 1) {
          // Single-color palette: repetition is explicitly allowed.
          chosen = 0;
        } else {
          // Remaining cells (including this one) vs. colors still missing.
          var remaining = total - (r * cols + c);
          var missing = k - usedCount;
          if (missing >= remaining) {
            // Hard coverage constraint: only an unused color keeps every
            // palette color reachable within the cells that are left.
            var unused = [];
            for (var u = 0; u < k; u++) {
              if (!used[u] && u !== left && u !== up) unused.push(u);
            }
            chosen = unused[Math.floor(rng() * unused.length)];
          } else {
            var eligible = [];
            for (var e = 0; e < k; e++) {
              if (e !== left && e !== up) eligible.push(e);
            }
            // k >= 2 guarantees at least one eligible index.
            chosen = eligible[Math.floor(rng() * eligible.length)];
          }
        }

        matrix[r][c] = chosen;
        if (!used[chosen]) {
          used[chosen] = true;
          usedCount++;
        }
      }
    }

    return {
      rows: rows,
      cols: cols,
      cellSize: cfg.cellSize,
      seed: cfg.seed,
      palette: cfg.palette,
      paletteRgba: cfg.paletteRgba,
      matrix: matrix
    };
  }

  return {
    MAX_DIMENSION: MAX_DIMENSION,
    MAX_CELLS: MAX_CELLS,
    hashSeed: hashSeed,
    mulberry32: mulberry32,
    validateOptions: validateOptions,
    generateMatrix: generateMatrix
  };
});
