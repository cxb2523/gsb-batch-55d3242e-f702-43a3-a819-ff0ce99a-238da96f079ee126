'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const VWWeave = require('../src/weave');

const PALETTE = ['#ff0000', '#00ff00', '#0000ff', '#ffff00'];

function assertValidMatrix(weave, rows, cols, paletteLen) {
  assert.equal(weave.rows, rows);
  assert.equal(weave.cols, cols);
  assert.equal(weave.matrix.length, rows);
  weave.matrix.forEach((row) => assert.equal(row.length, cols));

  const used = new Set();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = weave.matrix[r][c];
      assert.ok(Number.isInteger(idx), '矩阵元素必须是整数索引');
      assert.ok(idx >= 0 && idx < paletteLen, '索引不得越界');
      used.add(idx);
      if (c > 0) {
        assert.notEqual(weave.matrix[r][c], weave.matrix[r][c - 1],
          `水平相邻单元格同色 (r=${r}, c=${c})`);
      }
      if (r > 0) {
        assert.notEqual(weave.matrix[r][c], weave.matrix[r - 1][c],
          `垂直相邻单元格同色 (r=${r}, c=${c})`);
      }
    }
  }
  return used;
}

describe('weave generator — 正常生成', () => {
  test('输出正确形状的矩阵且所有索引在调色板范围内', () => {
    const weave = VWWeave.generateMatrix({
      palette: PALETTE, rows: 6, cols: 8, cellSize: 16, seed: 'abc'
    });
    assert.deepEqual(weave.palette, PALETTE);
    assert.equal(weave.cellSize, 16);
    assert.equal(weave.seed, 'abc');
    assertValidMatrix(weave, 6, 8, PALETTE.length);
  });

  test('调色板每种颜色至少出现一次（多种尺寸下都成立）', () => {
    for (const [rows, cols] of [[4, 4], [3, 7], [10, 10], [2, 2], [1, 5], [5, 1]]) {
      const weave = VWWeave.generateMatrix({
        palette: PALETTE, rows, cols, cellSize: 4, seed: 'coverage'
      });
      const used = assertValidMatrix(weave, rows, cols, PALETTE.length);
      assert.equal(used.size, PALETTE.length,
        `${rows}x${cols} 网格应覆盖全部 ${PALETTE.length} 种颜色`);
      PALETTE.forEach((_, i) => assert.ok(used.has(i), `颜色索引 ${i} 未出现`));
    }
  });

  test('颜色数多于格子数时按顺序取前若干个且不越界', () => {
    const longPalette = ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666'];
    const weave = VWWeave.generateMatrix({
      palette: longPalette, rows: 2, cols: 2, cellSize: 5, seed: 's'
    });
    assert.equal(weave.palette.length, 4);
    assert.deepEqual(weave.palette, longPalette.slice(0, 4));
    const used = assertValidMatrix(weave, 2, 2, 4);
    assert.equal(used.size, 4);
  });

  test('颜色数恰好等于格子数时每种颜色恰好出现一次', () => {
    const weave = VWWeave.generateMatrix({
      palette: ['#aa0000', '#00bb00', '#0000cc', '#dddd00'],
      rows: 2, cols: 2, cellSize: 3, seed: 'exact'
    });
    const flat = weave.matrix.flat();
    assert.deepEqual(flat.sort(), [0, 1, 2, 3]);
  });

  test('空字符串也是合法种子', () => {
    const weave = VWWeave.generateMatrix({
      palette: PALETTE, rows: 3, cols: 3, cellSize: 4, seed: ''
    });
    assertValidMatrix(weave, 3, 3, PALETTE.length);
  });
});

