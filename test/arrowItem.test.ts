import { test } from "node:test";
import assert from "node:assert/strict";
import { CoordsContext } from "../src/lib/coords.ts";
import { ArrowItem } from "../src/tools/arrow/item.ts";
import type { ArrowItemType } from "../src/tools/arrow/item.ts";

// Pure-data tests: arrow geometry is plain math, so no canvas is required.

const STROKE_WIDTH = 2;

const buildArrow = (
  x1: number,
  y1: number,
  x2: number,
  y2: number
): ArrowItem =>
  new ArrowItem(
    {
      x1,
      y1,
      x2,
      y2,
      options: { stroke: "#000000", strokeWidth: STROKE_WIDTH },
    } as ArrowItemType,
    "arrow-test"
  );

test("eraser hits the shaft using the radius + half line width threshold", () => {
  const arrow = buildArrow(0, 0, 100, 0);
  const radius = 5;
  const halfStroke = STROKE_WIDTH / 2;

  assert.equal(arrow.isHitByEraser(50, 0, radius), true);
  // Exactly at the threshold still counts as a hit.
  assert.equal(
    arrow.isHitByEraser(50, radius + halfStroke, radius),
    true
  );
  // Just beyond the threshold does not.
  assert.equal(
    arrow.isHitByEraser(50, radius + halfStroke + 0.5, radius),
    false
  );
});

test("eraser hits near an arrowhead wing tip, far from the shaft", () => {
  const arrow = buildArrow(0, 0, 100, 0);
  const radius = 2;

  // The upper wing tip sits at about (85.58, 6.94). A click on the tip is
  // ~6.94 world units away from the shaft: the old shaft-only test with
  // threshold radius + half line width (= 3) would miss it.
  const wingTip = { x: 85.5844981135613, y: 6.94213982588093 };
  const threshold = radius + STROKE_WIDTH / 2;

  assert.ok(Math.abs(wingTip.y) > threshold);
  assert.equal(arrow.isHitByEraser(wingTip.x, wingTip.y, radius), true);

  // A point in the middle of the upper barb, also well beyond the shaft
  // threshold, must be reachable through the barb segment.
  const barbMid = {
    x: (100 + wingTip.x) / 2,
    y: (0 + wingTip.y) / 2,
  };
  assert.ok(Math.abs(barbMid.y) > threshold);
  assert.equal(arrow.isHitByEraser(barbMid.x, barbMid.y, radius), true);

  // The symmetric lower barb is covered too.
  assert.equal(
    arrow.isHitByEraser(barbMid.x, -barbMid.y, radius),
    true
  );
});

test("eraser does not hit when far away from the whole arrow", () => {
  const arrow = buildArrow(0, 0, 100, 0);
  const radius = 5;

  // Empty corner, away from both the shaft and the arrowhead.
  assert.equal(arrow.isHitByEraser(20, 50, radius), false);
  assert.equal(arrow.isHitByEraser(-40, -40, radius), false);
  // Past the head but offset beyond the barbs.
  assert.equal(arrow.isHitByEraser(95, 40, radius), false);
});

test("arrow bounding box contains both wing tips and the half line width", () => {
  const arrow = buildArrow(0, 0, 100, 0);
  const box = arrow.getBoundingBox();
  const halfStroke = STROKE_WIDTH / 2;

  // Wingtips at about y = +/- 6.94, x ~= 85.58; the box must contain them and
  // still add the half-stroke margin.
  assert.ok(box.y <= -6.94213982588093 - halfStroke);
  assert.ok(box.y + box.height >= 6.94213982588093 + halfStroke);
  assert.ok(box.x <= 0 - halfStroke);
  assert.ok(box.x + box.width >= 100 + halfStroke);

  // Explicit expected box for the horizontal arrow.
  assert.deepEqual(box, {
    x: -halfStroke,
    y: -6.94213982588093 - halfStroke,
    width: 100 + halfStroke * 2,
    height: (6.94213982588093 + halfStroke) * 2,
  });
});

test("arrow bounding box covers the wing tips at every zoom and never shrinks", () => {
  const arrow = buildArrow(0, 0, 100, 0);
  const baseBox = arrow.getBoundingBox(1);
  const halfStroke = STROKE_WIDTH / 2;

  for (const zoom of [2, 0.5]) {
    const coords = new CoordsContext(0, 0, zoom);
    const box = arrow.getBoundingBox(coords.getZoom());

    // Wing tips are pure world geometry: still covered.
    assert.ok(box.y <= -6.94213982588093 - halfStroke * zoom);
    assert.ok(
      box.y + box.height >= 6.94213982588093 + halfStroke * zoom
    );

    // The geometry part (endpoints + wingtips) never changes with zoom.
    assert.equal(box.x + halfStroke * zoom, baseBox.x + halfStroke);
    assert.equal(
      box.x + box.width - halfStroke * zoom,
      baseBox.x + baseBox.width - halfStroke
    );
  }
});

test("arrow resize handles stay on the geometry of the bounding box", () => {
  const arrow = buildArrow(0, 0, 100, 0);

  for (const zoom of [1, 2, 0.5]) {
    const coords = new CoordsContext(0, 0, zoom);
    const handles = arrow.getResizeHandles(coords.getZoom());
    const box = arrow.getBoundingBox(coords.getZoom());

    assert.deepEqual(
      handles.map(({ name }) => name),
      ["point-1", "point-2"]
    );
    assert.deepEqual(
      { x: handles[0].x, y: handles[0].y },
      { x: 0, y: 0 }
    );
    assert.deepEqual(
      { x: handles[1].x, y: handles[1].y },
      { x: 100, y: 0 }
    );

    // Both endpoints belong to the box geometry at every zoom.
    for (const handle of handles) {
      assert.ok(
        handle.x >= box.x &&
          handle.x <= box.x + box.width &&
          handle.y >= box.y &&
          handle.y <= box.y + box.height
      );
    }
  }
});

test("a degenerate arrow (zero-length shaft) is still erasable at its point", () => {
  const arrow = buildArrow(20, 20, 20, 20);
  const radius = 4;

  // No shaft direction, so no barbs: the point itself must remain reachable.
  assert.equal(arrow.isHitByEraser(20, 20, radius), true);
  assert.equal(
    arrow.isHitByEraser(20 + radius + STROKE_WIDTH / 2, 20, radius),
    true
  );
  assert.equal(
    arrow.isHitByEraser(20 + radius + STROKE_WIDTH / 2 + 1, 20, radius),
    false
  );
});
