/*
 * VoxelWeave Studio — browser export layer.
 *
 * A single "export" action produces two downloads from the *current* weave
 * state:
 *   <name>.png  — the atlas, read straight from the visible canvas
 *   <name>.json — the manifest describing rows/cols/cell size/seed/palette and
 *                 the cell coordinates owned by each palette index
 *
 * PNG bytes come from canvas.toBlob(), i.e. exactly what the user sees; the
 * manifest is rebuilt from the same weave object, so the two files cannot
 * drift apart.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./manifest'));
  } else {
    root.VWExport = factory(root.VWManifest);
  }
})(typeof self !== 'undefined' ? self : this, function (VWManifest) {
  'use strict';

  function triggerDownload(blobOrUrl, filename) {
    var url = blobOrUrl instanceof Blob ? URL.createObjectURL(blobOrUrl) : blobOrUrl;
    var anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    if (blobOrUrl instanceof Blob) {
      // Revoke after the click has been dispatched.
      setTimeout(function () { URL.revokeObjectURL(url); }, 0);
    }
  }

  function downloadJson(manifest, filename) {
    var json = VWManifest.manifestToJson(manifest);
    var blob = new Blob([json], { type: 'application/json' });
    triggerDownload(blob, filename);
  }

  function canvasToBlob(canvas) {
    return new Promise(function (resolve, reject) {
      try {
        canvas.toBlob(function (blob) {
          if (blob) resolve(blob);
          else reject(new Error('画布导出 PNG 失败：toBlob 未返回数据'));
        }, 'image/png');
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Export the current canvas as PNG plus its JSON manifest.
   * Resolves with { pngFilename, jsonFilename } on success.
   */
  async function exportWeave(weave, canvas, baseName) {
    if (!weave || !canvas) {
      throw new Error('没有可导出的织格，请先点击“重新织格”');
    }
    var stem = (baseName || 'voxelweave-atlas').replace(/[^\w.-]+/g, '-');
    var manifest = VWManifest.buildManifest(weave);

    var pngBlob = await canvasToBlob(canvas);
    var pngFilename = stem + '.png';
    var jsonFilename = stem + '.json';

    triggerDownload(pngBlob, pngFilename);
    downloadJson(manifest, jsonFilename);

    return { pngFilename: pngFilename, jsonFilename: jsonFilename };
  }

  return {
    triggerDownload: triggerDownload,
    downloadJson: downloadJson,
    canvasToBlob: canvasToBlob,
    exportWeave: exportWeave
  };
});
