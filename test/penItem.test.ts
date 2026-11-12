import { test } from "node:test";
import assert from "node:assert/strict";
import { CoordsContext } from "../src/lib/coords.ts";
import { PenItem } from "../src/tools/pen/item.ts";
import type { PenItemType } from "../src/tools/pen/item.ts";

// Pure-data helpers: no canvas, no browser APIs are needed to exercise the
// bounding-box, resize-handle and eraser-hit geometry.

const buildPen = (
  path: { x: number; y: number }[],
  size: number
): PenItem =>
  new PenItem(
    {
      path,
      options: { color: "#000000", size },
    } as PenItemType,
    "pen-test"
  );

test("pen bounding box reserves the zoomed half line width (zoom = 2)", () => {
  const size = 6;
  const pen = buildPen(
    [
      { x: 0, y: 0 },
      { x: 100, y: 50 },
    ],
    size
  );
  const zoom = 2;
  const coords = new CoordsContext(0, 0, zoom);

  const box = pen.getBoundingBox(coords.getZoom());
  const half = (size * zoom) / 2;

  assert.deepEqual(box, {
    x: 0 - half,
    y: 0 - half,
    width: 100 + half * 2,
    height: 50 + half * 2,
  });

  // The box must be strictly larger than the zoom = 1 one, because the
  // rendered stroke itself is twice as wide on screen.
  const baseBox = pen.getBoundingBox(1);
  assert.ok(box.width > baseBox.width);
  assert.ok(box.height > baseBox.height);
});

test("pen bounding box shrinks its margin with the line width (zoom = 0.5)", () => {
  const size = 6;
  const pen = buildPen(
    [
      { x: 0, y: 0 },
      { x: 100, y: 50 },
    ],
    size
  );
  const zoom = 0.5;
  const coords = new CoordsContext(0, 0, zoom);

  const box = pen.getBoundingBox(coords.getZoom());
  const half = (size * zoom) / 2;

  assert.deepEqual(box, {
    x: 0 - half,
    y: 0 - half,
    width: 100 + half * 2,
    height: 50 + half * 2,
  });

  const baseBox = pen.getBoundingBox(1);
  assert.ok(box.width < baseBox.width);
  assert.ok(box.height < baseBox.height);
});

test("pen bounding box at zoom = 1 matches the historical behavior", () => {
  const size = 6;
  const pen = buildPen(
    [
      { x: 10, y: -20 },
      { x: 40, y: 30 },
    ],
    size
  );

  assert.deepEqual(pen.getBoundingBox(), pen.getBoundingBox(1));
  assert.deepEqual(pen.getBoundingBox(1), {
    x: 10 - size / 2,
    y: -20 - size / 2,
    width: 30 + size,
    height: 50 + size,
  });
});

test("pen resize handle sits on the corner of the zoom-aware bounding box", () => {
  const size = 6;
  const pen = buildPen(
    [
      { x: 0, y: 0 },
      { x: 100, y: 50 },
    ],
    size
  );

  for (const zoom of [1, 2, 0.5]) {
    const coords = new CoordsContext(0, 0, zoom);
    const box = pen.getBoundingBox(coords.getZoom());
    const handles = pen.getResizeHandles(coords.getZoom());

    assert.equal(handles.length, 1);
    assert.equal(handles[0].name, "bottom-right");
    assert.equal(handles[0].x, box.x + box.width);
    assert.equal(handles[0].y, box.y + box.height);
  }
});

test("pen eraser hit keeps the radius + half line width threshold semantics", () => {
  const size = 6;
  const radius = 5;
  const pen = buildPen(
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    size
  );

  // On the segment.
  assert.equal(pen.isHitByEraser(50, 0, radius), true);

  // Just within radius + half line width (= 5 + 3 = 8).
  assert.equal(pen.isHitByEraser(50, 7.9, radius), true);

  // Farther away than the threshold: not hit, regardless of the box margin.
  assert.equal(pen.isHitByEraser(50, 9, radius), false);

  // A single-point stroke is tested against the point itself.
  const dot = buildPen([{ x: 10, y: 10 }], size);
  assert.equal(dot.isHitByEraser(10 + 7, 10, radius), true);
  assert.equal(dot.isHitByEraser(10 + 9, 10, radius), false);
});
