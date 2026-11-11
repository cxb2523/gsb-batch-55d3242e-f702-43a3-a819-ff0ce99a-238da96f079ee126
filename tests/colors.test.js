'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const VWColors = require('../src/colors');

describe('colors — 颜色解析与归一化', () => {
  test('支持 #rgb / #rrggbb / #rrggbbaa 三种十六进制形式', () => {
    assert.deepEqual(VWColors.parseColor('#fff'), [255, 255, 255, 255]);
    assert.deepEqual(VWColors.parseColor('#0a0b0c'), [10, 11, 12, 255]);
    assert.deepEqual(VWColors.parseColor('#00000000'), [0, 0, 0, 0]);
    assert.deepEqual(VWColors.parseColor('#ffffff80'), [255, 255, 255, 128]);
  });

  test('支持 rgb() 与 rgba()，含百分号与 alpha 钳制', () => {
    assert.deepEqual(VWColors.parseColor('rgb(10, 20, 30)'), [10, 20, 30, 255]);
    assert.deepEqual(VWColors.parseColor('rgba(10, 20, 30, 0.5)'), [10, 20, 30, 128]);
    assert.deepEqual(VWColors.parseColor('rgba(100%, 0%, 50%, 1)'), [255, 0, 128, 255]);
    assert.deepEqual(VWColors.parseColor('rgb(300, -5, 128)'), [255, 0, 128, 255]);
    assert.deepEqual(VWColors.parseColor('rgba(1, 2, 3, 2)'), [1, 2, 3, 255]);
  });

  test('非法颜色抛出包含原值的可读错误', () => {
    assert.throws(() => VWColors.parseColor('red'), /red/);
    assert.throws(() => VWColors.parseColor('#12'), /无法识别/);
    assert.throws(() => VWColors.parseColor(''), /空颜色/);
    assert.throws(() => VWColors.parseColor(42), /字符串/);
  });

  test('rgbaToCss 生成可用的 CSS 颜色字符串', () => {
    assert.equal(VWColors.rgbaToCss([255, 0, 0, 255]), 'rgba(255,0,0,1.000)');
    assert.equal(VWColors.rgbaToCss([0, 0, 0, 128]), 'rgba(0,0,0,0.502)');
  });
});
