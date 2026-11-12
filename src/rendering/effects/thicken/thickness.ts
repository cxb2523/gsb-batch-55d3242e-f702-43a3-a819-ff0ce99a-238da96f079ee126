// Pure helpers for computing the outline "thicken" pass's thickness.
//
// The thicken pass dilates the black outline pixels by a disc whose radius is
// the `thickness` uniform, measured in *texels*. For the black line to keep a
// constant width on screen (in CSS pixels) the thickness must be recomputed
// from the camera projection each time the projection matrix changes, and
// scaled by the device pixel ratio.
//
// Everything in this file is intentionally free of three.js / DOM imports so
// that it can be exercised by the standalone tests under `tests/`.

// The target half-width of the black line, in CSS pixels. The full line width
// is roughly twice this value (the dilation spreads on both sides of each
// edge). Kept small so the outline reads like an IKEA-manual ink line.
export const OUTLINE_RADIUS_CSS_PX = 1.5;

// Clamp so a degenerate projection can never produce NaN/Infinity, and so the
// shader's fixed loop bound is never exceeded.
export const MAX_THICKNESS_TEXELS = 8;

export type ProjectionScale = {
  // Diagonal of the model's projected bounding box, in camera (world) units
  projected: number;
  // Diagonal of the camera's visible frustum, in the same camera units
  frustum: number;
  // Diagonal of the render target, in physical pixels (texels)
  renderTarget: number;
};

/** Diagonal of a rectangle given its width and height. */
export function diagonal(width: number, height: number): number {
  return Math.sqrt(width * width + height * height);
}

/**
 * Compute the thicken-pass radius (in texels) for a given projection.
 *
 * The part occupies the following diagonal on the render target:
 *
 *   partDiagonalTexels = renderTarget * projected / frustum
 *   partDiagonalCss    = partDiagonalTexels / devicePixelRatio
 *
 * A line whose radius is a fixed fraction (radiusCssPx / partDiagonalCss) of
 * that on-screen diagonal then keeps a constant CSS-pixel width regardless of
 * how large the part is projected. Scaling back to texels:
 *
 *   thickness = (radiusCssPx / partDiagonalCss) * partDiagonalTexels
 *             = radiusCssPx * devicePixelRatio
 *
 * i.e. the bounding-box terms cancel out: a line of constant screen width does
 * not depend on the model's size at all, only on the device pixel ratio. The
 * full projection is still passed in (and validated) so that this stays tied
 * to the camera-recenter chain where the diagonals are computed, and so a
 * degenerate projection degrades to "no thickening" instead of NaN.
 */
export function computeOutlineThickness(
  scale: ProjectionScale,
  devicePixelRatio: number,
  radiusCssPx: number = OUTLINE_RADIUS_CSS_PX,
): number {
  if (
    !(devicePixelRatio > 0) ||
    !(scale.frustum > 0) ||
    !(scale.renderTarget > 0) ||
    !(scale.projected >= 0)
  ) {
    return 0;
  }

  const partDiagonalTexels =
    scale.renderTarget * (scale.projected / scale.frustum);
  const partDiagonalCss = partDiagonalTexels / devicePixelRatio;

  let thickness: number;
  if (partDiagonalCss > 0) {
    thickness = (radiusCssPx / partDiagonalCss) * partDiagonalTexels;
  } else {
    // The part projects to nothing (empty geometry): fall back to the direct
    // device-pixel conversion rather than dividing by zero.
    thickness = radiusCssPx * devicePixelRatio;
  }

  if (!Number.isFinite(thickness)) {
    return 0;
  }
  return Math.max(0, Math.min(thickness, MAX_THICKNESS_TEXELS));
}
