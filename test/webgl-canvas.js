/*
 * Local, offline tests for WebGL canvas resizing and pixel export.
 * Run with: npm test
 *
 * Covers:
 *  - rendering identifiable WebGL content and exporting it
 *  - changing width/height, resetting the viewport and exporting again with
 *    correct image size, full-viewport coverage and correct Y flip
 *  - toBuffer / toDataURL / createPNGStream / createJPEGStream / __ctx__
 *  - a readable error when STACKGL_resize_drawingbuffer is unavailable
 *  - plain 2D canvases (never used with WebGL) keeping their original behavior
 *
 * The test only uses the bundled `canvas` and `gl` native modules; it does not
 * touch the network or load any external images.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {createCanvas, loadImage} = require('../lib');

const VERT_SRC = `
attribute vec2 aPosition;
attribute vec2 aUV;
varying vec2 vUV;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
  vUV = aUV;
}`;

const FRAG_SRC = `
precision mediump float;
uniform vec4 uColor;
varying vec2 vUV;
void main() {
  gl_FragColor = uColor;
}`;

const RED = [255, 0, 0, 255];
const BLUE = [0, 0, 255, 255];

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if(!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader));
  }
  return shader;
}

function createProgram(gl) {
  const program = gl.createProgram();
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, VERT_SRC));
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC));
  gl.linkProgram(program);
  if(!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program));
  }
  return program;
}

// Two triangles covering the lower half of the GL viewport (y in [-1, 0]).
// The GL -> 2D Y flip on export moves it to the lower half of the image,
// which lets the assertions verify both coverage and the vertical flip.
const QUAD = new Float32Array([
  -1, -1, 1, -1, -1, 0,
  -1, 0, 1, -1, 1, 0,
]);

const UVS = new Float32Array([
  0, 0, 1, 0, 0, 1,
  0, 1, 1, 0, 1, 1,
]);

function drawQuad(gl, color) {
  const program = gl._testProgram || (gl._testProgram = createProgram(gl));
  gl.useProgram(program);

  let positionBuffer = gl._testPositionBuffer;
  if(!positionBuffer) {
    positionBuffer = gl.createBuffer();
    gl._testPositionBuffer = positionBuffer;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, QUAD, gl.STATIC_DRAW);
  const positionLoc = gl.getAttribLocation(program, 'aPosition');
  gl.enableVertexAttribArray(positionLoc);
  gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

  let uvBuffer = gl._testUVBuffer;
  if(!uvBuffer) {
    uvBuffer = gl.createBuffer();
    gl._testUVBuffer = uvBuffer;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, UVS, gl.STATIC_DRAW);
  const uvLoc = gl.getAttribLocation(program, 'aUV');
  gl.enableVertexAttribArray(uvLoc);
  gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 0, 0);

  gl.uniform4f(gl.getUniformLocation(program, 'uColor'),
    color[0] / 255, color[1] / 255, color[2] / 255, color[3] / 255);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

async function decode(buffer) {
  const tmp = path.join(os.tmpdir(), `node-canvas-webgl-test-${process.pid}-${buffer.length}.png`);
  fs.writeFileSync(tmp, buffer);
  try {
    return await loadImage(tmp);
  } finally {
    fs.unlinkSync(tmp);
  }
}

function pixelAt(img, x, y) {
  const probe = createCanvas(img.width, img.height);
  const ctx = probe.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const {data} = ctx.getImageData(x, y, 1, 1);
  return [data[0], data[1], data[2], data[3]];
}

function assertColor(actual, expected, tolerance, message) {
  for(let i = 0; i < 4; i++) {
    assert.ok(Math.abs(actual[i] - expected[i]) <= tolerance,
      `${message}: expected [${expected}] (±${tolerance}), got [${actual}]`);
  }
}

function collectStream(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

async function testRenderAndResize() {
  const canvas = createCanvas(16, 16);
  const gl = canvas.getContext('webgl');
  assert.ok(gl, 'should create a WebGL context');

  // First render/export at the original size.
  drawQuad(gl, RED);
  const first = canvas.toBuffer('image/png');
  const img1 = await decode(first);
  assert.strictEqual(img1.width, 16);
  assert.strictEqual(img1.height, 16);
  // The quad covers the GL lower half; the GL -> 2D Y flip moves it to the
  // lower half of the exported image, while the GL top stays at the image top.
  assertColor(pixelAt(img1, 8, 15), RED, 2, 'lower row should be the flipped red quad');
  assertColor(pixelAt(img1, 0, 15), RED, 2, 'lower-left should be covered (full width)');
  assertColor(pixelAt(img1, 15, 15), RED, 2, 'lower-right should be covered (full width)');
  assertColor(pixelAt(img1, 8, 0), [0, 0, 0, 255], 2, 'upper row should stay cleared');

  // Resize (both dimensions, non-square), then reset the viewport and redraw.
  canvas.width = 24;
  canvas.height = 32;
  gl.viewport(0, 0, canvas.width, canvas.height);
  assert.deepStrictEqual(gl.getParameter(gl.VIEWPORT), Int32Array.from([0, 0, 24, 32]),
    'viewport should match the new canvas size');
  drawQuad(gl, BLUE);

  // toBuffer export with the new size.
  const img2 = await decode(canvas.toBuffer('image/png'));
  assert.strictEqual(img2.width, 24, 'exported width should follow the canvas width');
  assert.strictEqual(img2.height, 32, 'exported height should follow the canvas height');
  assertColor(pixelAt(img2, 12, 31), BLUE, 2, 'lower row should be the flipped blue quad');
  assertColor(pixelAt(img2, 23, 31), BLUE, 2, 'new right edge should be covered, not clipped');
  assertColor(pixelAt(img2, 0, 31), BLUE, 2, 'new left edge should be covered');
  assertColor(pixelAt(img2, 12, 0), [0, 0, 0, 255], 2, 'top row should stay cleared');

  // toDataURL export at the new size.
  const url = canvas.toDataURL();
  assert.ok(url.startsWith('data:image/png;base64,'), 'toDataURL should return a PNG data URL');
  const img3 = await decode(Buffer.from(url.split(',')[1], 'base64'));
  assert.strictEqual(img3.width, 24);
  assert.strictEqual(img3.height, 32);
  assertColor(pixelAt(img3, 12, 31), BLUE, 2, 'toDataURL pixels should match the GL framebuffer');

  // __ctx__ readback at the new size.
  const ctx2d = canvas.__ctx__;
  assert.strictEqual(ctx2d.canvas.width, 24);
  assert.strictEqual(ctx2d.canvas.height, 32);
  const fromCtx = ctx2d.getImageData(12, 31, 1, 1).data;
  assertColor([fromCtx[0], fromCtx[1], fromCtx[2], fromCtx[3]], BLUE, 2,
    '__ctx__ should expose the flipped GL pixels');

  // createPNGStream export at the new size.
  const pngBuffer = await collectStream(canvas.createPNGStream());
  const img4 = await decode(pngBuffer);
  assert.strictEqual(img4.width, 24);
  assert.strictEqual(img4.height, 32);
  assertColor(pixelAt(img4, 12, 31), BLUE, 2, 'PNG stream should contain the GL pixels');

  // createJPEGStream export at the new size (lossy, hence a loose tolerance).
  const jpegBuffer = await collectStream(canvas.createJPEGStream());
  const img5 = await new Promise((resolve, reject) => {
    const tmp = path.join(os.tmpdir(), `node-canvas-webgl-test-${process.pid}.jpg`);
    fs.writeFileSync(tmp, jpegBuffer);
    loadImage(tmp).then(img => {
      fs.unlinkSync(tmp);
      resolve(img);
    }, reject);
  });
  assert.strictEqual(img5.width, 24);
  assert.strictEqual(img5.height, 32);
  assertColor(pixelAt(img5, 12, 31), BLUE, 60, 'JPEG stream should contain the blue quad');
}

function testMissingExtension() {
  const canvas = createCanvas(16, 16);
  const gl = canvas.getContext('webgl');
  const originalGetExtension = gl.getExtension.bind(gl);

  // Simulate a GL implementation without the resize extension.
  gl.getExtension = function (name) {
    if(name === 'STACKGL_resize_drawingbuffer') return null;
    return originalGetExtension(name);
  };

  assert.throws(() => {
    canvas.width = 32;
  }, error => error
    && error.name === 'NotSupportedError'
    && /STACKGL_resize_drawingbuffer/.test(error.message)
    && /32x16/.test(error.message),
  'resizing without the extension should throw a readable NotSupportedError');

  assert.throws(() => {
    canvas.height = 24;
  }, error => error
    && error.name === 'NotSupportedError'
    && /STACKGL_resize_drawingbuffer/.test(error.message)
    && /16x24/.test(error.message),
  'the height setter should report the same readable error');

  gl.getExtension = originalGetExtension;
}

function test2DCanvasUnaffected() {
  const canvas = createCanvas(8, 8);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgb(0,128,0)';
  ctx.fillRect(0, 0, 8, 4);

  const buffer = canvas.toBuffer('image/png');
  return decode(buffer).then(img => {
    assert.strictEqual(img.width, 8);
    assert.strictEqual(img.height, 8);
    assertColor(pixelAt(img, 4, 2), [0, 128, 0, 255], 2, '2D drawing should export unchanged');
    assertColor(pixelAt(img, 4, 6), [0, 0, 0, 0], 2, 'untouched 2D area should stay transparent');
    assert.ok(!canvas.__gl__, 'no GL context should have been created for a 2D canvas');
  });
}

(async () => {
  await testRenderAndResize();
  console.log('  ✓ render, resize + viewport sync and all export entry points');
  testMissingExtension();
  console.log('  ✓ missing STACKGL_resize_drawingbuffer produces a readable error');
  await test2DCanvasUnaffected();
  console.log('  ✓ 2D-only canvases keep their original export behavior');
  console.log('All WebGL canvas tests passed.');
})().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
