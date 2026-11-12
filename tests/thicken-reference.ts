// CPU reference implementation of the thicken fragment shader
// (src/rendering/effects/thicken/frag.glsl).
//
// The actual shader runs on the GPU and cannot be unit-tested headlessly in
// plain Node. This module mirrors the shader's logic one-to-one so that its
// observable semantics — continuous (fractional) thickness, only dilating
// near-pure-black opaque pixels, never polluting transparent pixels — can be
// asserted in the standalone tests. Keep the two in sync when changing the
// shader.

export type RGBA = [number, number, number, number];

const BLACK_EPSILON_SQ = 0.02;
const ALPHA_THRESHOLD = 0.5;

/** Mirrors `isBlackPixel` in the fragment shader. */
export function isBlackPixel(c: RGBA): boolean {
  return (
    c[3] > ALPHA_THRESHOLD &&
    c[0] * c[0] + c[1] * c[1] + c[2] * c[2] < BLACK_EPSILON_SQ
  );
}

/** Mirrors `discCoverage` in the fragment shader. */
export function discCoverage(d: number, r: number): number {
  if (d <= r) return 1;
  if (d <= r + 1) return Math.max(0, Math.min(1, r + 1 - d));
  return 0;
}

/**
 * Dilate the black pixels of a row-major RGBA buffer by a disc of the given
 * (possibly fractional) radius, in texels.
 *
 * @param data row-major buffer of `width * height` RGBA pixels, channels in 0..1
 * @param width buffer width in texels
 * @param height buffer height in texels
 * @param thickness disc radius in texels; any non-negative float
 * @returns a new buffer with the dilation applied
 */
export function thicken(
  data: RGBA[],
  width: number,
  height: number,
  thickness: number,
): RGBA[] {
  const r = Math.max(thickness, 0);
  const maxRadius = 8;

  const at = (x: number, y: number): RGBA => data[y * width + x];

  const out: RGBA[] = data.map((c) => [...c] as RGBA);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let coverage = isBlackPixel(at(x, y)) ? 1 : 0;

      for (let i = -maxRadius; i <= maxRadius; i++) {
        for (let j = -maxRadius; j <= maxRadius; j++) {
          const d = Math.sqrt(i * i + j * j);
          if (d > r + 1 || d > maxRadius + 1) {
            continue;
          }

          const nx = x + j;
          const ny = y + i;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            // Out-of-bounds samples are never black, same as the GPU's clamp
            // behavior never producing ink outside the frame.
            continue;
          }

          if (isBlackPixel(at(nx, ny))) {
            coverage = Math.max(coverage, discCoverage(d, r));
          }
        }
      }

      if (coverage > 0) {
        const base = at(x, y);
        // gl_FragColor = mix(base, black, coverage)
        out[y * width + x] = [
          base[0] * (1 - coverage),
          base[1] * (1 - coverage),
          base[2] * (1 - coverage),
          base[3] * (1 - coverage) + 1 * coverage,
        ];
      }
    }
  }

  return out;
}
