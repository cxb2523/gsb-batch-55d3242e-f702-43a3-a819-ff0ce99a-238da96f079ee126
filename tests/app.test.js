'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const VWApp = require('../src/app');
const { createStubRoot, installDomStubs } = require('./helpers');

describe('app shell — 控件接线与错误展示（本地桩 DOM）', () => {
  let dom;
  beforeEach(() => { dom = installDomStubs(); });
  afterEach(() => dom.restore());

  test('点击“重新织格”生成矩阵、绘制画布并更新状态', () => {
    const root = createStubRoot();
    const app = VWApp.initApp(root);

    const weave = app.weaveNow();
    assert.ok(weave);
    assert.equal(weave.rows, 4);
    assert.equal(weave.cols, 5);
    assert.equal(app.state.weave, weave);
    assert.equal(root.byId['weave-canvas'].width, 50); // 5 cols * 10px
    assert.equal(root.byId['weave-canvas'].height, 40);
    assert.ok(root.byId['status-text'].textContent.includes('已生成'));
    assert.equal(root.byId['error-banner'].hidden, true);
    // 调色板预览为每种颜色创建了一个条目
    assert.equal(root.byId['palette-preview'].children.length, 3);
  });

  test('非法参数展示可读错误而不是清空画布', () => {
    const root = createStubRoot();
    const app = VWApp.initApp(root);

    app.weaveNow();
    const previousWidth = root.byId['weave-canvas'].width;

    root.byId['rows-input'].value = '0';
    const result = app.weaveNow();

    assert.equal(result, null);
    assert.equal(root.byId['error-banner'].hidden, false);
    assert.ok(root.byId['error-banner'].textContent.includes('行数'));
    // 画布保留上一次结果
    assert.equal(root.byId['weave-canvas'].width, previousWidth);
    assert.ok(app.state.weave !== null);
  });

  test('空调色板被拒绝并给出可读错误', () => {
    const root = createStubRoot({ 'palette-input': { value: '  \n , ' } });
    const app = VWApp.initApp(root);
    assert.equal(app.weaveNow(), null);
    assert.ok(root.byId['error-banner'].textContent.includes('调色板'));
  });

  test('未生成时点击导出会提示先织格', async () => {
    const root = createStubRoot();
    const app = VWApp.initApp(root);
    const files = await app.exportCurrent();
    assert.equal(files, null);
    assert.ok(root.byId['error-banner'].textContent.includes('先点击'));
  });

  test('导出同时触发 PNG 与 JSON 两个下载，且 JSON 与矩阵对应', async () => {
    const root = createStubRoot();
    const app = VWApp.initApp(root);
    app.weaveNow();

    const files = await app.exportCurrent();
    assert.ok(files);
    assert.ok(files.pngFilename.endsWith('.png'));
    assert.ok(files.jsonFilename.endsWith('.json'));

    // 两个 Blob：PNG（canvas.toBlob 桩）与 JSON（清单）
    assert.equal(dom.createdBlobs.length, 2);
    const jsonBlob = dom.createdBlobs.find((b) => b.options && b.options.type === 'application/json');
    assert.ok(jsonBlob, '应存在 application/json 清单 Blob');
    const manifest = JSON.parse(jsonBlob.parts[0]);
    assert.equal(manifest.rows, 4);
    assert.equal(manifest.cols, 5);
    assert.equal(manifest.seed, 'smoke-seed');
    assert.deepEqual(manifest.palette, ['#ff0000', '#00ff00', '#0000ff']);

    // 清单坐标与当前矩阵逐一对应
    const matrix = app.state.weave.matrix;
    let total = 0;
    manifest.tiles.forEach((tile) => {
      tile.cells.forEach((cell) => {
        assert.equal(matrix[cell.row][cell.col], tile.index);
        total++;
      });
    });
    assert.equal(total, 20);

    // 两个带 download 属性的锚点点击
    assert.equal(dom.createdAnchors.length, 2);
    assert.ok(dom.createdAnchors.every((a) => a.download));
  });

  test('调色板文本解析支持换行、逗号与分号混合分隔', () => {
    assert.deepEqual(
      VWApp.parsePaletteText('#aaa\n#bbb, #ccc ; #ddd\n'),
      ['#aaa', '#bbb', '#ccc', '#ddd']
    );
  });

  test('按钮事件确实绑定（模拟真实 click）', () => {
    const root = createStubRoot();
    VWApp.initApp(root);
    root.byId['weave-btn'].click();
    assert.ok(root.byId['status-text'].textContent.includes('已生成'));
  });
});
