// Headless browser validation (run via Edge/Chrome --headless, see package.json
// script "test:browser"):
//
//   1. Compiles the *actual* thicken fragment shader against a WebGL2 context
//      to catch GLSL syntax/type errors that the CPU reference tests cannot.
//   2. Runs the shader on small textures to check continuous (fractional)
//      thickness and the "black ink only, transparent background preserved"
//      semantics on the GPU itself.
//
// Framework-free static page; the headless shell fails if any assertion throws.
//
// GL conventions (same as three.js): texture row 0 is the BOTTOM and clip-space
// +y points up. Pixel buffers are therefore authored with a bottom-left row
// order, index (y * W + x), which matches readPixels directly.

import fragSource from "../../src/rendering/effects/thicken/frag.glsl?raw";

const vertSource = `
precision highp float;
attribute vec2 position; // clip-space position of a full-screen triangle
varying vec2 vUv;        // bottom-left UVs derived from clip space
void main() {
    vUv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
}
`;

const W = 9;
const H = 9;

const results: string[] = [];
function check(name: string, cond: boolean, detail = "") {
  if (!cond) throw new Error(`FAILED: ${name} ${detail}`);
  results.push(`ok - ${name}`);
}

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(
      `shader compile error: ${gl.getShaderInfoLog(sh)}\n--- source ---\n${src}`,
    );
  }
  return sh;
}

function makeTexture(
  gl: WebGL2RenderingContext,
  pixels: Uint8Array,
  w: number,
  h: number,
): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    w,
    h,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    pixels,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

function render(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  vao: WebGLVertexArrayObject,
  thickness: number,
  input: Uint8Array,
  w: number,
  h: number,
): Uint8Array {
  const tex = makeTexture(gl, input, w, h);
  gl.useProgram(program);
  gl.uniform1i(gl.getUniformLocation(program, "tInput"), 0);
  gl.uniform2f(gl.getUniformLocation(program, "texelSize"), 1 / w, 1 / h);
  gl.uniform1f(gl.getUniformLocation(program, "thickness"), thickness);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);

  gl.bindVertexArray(vao);
  // Clear to opaque white so a (buggy) missing draw can never look like ink.
  gl.clearColor(1, 1, 1, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  const out = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, out);
  gl.deleteTexture(tex);
  return out;
}

async function main() {
  // Size the drawing buffer before creating the context so it exactly matches
  // the texture/readback dimensions.
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
  if (!gl) throw new Error("WebGL2 unavailable in headless browser");

  // 1. The real fragment shader compiles (three.js normally injects the
  //    precision prefix; the standalone VS above carries its own).
  const vs = compile(gl, gl.VERTEX_SHADER, vertSource);
  const fs = compile(
    gl,
    gl.FRAGMENT_SHADER,
    "precision highp float;\n" + fragSource,
  );
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  check(
    "thicken shaders compile & link",
    gl.getProgramParameter(program, gl.LINK_STATUS) === true,
  );

  // One persistent VAO with a full-screen triangle; UVs are derived in the VS.
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  const posLoc = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  // Buffers use bottom-left row order: index (y * W + x), y = 0 at the bottom.
  const white = (): Uint8Array => {
    const p = new Uint8Array(W * H * 4).fill(255);
    for (let i = 3; i < p.length; i += 4) p[i] = 255;
    return p;
  };
  const px = (buf: Uint8Array, x: number, y: number, c = 0) =>
    buf[(y * W + x) * 4 + c];

  // 2. Fractional thickness spreads ink (regression for the integer loop).
  {
    const input = white();
    const cx = 4;
    const cy = 4;
    const idx = (cy * W + cx) * 4;
    input[idx] = 0;
    input[idx + 1] = 0;
    input[idx + 2] = 0;

    const r0 = render(gl, program, vao, 0, input, W, H);
    const rHalf = render(gl, program, vao, 0.5, input, W, H);

    check("radius 0 does not spread", px(r0, cx, cy + 1) === 255);
    check(
      "fractional 0.5 radius darkens neighbor",
      px(rHalf, cx, cy + 1) > 0 && px(rHalf, cx, cy + 1) < 255,
      `above=${px(rHalf, cx, cy + 1)} center=${px(rHalf, cx, cy)}`,
    );
    check("center remains black at 0.5", px(rHalf, cx, cy) === 0);
  }

  // 3. Transparent background is not polluted.
  {
    const input = new Uint8Array(W * H * 4); // all transparent
    const cx = 4;
    const cy = 4;
    const idx = (cy * W + cx) * 4;
    input[idx + 3] = 255; // opaque black center

    const out = render(gl, program, vao, 1.5, input, W, H);
    let polluted = false;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d > 2.5 + 1e-3 && px(out, x, y, 3) !== 0) polluted = true;
        if (
          px(out, x, y, 3) > 0 &&
          !(
            px(out, x, y, 0) === 0 &&
            px(out, x, y, 1) === 0 &&
            px(out, x, y, 2) === 0
          )
        ) {
          polluted = true;
        }
      }
    }
    check("transparent background preserved, ink stays black", !polluted);
  }

  // 4. Monotonicity: a larger radius reaches further.
  {
    const input = white();
    const cx = 4;
    const cy = 4;
    const idx = (cy * W + cx) * 4;
    input[idx] = input[idx + 1] = input[idx + 2] = 0;

    const thin = render(gl, program, vao, 1, input, W, H);
    const thick = render(gl, program, vao, 2, input, W, H);
    let thinInk = 0;
    let thickInk = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (px(thin, x, y) < 255) thinInk++;
        if (px(thick, x, y) < 255) thickInk++;
      }
    }
    check("larger radius covers more texels", thickInk > thinInk);
  }

  document.getElementById("results")!.textContent =
    results.join("\n") + "\nALL BROWSER CHECKS PASSED";
  console.log(results.join("\n"));
  console.log("ALL BROWSER CHECKS PASSED");
}

main().catch((err) => {
  document.getElementById("results")!.textContent = String(err?.stack ?? err);
  console.error(err);
  document.title = "TEST_FAILED";
});
