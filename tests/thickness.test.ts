import { test } from "node:test";
import assert from "node:assert/strict";

import {
  computeOutlineThickness,
  diagonal,
  OUTLINE_RADIUS_CSS_PX,
  MAX_THICKNESS_TEXELS,
  type ProjectionScale,
} from "../src/rendering/effects/thicken/thickness.ts";

// A representative 800x600 physical render target (e.g. a 400x300 CSS canvas
// at devicePixelRatio 2).
const RENDER_TARGET: ProjectionScale = {
  projected: 100,
  frustum: 200,
  renderTarget: diagonal(800, 600),
};

test("thickness is invariant under projected bounding-box scaling", () => {
  // The model's projected diagonal halves/doubles (slider zoom), and the
  // recentering refits the frustum by the same factor, so the part keeps the
  // same fraction of the screen. The delivered thickness must not move.
  const dpr = 2;
  const base = computeOutlineThickness(RENDER_TARGET, dpr);

  const zoomedOut: ProjectionScale = {
    ...RENDER_TARGET,
    projected: 50,
    frustum: 100,
  };
  const zoomedIn: ProjectionScale = {
    ...RENDER_TARGET,
    projected: 200,
    frustum: 400,
  };

  assert.ok(Math.abs(computeOutlineThickness(zoomedOut, dpr) - base) < 1e-9);
  assert.ok(Math.abs(computeOutlineThickness(zoomedIn, dpr) - base) < 1e-9);

  // Rotation changes the projected bbox diagonal without any frustum change;
  // the thickness must stay put as well.
  const rotated: ProjectionScale = {
    ...RENDER_TARGET,
    projected: 87,
  };
  assert.ok(Math.abs(computeOutlineThickness(rotated, dpr) - base) < 1e-9);
});

test("thickness follows the explicit diagonal derivation", () => {
  // Directly check the fraction-of-screen-diagonal math instead of only the
  // simplified constant-pixel result.
  const dpr = 2;
  const partDiagonalTexels =
    RENDER_TARGET.renderTarget *
    (RENDER_TARGET.projected / RENDER_TARGET.frustum);
  const partDiagonalCss = partDiagonalTexels / dpr;
  const expected =
    (OUTLINE_RADIUS_CSS_PX / partDiagonalCss) * partDiagonalTexels;

  assert.ok(
    Math.abs(computeOutlineThickness(RENDER_TARGET, dpr) - expected) < 1e-9,
  );
});

test("thickness scales linearly with the device pixel ratio", () => {
  const t1 = computeOutlineThickness(RENDER_TARGET, 1);
  const t2 = computeOutlineThickness(RENDER_TARGET, 2);
  const t3 = computeOutlineThickness(RENDER_TARGET, 3);

  // The radius is OUTLINE_RADIUS_CSS_PX physical texels per CSS pixel.
  assert.ok(Math.abs(t1 - OUTLINE_RADIUS_CSS_PX) < 1e-9);
  assert.ok(Math.abs(t2 - 2 * OUTLINE_RADIUS_CSS_PX) < 1e-9);
  assert.ok(Math.abs(t3 - 3 * OUTLINE_RADIUS_CSS_PX) < 1e-9);
  assert.ok(Math.abs(t2 / t1 - 2) < 1e-9);
  assert.ok(Math.abs(t3 / t1 - 3) < 1e-9);
});

test("thickness stays constant when the window (render target) is resized", () => {
  // Resizing the window triggers a recenter with a different render-target and
  // frustum diagonal, but the part's fraction of the screen and the CSS-pixel
  // radius are unchanged, so the texel thickness only depends on the DPR.
  const dpr = 1.5;
  const before = computeOutlineThickness(
    {
      projected: 120,
      frustum: 240,
      renderTarget: diagonal(1000, 800),
    },
    dpr,
  );
  const after = computeOutlineThickness(
    {
      projected: 80,
      frustum: 160,
      renderTarget: diagonal(500, 400),
    },
    dpr,
  );

  assert.ok(Math.abs(after - before) < 1e-9);
  assert.ok(Math.abs(before - OUTLINE_RADIUS_CSS_PX * dpr) < 1e-9);
});

test("a changed device pixel ratio re-scales the thickness on resize", () => {
  const scale = { ...RENDER_TARGET };
  assert.ok(
    Math.abs(
      computeOutlineThickness(scale, 1) * 2 - computeOutlineThickness(scale, 2),
    ) < 1e-9,
  );
});

test("degenerate projections produce no thickening instead of NaN", () => {
  assert.equal(computeOutlineThickness({ ...RENDER_TARGET, frustum: 0 }, 2), 0);
  assert.equal(
    computeOutlineThickness({ ...RENDER_TARGET, renderTarget: 0 }, 2),
    0,
  );
  assert.equal(computeOutlineThickness(RENDER_TARGET, 0), 0);
  assert.equal(computeOutlineThickness(RENDER_TARGET, NaN), 0);
  assert.equal(
    computeOutlineThickness({ ...RENDER_TARGET, projected: 0 }, 2),
    OUTLINE_RADIUS_CSS_PX * 2,
  );
});

test("thickness is clamped to the shader's loop bound", () => {
  const huge = computeOutlineThickness(RENDER_TARGET, 100);
  assert.equal(huge, MAX_THICKNESS_TEXELS);
});

test("diagonal helper", () => {
  assert.equal(diagonal(3, 4), 5);
  assert.equal(diagonal(0, 0), 0);
});
