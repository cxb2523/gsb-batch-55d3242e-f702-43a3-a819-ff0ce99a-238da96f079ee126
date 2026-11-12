import { test } from "node:test";
import assert from "node:assert/strict";

import {
  discCoverage,
  isBlackPixel,
  thicken,
  type RGBA,
} from "./thicken-reference.ts";

const BLACK: RGBA = [0, 0, 0, 1];
const TRANSPARENT: RGBA = [0, 0, 0, 0];
const WHITE: RGBA = [1, 1, 1, 1];

// Build a width*height buffer filled with a given pixel.
function fill(width: number, height: number, c: RGBA): RGBA[] {
  return Array.from({ length: width * height }, () => [...c] as RGBA);
}

test("disc coverage is continuous in the fractional radius", () => {
  // Inside the disc: fully covered.
  assert.equal(discCoverage(0, 0.5), 1);
  assert.equal(discCoverage(1, 1), 1);
  // Anti-aliased one-texel band: linear falloff.
  assert.equal(discCoverage(1, 0.5), 0.5);
  assert.equal(discCoverage(2, 1.25), 0.25);
  // Outside the band: nothing.
  assert.equal(discCoverage(2, 0.5), 0);
  assert.equal(discCoverage(3, 1), 0);
  // A growing radius can only ever increase coverage at a fixed distance.
  for (const d of [0.5, 1, 1.5, 2]) {
    let prev = -1;
    for (let r = 0; r <= 2.01; r += 0.25) {
      const c = discCoverage(d, r);
      assert.ok(c >= prev, `coverage decreased at d=${d}, r=${r}`);
      prev = c;
    }
  }
});

test("zero thickness leaves every pixel untouched", () => {
  const data = fill(5, 5, TRANSPARENT);
  data[12] = [...BLACK];
  const out = thicken(data, 5, 5, 0);
  assert.deepEqual(out, data);
});

test("sub-pixel thickness is not rounded away (the integer-loop bug)", () => {
  // A single black texel surrounded by white. With the old integer
  // `thickness/2` loop a thickness below 1 produced no spread at all; the
  // fractional shader must still darken the neighbors through its
  // anti-aliasing band.
  const data = fill(5, 5, WHITE);
  data[12] = [...BLACK]; // center texel (2,2)

  const out = thicken(data, 5, 5, 0.5);

  // The center stays fully black.
  assert.deepEqual(out[12], BLACK);
  // Every 4-connected neighbor is half-covered instead of being skipped.
  for (const i of [7, 11, 13, 17]) {
    const c = out[i];
    assert.ok(c[0] < 1 && c[0] > 0 && c[3] > 0, `texel ${i} untouched`);
  }
});

test("fractional thickness interpolates instead of jumping between integers", () => {
  const data = fill(9, 9, WHITE);
  data[40] = [...BLACK]; // center (4,4)

  const half = thicken(data, 9, 9, 0.5);
  const one = thicken(data, 9, 9, 1);
  const oneAndHalf = thicken(data, 9, 9, 1.5);

  // A texel one step away (d = 1): half covered at r=0.5, fully covered from
  // r=1 onwards.
  const near = 40 - 9;
  assert.ok(Math.abs(half[near][0] - 0.5) < 1e-9);
  assert.equal(one[near][0], 0);
  assert.equal(oneAndHalf[near][0], 0);

  // Two texels away (d = 2): untouched by r=1, partially reached at r=1.5.
  const far = 40 - 18;
  assert.equal(one[far][0], 1);
  assert.ok(oneAndHalf[far][0] > 0 && oneAndHalf[far][0] < 1);
});

test("only near-pure-black opaque pixels are dilated", () => {
  assert.equal(isBlackPixel(BLACK), true);
  assert.equal(isBlackPixel([0.05, 0.05, 0.05, 1]), true);
  assert.equal(isBlackPixel(WHITE), false);
  assert.equal(isBlackPixel([0.5, 0.5, 0.5, 1]), false);
  // Transparent black is background, not ink.
  assert.equal(isBlackPixel(TRANSPARENT), false);
  assert.equal(isBlackPixel([0, 0, 0, 0.2]), false);

  // A colored pixel must not be spread even when within the disc.
  const data = fill(5, 5, WHITE);
  const red: RGBA = [1, 0, 0, 1];
  data[12] = red;
  const out = thicken(data, 5, 5, 2);
  assert.deepEqual(out[12], red);
  assert.deepEqual(out[7], WHITE);
  assert.deepEqual(out[11], WHITE);
});

test("dilation never pollutes the transparent background", () => {
  // Black ink on a fully transparent canvas: only texels within the disc plus
  // its one-texel anti-aliasing band may change, and every changed texel stays
  // pure black (no color bleed). Texels beyond the band are exactly preserved.
  const data = fill(9, 9, TRANSPARENT);
  data[40] = [...BLACK]; // center (4,4)
  const r = 1.5;

  const out = thicken(data, 9, 9, r);

  for (let i = 0; i < out.length; i++) {
    const c = out[i];
    const x = i % 9;
    const y = Math.floor(i / 9);
    const d = Math.sqrt((x - 4) ** 2 + (y - 4) ** 2);

    if (d > r + 1) {
      assert.deepEqual(c, TRANSPARENT, `background at (${x},${y}) polluted`);
    } else if (d > 0) {
      // No color is ever introduced: dilated ink stays pure black.
      assert.equal(c[0] + c[1] + c[2], 0);
      assert.ok(c[3] > 0);
      if (d <= r) {
        // Fully inside the disc the texel becomes opaque black.
        assert.equal(c[3], 1);
      }
    }
  }
});

test("thicker radius reaches strictly further than a thinner one", () => {
  const data = fill(11, 11, WHITE);
  data[60] = [...BLACK]; // center (5,5)

  const thin = thicken(data, 11, 11, 1);
  const thick = thicken(data, 11, 11, 2);

  let thinInk = 0;
  let thickInk = 0;
  for (let i = 0; i < thin.length; i++) {
    if (thin[i][0] < 1) thinInk++;
    if (thick[i][0] < 1) thickInk++;
  }
  assert.ok(thickInk > thinInk);
});
