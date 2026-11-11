'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const VWWeave = require('../src/weave');
const VWRender = require('../src/render');
const VWManifest = require('../src/manifest');
const VWPng = require('../src/png');
const { decodePng } = require('./helpers');

const PALETTE = ['#ff0000', '#00ff00', '#0000ff', '#ffff00'];

describe('render — 栅格化与画布尺寸', () => {
  test('图集尺寸等于行列数乘以单元格尺寸', () => {
    const weave = VWWeave.generateMatrix({
      palette: PALETTE, rows: 3, cols: 5, cellSize: 10, seed: 'r'
    });
    const frame = VWRender.rasterize(weave);
    assert.equal(frame.width, 50);
    assert.equal(frame.height, 30);
    assert.equal(frame.data.length, 50 * 30 * 4);
  });

  test('每个像素的颜色与矩阵索引严格对应', () => {
    const weave = VWWeave.generateMatrix({
      palette: PALETTE, rows: 4, cols: 6, cellSize: 7, seed: 'pixels'
    });
    const frame = VWRender.rasterize(weave);

    for (let r = 0; r < weave.rows; r++) {
      for (let c = 0; c < weave.cols; c++) {
        const expected = weave.paletteRgba[weave.matrix[r][c]];
        // 采样单元格中心像素
        const x = VWRender.cellBoundary(c, 7) + 3;
        const y = VWRender.cellBoundary(r, 7) + 3;
        const p = (y * frame.width + x) * 4;
        assert.deepEqual(
          [frame.data[p], frame.data[p + 1], frame.data[p + 2], frame.data[p + 3]],
          expected,
          `单元格 (${r},${c}) 中心像素颜色不匹配`
        );
      }
    }
  });

  test('重复栅格化同一织格得到逐字节一致的结果', () => {
    const weave = VWWeave.generateMatrix({
      palette: PALETTE, rows: 5, cols: 5, cellSize: 6, seed: 'stable'
    });
    const a = VWRender.rasterize(weave);
    const b = VWRender.rasterize(weave);
    assert.deepEqual(Buffer.from(a.data), Buffer.from(b.data));
  });

  test('alpha 通道（rgba 颜色）被正确写入', () => {
    const weave = VWWeave.generateMatrix({
      palette: ['rgba(10, 20, 30, 0.5)', 'rgba(40, 50, 60, 1)'],
      rows: 2, cols: 2, cellSize: 4, seed: 'alpha'
    });
    const frame = VWRender.rasterize(weave);
    const alphas = new Set();
    for (let i = 3; i < frame.data.length; i += 4) alphas.add(frame.data[i]);
    assert.ok(alphas.has(128), '0.5 alpha 应编码为 128');
    assert.ok(alphas.has(255), '1.0 alpha 应编码为 255');
  });
});

describe('manifest — 清单坐标与矩阵的对应关系', () => {
  test('清单记录行列数、单元格尺寸、种子与调色板', () => {
    const weave = VWWeave.generateMatrix({
      palette: PALETTE, rows: 4, cols: 7, cellSize: 9, seed: 'manifest-1'
    });
    const manifest = VWManifest.buildManifest(weave);

    assert.equal(manifest.version, 1);
    assert.equal(manifest.rows, 4);
    assert.equal(manifest.cols, 7);
    assert.equal(manifest.cellSize, 9);
    assert.equal(manifest.seed, 'manifest-1');
    assert.deepEqual(manifest.palette, PALETTE);
    assert.deepEqual(manifest.atlas, { width: 63, height: 36 });
  });

  test('tiles 中每个坐标都与矩阵中的索引一致，且合起来覆盖全部格子', () => {
    const weave = VWWeave.generateMatrix({
      palette: PALETTE, rows: 6, cols: 8, cellSize: 5, seed: 'manifest-2'
    });
    const manifest = VWManifest.buildManifest(weave);

    assert.equal(manifest.tiles.length, PALETTE.length);
    const covered = new Set();

    manifest.tiles.forEach((tile) => {
      assert.equal(tile.index, manifest.tiles.indexOf(tile));
      assert.equal(tile.color, PALETTE[tile.index]);
      assert.equal(tile.cells.length, tile.rects.length);

      tile.cells.forEach((cell, i) => {
        const key = cell.row + ':' + cell.col;
        assert.ok(!covered.has(key), '坐标 ' + key + ' 被重复记录');
        covered.add(key);
        assert.equal(
          weave.matrix[cell.row][cell.col], tile.index,
          `清单坐标 (${cell.row},${cell.col}) 与矩阵索引不一致`
        );

        // 像素矩形必须与渲染层的边界计算一致
        const rect = tile.rects[i];
        assert.equal(rect.x, VWRender.cellBoundary(cell.col, weave.cellSize));
        assert.equal(rect.y, VWRender.cellBoundary(cell.row, weave.cellSize));
        assert.equal(rect.width,
          VWRender.cellBoundary(cell.col + 1, weave.cellSize) - rect.x);
        assert.equal(rect.height,
          VWRender.cellBoundary(cell.row + 1, weave.cellSize) - rect.y);
      });
    });

    assert.equal(covered.size, weave.rows * weave.cols);
  });

  test('每种被使用的调色板颜色在清单中至少有一个格子', () => {
    const weave = VWWeave.generateMatrix({
      palette: PALETTE, rows: 3, cols: 3, cellSize: 4, seed: 'manifest-3'
    });
    const manifest = VWManifest.buildManifest(weave);
    manifest.tiles.forEach((tile) => assert.ok(tile.cells.length >= 1));
  });

  test('颜色多于格子时清单只包含被采用的前缀颜色', () => {
    const weave = VWWeave.generateMatrix({
      palette: ['#100000', '#200000', '#300000', '#400000', '#500000'],
      rows: 2, cols: 2, cellSize: 3, seed: 'manifest-4'
    });
    const manifest = VWManifest.buildManifest(weave);
    assert.equal(manifest.tiles.length, 4);
    assert.deepEqual(manifest.palette, ['#100000', '#200000', '#300000', '#400000']);
    assert.equal(manifest.tiles[3].index, 3);
  });

  test('JSON 序列化可往返解析', () => {
    const weave = VWWeave.generateMatrix({
      palette: PALETTE, rows: 2, cols: 3, cellSize: 4, seed: 'json'
    });
    const manifest = VWManifest.buildManifest(weave);
    const parsed = JSON.parse(VWManifest.manifestToJson(manifest));
    assert.deepEqual(parsed, manifest);
  });
});

describe('PNG export — 与画布同源的 RGBA 字节', () => {
  test('编码出的 PNG 解码后与栅格化结果逐像素一致', () => {
    const weave = VWWeave.generateMatrix({
      palette: PALETTE, rows: 4, cols: 5, cellSize: 8, seed: 'png'
    });
    const frame = VWRender.rasterize(weave);
    const png = VWPng.encodePng(frame);

    assert.ok(Buffer.isBuffer(png));
    assert.deepEqual(png.subarray(0, 8),
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), 'PNG 签名正确');

    const decoded = decodePng(png);
    assert.equal(decoded.width, frame.width);
    assert.equal(decoded.height, frame.height);
    assert.deepEqual(decoded.data, new Uint8Array(frame.data));
  });

  test('同一织格两次编码内容完全一致（确定性导出）', () => {
    const weave = VWWeave.generateMatrix({
      palette: PALETTE, rows: 3, cols: 3, cellSize: 6, seed: 'png-determinism'
    });
    const frame = VWRender.rasterize(weave);
    assert.deepEqual(VWPng.encodePng(frame), VWPng.encodePng(frame));
  });
});
