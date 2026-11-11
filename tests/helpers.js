'use strict';

/*
 * Local test helpers — no third-party packages, no network access.
 *   - decodePng: parses the PNG bytes emitted by src/png.js back to RGBA
 *   - createStubRoot / installDomStubs: minimal DOM surface for app.js
 */

const zlib = require('node:zlib');

function readChunks(buf) {
  const chunks = [];
  let offset = 8; // skip signature
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    chunks.push({ type, data });
    offset += 12 + length;
  }
  return chunks;
}

/**
 * Decode an RGBA PNG produced by the project's own encoder (filter type 0
 * per scanline, 8-bit, color type 6). Returns { width, height, data }.
 */
function decodePng(buf) {
  if (!Buffer.isBuffer(buf)) throw new Error('decodePng expects a Buffer');
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buf.subarray(0, 8).equals(signature)) {
    throw new Error('not a PNG file (bad signature)');
  }
  const chunks = readChunks(buf);
  const ihdr = chunks.find((c) => c.type === 'IHDR');
  if (!ihdr) throw new Error('PNG missing IHDR');
  const width = ihdr.data.readUInt32BE(0);
  const height = ihdr.data.readUInt32BE(4);
  if (ihdr.data[8] !== 8 || ihdr.data[9] !== 6) {
    throw new Error('test decoder only supports 8-bit RGBA PNGs');
  }

  const idat = Buffer.concat(
    chunks.filter((c) => c.type === 'IDAT').map((c) => c.data)
  );
  const raw = zlib.inflateSync(idat);

  const stride = width * 4;
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const srcStart = y * (stride + 1);
    const filter = raw[srcStart];
    if (filter !== 0) {
      throw new Error('test decoder only supports filter type 0, got ' + filter);
    }
    raw.copy(out, y * stride, srcStart + 1, srcStart + 1 + stride);
  }
  return { width, height, data: new Uint8Array(out) };
}

function createElementStub(tagName) {
  return {
    tagName: String(tagName || 'div').toUpperCase(),
    children: [],
    style: {},
    dataset: {},
    value: '',
    textContent: '',
    innerHTML: '',
    hidden: false,
    href: '',
    download: '',
    className: '',
    title: '',
    width: 0,
    height: 0,
    classList: { add() {}, remove() {}, toggle() {} },
    listeners: {},
    appendChild(child) { this.children.push(child); return child; },
    removeChild(child) {
      const i = this.children.indexOf(child);
      if (i >= 0) this.children.splice(i, 1);
      return child;
    },
    addEventListener(type, fn) {
      (this.listeners[type] = this.listeners[type] || []).push(fn);
    },
    dispatch(type, event) {
      (this.listeners[type] || []).forEach((fn) => fn(event || {}));
    },
    click() { this.dispatch('click'); },
    getContext() {
      return {
        fillStyle: '',
        putImageData() {},
        fillRect() {}
      };
    },
    toBlob(cb) {
      // Async-ish: resolve on the next microtask like the real API.
      Promise.resolve().then(() => cb({ type: 'image/png', size: 1, fake: true }));
    }
  };
}

function createStubRoot(overrides, env) {
  const ids = [
    'rows-input', 'cols-input', 'cellsize-input', 'seed-input',
    'palette-input', 'palette-preview', 'weave-btn', 'export-btn',
    'weave-canvas', 'error-banner', 'status-text'
  ];
  const byId = {};
  ids.forEach((id) => { byId[id] = createElementStub(); });
  byId['rows-input'].value = '4';
  byId['cols-input'].value = '5';
  byId['cellsize-input'].value = '10';
  byId['seed-input'].value = 'smoke-seed';
  byId['palette-input'].value = '#ff0000\n#00ff00\n#0000ff';
  byId['weave-canvas'].toBlob = function toBlob(cb) {
    // Faithful to the real API: always a Blob, delivered on a microtask.
    const BlobCtor = (env && env.Blob) || globalThis.Blob;
    Promise.resolve().then(() => cb(new BlobCtor(['stub-png-bytes'], { type: 'image/png' })));
  };
  Object.assign(byId, overrides || {});
  return {
    querySelector(selector) {
      const id = selector.replace(/^#/, '');
      return byId[id] || null;
    },
    byId
  };
}

/**
 * Install just enough of the browser globals for app.js / export.js to run.
 * Returns a cleanup function that restores the previous globals.
 */
function installDomStubs() {
  const createdAnchors = [];
  const createdBlobs = [];
  const previous = {};

  function save(name, value) {
    previous[name] = globalThis[name];
    globalThis[name] = value;
  }

  save('document', {
    readyState: 'complete',
    createElement(tag) {
      const el = createElementStub(tag);
      if (String(tag).toUpperCase() === 'A') createdAnchors.push(el);
      return el;
    },
    addEventListener() {},
    body: createElementStub('body')
  });

  class FakeBlob {
    constructor(parts, options) {
      this.parts = parts;
      this.options = options;
      this.size = String(parts[0] || '').length;
      createdBlobs.push(this);
    }
  }
  save('Blob', FakeBlob);
  save('URL', {
    createObjectURL(blob) { return 'blob:stub/' + createdBlobs.indexOf(blob); },
    revokeObjectURL() {}
  });
  save('setTimeout', (fn) => { fn(); return 0; });

  return {
    createdAnchors,
    createdBlobs,
    restore() {
      Object.keys(previous).forEach((name) => {
        if (previous[name] === undefined) delete globalThis[name];
        else globalThis[name] = previous[name];
      });
    }
  };
}

module.exports = {
  decodePng,
  createElementStub,
  createStubRoot,
  installDomStubs
};