describe('weave generator — 确定性与种子', () => {
  test('同组输入重复生成完全一致', () => {
    const opts = { palette: PALETTE, rows: 7, cols: 9, cellSize: 12, seed: 'repeatable' };
    const a = VWWeave.generateMatrix(opts);
    const b = VWWeave.generateMatrix({ ...opts });
    assert.deepEqual(a.matrix, b.matrix);
    assert.deepEqual(a.paletteRgba, b.paletteRgba);
    // 再生成一次，确保 PRNG 没有跨调用共享状态。
    const c = VWWeave.generateMatrix({ ...opts });
    assert.deepEqual(c.matrix, a.matrix);
  });

  test('更换种子会改变分布（在有自由度的网格上）', () => {
    const matrices = new Set();
    for (const seed of ['seed-one', 'seed-two', 'seed-three', 'seed-four']) {
      const weave = VWWeave.generateMatrix({
        palette: PALETTE, rows: 8, cols: 8, cellSize: 4, seed
      });
      matrices.add(JSON.stringify(weave.matrix));
    }
    assert.equal(matrices.size, 4, '四个不同种子应产生四种不同矩阵');
  });

  test('FNV 哈希与 mulberry32 自身是确定性的', () => {
    assert.equal(VWWeave.hashSeed('hello'), VWWeave.hashSeed('hello'));
    assert.notEqual(VWWeave.hashSeed('hello'), VWWeave.hashSeed('world'));
    const r1 = VWWeave.mulberry32(12345);
    const r2 = VWWeave.mulberry32(12345);
    const seq1 = [r1(), r1(), r1()];
    const seq2 = [r2(), r2(), r2()];
    assert.deepEqual(seq1, seq2);
    assert.ok(seq1.every((v) => v >= 0 && v < 1));
  });
});

describe('weave generator — 单色调色板', () => {
  test('只有一种颜色时允许相邻重复并铺满', () => {
    const weave = VWWeave.generateMatrix({
      palette: ['#888888'], rows: 4, cols: 6, cellSize: 8, seed: 'mono'
    });
    assert.equal(weave.palette.length, 1);
    for (const row of weave.matrix) {
      for (const idx of row) assert.equal(idx, 0);
    }
  });

  test('单色 1x1 网格也正常', () => {
    const weave = VWWeave.generateMatrix({
      palette: ['#abcdef'], rows: 1, cols: 1, cellSize: 10, seed: 'x'
    });
    assert.deepEqual(weave.matrix, [[0]]);
  });
});

describe('weave generator — 非法参数拒绝', () => {
  const base = { palette: PALETTE, rows: 4, cols: 4, cellSize: 8, seed: 's' };

  function assertRejects(options, fragment) {
    assert.throws(
      () => VWWeave.generateMatrix(options),
      (err) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes(fragment),
          `错误信息应包含 "${fragment}"，实际为：${err.message}`);
        return true;
      }
    );
  }

  test('调色板为空数组时拒绝', () => {
    assertRejects({ ...base, palette: [] }, '调色板');
  });

  test('调色板缺失时拒绝', () => {
    const { palette, ...withoutPalette } = base;
    assertRejects(withoutPalette, '调色板');
  });

  test('行数为 0、负数、小数、非数字时拒绝', () => {
    assertRejects({ ...base, rows: 0 }, '行数');
    assertRejects({ ...base, rows: -3 }, '行数');
    assertRejects({ ...base, rows: 2.5 }, '行数');
    assertRejects({ ...base, rows: '4' }, '行数');
    assertRejects({ ...base, rows: NaN }, '行数');
  });

  test('列数为 0、负数、小数、非数字时拒绝', () => {
    assertRejects({ ...base, cols: 0 }, '列数');
    assertRejects({ ...base, cols: -1 }, '列数');
    assertRejects({ ...base, cols: 1.2 }, '列数');
    assertRejects({ ...base, cols: null }, '列数');
  });

  test('单元格尺寸小于 1 或非数字时拒绝', () => {
    assertRejects({ ...base, cellSize: 0 }, '单元格尺寸');
    assertRejects({ ...base, cellSize: 0.5 }, '单元格尺寸');
    assertRejects({ ...base, cellSize: -8 }, '单元格尺寸');
    assertRejects({ ...base, cellSize: NaN }, '单元格尺寸');
  });

  test('种子不是字符串时拒绝', () => {
    assertRejects({ ...base, seed: 42 }, '种子');
  });

  test('无法识别的颜色字符串时拒绝并指出具体颜色', () => {
    assertRejects({ ...base, palette: ['#fff', 'not-a-color'] }, 'not-a-color');
  });

  test('validateOptions 直接暴露且同样抛出可读错误', () => {
    assert.throws(() => VWWeave.validateOptions(null), /参数/);
  });
});
