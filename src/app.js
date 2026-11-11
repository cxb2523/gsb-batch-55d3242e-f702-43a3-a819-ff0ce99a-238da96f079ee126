/*
 * VoxelWeave Studio — shell / UI controller.
 *
 * Wires the controls panel to the generator, canvas and exporter. All state
 * lives in plain objects; initApp(root) returns a small controller so the
 * exact same wiring can be exercised in Node with a stub DOM.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./weave'),
      require('./render'),
      require('./manifest'),
      require('./export'),
      require('./colors')
    );
  } else {
    root.VWApp = factory(
      root.VWWeave, root.VWRender, root.VWManifest, root.VWExport, root.VWColors
    );
  }
})(typeof self !== 'undefined' ? self : this,
function (VWWeave, VWRender, VWManifest, VWExport, VWColors) {
  'use strict';

  var DEFAULT_PALETTE = [
    '#3fb950', '#58a6ff', '#d29922', '#f85149', '#bc8cff', '#39c5cf'
  ];

  /** Split a textarea value into color tokens (newlines, commas or spaces). */
  function parsePaletteText(text) {
    return String(text || '')
      .split(/[\n,;]+/)
      .map(function (token) { return token.trim(); })
      .filter(function (token) { return token.length > 0; });
  }

  function initApp(root) {
    var els = {
      rowsInput: root.querySelector('#rows-input'),
      colsInput: root.querySelector('#cols-input'),
      cellSizeInput: root.querySelector('#cellsize-input'),
      seedInput: root.querySelector('#seed-input'),
      paletteInput: root.querySelector('#palette-input'),
      palettePreview: root.querySelector('#palette-preview'),
      weaveBtn: root.querySelector('#weave-btn'),
      exportBtn: root.querySelector('#export-btn'),
      canvas: root.querySelector('#weave-canvas'),
      errorBanner: root.querySelector('#error-banner'),
      statusText: root.querySelector('#status-text')
    };

    var ctx = els.canvas && els.canvas.getContext ? els.canvas.getContext('2d') : null;
    // Real browser 2D contexts can consume ImageData. Probe construction
    // rather than trusting the global's existence (Node also exposes it).
    if (ctx && typeof ImageData === 'function') {
      try {
        // eslint-disable-next-line no-new
        new ImageData(new Uint8ClampedArray(4), 1, 1);
        ctx.supportsImageData = true;
      } catch (probeError) {
        ctx.supportsImageData = false;
      }
    }
    var state = {
      weave: null,
      lastError: null,
      exports: []
    };

    function showError(message) {
      state.lastError = message;
      if (els.errorBanner) {
        els.errorBanner.textContent = message;
        els.errorBanner.hidden = false;
      }
    }

    function clearError() {
      state.lastError = null;
      if (els.errorBanner) {
        els.errorBanner.textContent = '';
        els.errorBanner.hidden = true;
      }
    }

    function setStatus(text) {
      if (els.statusText) els.statusText.textContent = text;
    }

    function readControls() {
      return {
        rows: Number(els.rowsInput && els.rowsInput.value),
        cols: Number(els.colsInput && els.colsInput.value),
        cellSize: Number(els.cellSizeInput && els.cellSizeInput.value),
        seed: String(els.seedInput && els.seedInput.value != null ? els.seedInput.value : ''),
        palette: parsePaletteText(els.paletteInput && els.paletteInput.value)
      };
    }

    function renderPalettePreview(weave) {
      if (!els.palettePreview) return;
      els.palettePreview.innerHTML = '';
      weave.palette.forEach(function (color, index) {
        var swatch = document.createElement('span');
        swatch.className = 'palette-swatch';
        swatch.title = '索引 ' + index + ' · ' + color;
        swatch.style.background = VWColors.rgbaToCss(weave.paletteRgba[index]);
        var label = document.createElement('span');
        label.className = 'palette-swatch-label';
        label.textContent = index + ': ' + color;
        var item = document.createElement('span');
        item.className = 'palette-swatch-item';
        item.appendChild(swatch);
        item.appendChild(label);
        els.palettePreview.appendChild(item);
      });
    }

    function weaveNow() {
      clearError();
      var controls;
      try {
        controls = readControls();
        var result = VWWeave.generateMatrix(controls);
        state.weave = result;
        if (els.canvas) {
          VWRender.paintToCanvas(result, els.canvas, ctx);
        }
        renderPalettePreview(result);
        var size = VWRender.atlasSize(result.rows, result.cols, result.cellSize);
        setStatus(
          '已生成 ' + result.rows + ' × ' + result.cols +
          ' 织格，图集 ' + size.width + ' × ' + size.height + ' px，' +
          '使用 ' + result.palette.length + ' 种颜色，种子 "' + result.seed + '"'
        );
        return result;
      } catch (err) {
        showError(err.message);
        setStatus('生成失败：参数不合法，画布保持上一次的结果');
        return null;
      }
    }

    async function exportCurrent() {
      clearError();
      if (!state.weave) {
        showError('没有可导出的内容，请先点击“重新织格”生成织格');
        return null;
      }
      try {
        var baseName = 'voxelweave-' + state.weave.rows + 'x' + state.weave.cols +
          '-' + (state.weave.seed || 'no-seed');
        var files = await VWExport.exportWeave(state.weave, els.canvas, baseName);
        state.exports.push(files);
        setStatus('已导出 ' + files.pngFilename + ' 与 ' + files.jsonFilename);
        return files;
      } catch (err) {
        showError(err.message);
        return null;
      }
    }

    if (els.weaveBtn) els.weaveBtn.addEventListener('click', weaveNow);
    if (els.exportBtn) els.exportBtn.addEventListener('click', exportCurrent);

    return {
      els: els,
      state: state,
      parsePaletteText: parsePaletteText,
      readControls: readControls,
      weaveNow: weaveNow,
      exportCurrent: exportCurrent,
      showError: showError
    };
  }

  // Browser auto-init; tests call initApp() explicitly with a stub root.
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        root.__voxelweave = initApp(document);
      });
    } else {
      root.__voxelweave = initApp(document);
    }
  }

  return {
    DEFAULT_PALETTE: DEFAULT_PALETTE,
    parsePaletteText: parsePaletteText,
    initApp: initApp
  };
});
