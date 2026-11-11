'use strict';

/*
 * End-to-end local sample — no browser, no network, no third-party packages.
 *
 * Produces a real PNG atlas and its JSON manifest from the same modules the
 * page uses, then cross-checks that:
 *   1. the PNG decodes back to the exact rasterized RGBA bytes;
 *   2. every manifest coordinate points at a matrix cell with that index;
 *   3. every palette color appears at least once (or was truncated correctly).
 *
 * Run:  node examples/generate-sample.js [output-dir]
 * The default output dir is a scratch folder outside the repository.
 */

const fs = require('node:fs');
const path = require('node:path');

const VWWeave = require('../src/weave');
const VWRender = require('../src/render');
const VWManifest = require('../src/manifest');
const VWPng = require('../src/png');
const { decodePng } = require('../tests/helpers');

const outputDir = process.argv[2] ||
  path.join(require('node:os').tmpdir(), 'voxelweave-sample');
fs.mkdirSync(outputDir, { recursive: true });

const samples = [
  {
    name: 'forest-8x10',
    options: {
      palette: ['#2f6b3a', '#7fb069', '#e6c229', '#f18f01', '#41b3a3', '#5d576f'],
      rows: 8,
      cols: 10,
      cellSize: 24,
      seed: 'autumn-loom-01'
    }
  },
  {
    name: 'mono-4x6',
    options: {
      palette: ['#8b949e'],
      rows: 4,
      cols: 6,
      cellSize: 12,
      seed: 'single-color'
    }
  }
];

function assert(condition, message) {
  if (!condition) throw new Error('SAMPLE CHECK FAILED: ' + message);
}

for (const sample of samples) {
  const weave = VWWeave.generateMatrix(sample.options);
  const frame = VWRender.rasterize(weave);
  const manifest = VWManifest.buildManifest(weave);

  // --- write artifacts -----------------------------------------------------
  const pngPath = path.join(outputDir, sample.name + '.png');
  const jsonPath = path.join(outputDir, sample.name + '.json');
  const png = VWPng.encodePng(frame);
  fs.writeFileSync(pngPath, png);
  fs.writeFileSync(jsonPath, VWManifest.manifestToJson(manifest));

  // --- check 1: PNG round-trips to identical pixels ------------------------
  const decoded = decodePng(png);
  assert(decoded.width === frame.width && decoded.height === frame.height,
    sample.name + ' PNG dimensions mismatch');
  assert(Buffer.from(decoded.data).equals(Buffer.from(frame.data)),
    sample.name + ' PNG pixels differ from rasterizer output');

  // --- check 2: manifest coordinates match the matrix ----------------------
  let covered = 0;
  for (const tile of manifest.tiles) {
    for (const cell of tile.cells) {
      assert(weave.matrix[cell.row][cell.col] === tile.index,
        sample.name + ' manifest/matrix index mismatch at ' + cell.row + ',' + cell.col);
      covered++;
    }
  }
  assert(covered === weave.rows * weave.cols, sample.name + ' coverage mismatch');

  // --- check 3: adjacency rule (mono palette is the documented exception) --
  if (weave.palette.length > 1) {
    for (let r = 0; r < weave.rows; r++) {
      for (let c = 0; c < weave.cols; c++) {
        if (c > 0) assert(weave.matrix[r][c] !== weave.matrix[r][c - 1],
          sample.name + ' horizontal same-color neighbors');
        if (r > 0) assert(weave.matrix[r][c] !== weave.matrix[r - 1][c],
          sample.name + ' vertical same-color neighbors');
      }
    }
    const used = new Set(weave.matrix.flat());
    assert(used.size === weave.palette.length,
      sample.name + ' not every palette color appears');
  }

  console.log('OK  %s -> %s (%d bytes) + %s (%d bytes), atlas %dx%d, %d colors',
    sample.name,
    path.basename(pngPath), png.length,
    path.basename(jsonPath), fs.statSync(jsonPath).size,
    manifest.atlas.width, manifest.atlas.height,
    manifest.palette.length);
}

console.log('\nAll sample artifacts written to: ' + outputDir);
