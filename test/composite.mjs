/**
 * Regression tests for slot compositing order and stale-art suppression.
 *
 * Every PSD here is generated in a temp folder with writePsd and every SKU is
 * painted in memory — no network, no real artwork. Coverage:
 *
 *   1. z-pixel.psd  — stale product art lives BELOW the slot layer; a
 *      decoration layer ABOVE the slot overlaps the drawn SKU and must still
 *      cover it (pixel judgment). Same-group vs cross-group overlap at the 25%
 *      boundary, full-canvas background protection, stacked shadow copies are
 *      hidden, and suppressed siblings never inflate the fitting box.
 *   2. two-slot.psd — a shadow copy resembling two adjacent slots must stay
 *      with its own slot (best match), leaving the other slot's fit box alone.
 *   3. root-slot.psd — a slot at the document root still suppresses stale root
 *      siblings while the full-bleed background survives.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createCanvas } from '@napi-rs/canvas'
import { writePsd } from 'ag-psd'

import { parseTemplate, buildScene } from '../src/core/psd.js'
import { setCanvasFactory } from '../src/core/canvas.js'
import { initializeCanvas } from 'ag-psd'
import { drawScene, measureContent, DEFAULT_SETTINGS, DEFAULT_ADJUST } from '../src/core/fit.js'

setCanvasFactory((width, height) => createCanvas(width, height))
initializeCanvas((width, height) => createCanvas(width, height))

function fillCanvas(width, height, color) {
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = color
  ctx.fillRect(0, 0, width, height)
  return canvas
}

function layer(name, left, top, right, bottom, color) {
  return { name, left, top, right, bottom, canvas: fillCanvas(right - left, bottom - top, color) }
}

/**
 * Stale art below the slot, a stacked shadow copy also below it, same-group and
 * cross-group decorations straddling the 25% overlap threshold, and a kept
 * decoration above the slot that overlaps the SKU area.
 */
function buildZPixelPsd() {
  return writePsd({
    width: 800,
    height: 800,
    children: [
      layer('背景', 0, 0, 800, 800, '#cccccc'),
      {
        name: '主图',
        opened: true,
        children: [
          // Stale product art at the BOTTOM of the group, crossing the slot's
          // right edge so suppression is visible both inside and outside.
          layer('旧图', 300, 430, 560, 590, '#00aa00'),
          // Near-identical stacked shadow copy: must merge into the slot
          // cluster (union rect 260..540 x 230..614) and never be drawn.
          layer('产品位阴影', 262, 236, 538, 614, '#000033'),
          layer('槽位', 260, 230, 540, 610, '#0000cc'),
          // Same-group sibling fully inside the slot: >= 25% overlap, hidden.
          layer('组内装饰', 320, 380, 420, 520, '#00cccc'),
          // Same-group sibling touching only the slot's right edge: zero box
          // overlap, must survive even though it shares the group.
          layer('小角标', 540, 300, 560, 340, '#ffff00'),
        ],
      },
      {
        name: '装饰',
        opened: true,
        children: [
          // Kept decoration ABOVE the slot in z-order, overlapping the SKU
          // area: it must render on top of the SKU.
          layer('装饰保留', 300, 300, 460, 380, '#ffaa00'),
          // Different group, no overlap with the slot: always retained.
          layer('组外保留', 600, 300, 720, 460, '#aa66ff'),
        ],
      },
    ],
  })
}

function buildTwoSlotPsd() {
  return writePsd({
    width: 800,
    height: 800,
    children: [
      layer('背景', 0, 0, 800, 800, '#cccccc'),
      {
        name: '主图',
        opened: true,
        children: [
          layer('槽位A', 210, 230, 490, 610, '#0000cc'),
          layer('槽位B', 230, 230, 510, 610, '#0000aa'),
          // Offset (4,2) from B but (16,2) from A: passes every stacked-copy
          // gate for BOTH slots, yet clearly belongs to B.
          layer('阴影B', 226, 232, 506, 612, '#000066'),
        ],
      },
    ],
  })
}

function buildRootSlotPsd() {
  return writePsd({
    width: 800,
    height: 800,
    children: [
      layer('背景', 0, 0, 800, 800, '#cccccc'),
      // Root-level stale art and decoration: siblings of the slot itself.
      layer('旧图', 300, 270, 560, 530, '#00aa00'),
      layer('槽位', 260, 230, 540, 610, '#0000cc'),
      layer('顶饰', 300, 260, 400, 320, '#ffff00'),
    ],
  })
}

async function parseFixture(cwd, name, data) {
  const file = path.join(cwd, name)
  await fs.writeFile(file, Buffer.from(data))
  return parseTemplate({
    name,
    size: (await fs.stat(file)).size,
    arrayBuffer: async () => (await fs.readFile(file)).buffer,
  })
}

/** Render a scene with an in-memory SKU and return raw RGBA pixels. */
function renderScene(scene, sku, width, height) {
  const content = measureContent(sku)
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  drawScene(ctx, scene, sku, content, DEFAULT_SETTINGS, DEFAULT_ADJUST)
  return ctx.getImageData(0, 0, width, height).data
}

function pixel(data, width, x, y) {
  const index = (y * width + x) * 4
  return [data[index], data[index + 1], data[index + 2], data[index + 3]]
}

async function main() {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'psd-composite-'))
  const cwd = await fs.realpath(workspace)
  const sku = fillCanvas(300, 400, '#e02020')

  try {
    // === 1. stale art below, decoration above, overlap threshold, box union ==
    const doc = await parseFixture(cwd, 'z-pixel.psd', buildZPixelPsd())
    doc.slots = new Set([doc.leaves.find((leaf) => leaf.name === '槽位').id])
    const scene = buildScene(doc)

    assert.deepEqual(
      scene.suppressed.map((item) => item.name),
      ['旧图', '组内装饰'],
      'only the >=25% same-group siblings are suppressed',
    )
    assert.ok(!scene.suppressed.some((item) => item.name === '小角标'), 'edge-touching sibling survives')
    assert.ok(!scene.suppressed.some((item) => item.name === '装饰保留'), 'cross-group decoration survives')
    assert.ok(!scene.suppressed.some((item) => item.name === '产品位阴影'), 'stacked copies are not reported as suppressed')

    const slotPart = scene.slots[0]
    // Union of slot (260..540 x 230..610) with its shadow copy
    // (262..538 x 236..614): neither the big stale art nor 组内装饰 may
    // inflate the designer's fitting box.
    assert.deepEqual(
      [slotPart.rect.x, slotPart.rect.y, slotPart.rect.w, slotPart.rect.h],
      [260, 230, 280, 384],
      'fit rect is the slot + stacked-copy union only',
    )

    // The slot part stays exactly where the slot layer sits: background run
    // before it, every kept decoration (including same-group 小角标) after it.
    assert.equal(scene.parts[0].kind, 'layers')
    assert.equal(scene.parts[1].kind, 'slot')
    assert.equal(scene.parts[1].leafId, slotPart.leafId)
    assert.equal(scene.parts[2].kind, 'layers')
    assert.equal(scene.parts[2].count, 3, '小角标 plus two cross-group decorations kept above the SKU')
    assert.equal(scene.parts.length, 3, 'no hidden cluster member leaks into an extra layer run')

    const data = renderScene(scene, sku, 800, 800)
    const closeTo = ([r, g, b], [tr, tg, tb], tolerance = 6) =>
      Math.abs(r - tr) <= tolerance && Math.abs(g - tg) <= tolerance && Math.abs(b - tb) <= tolerance
    const RED = [224, 32, 32]
    const GRAY = [204, 204, 204]

    // SKU covers the slot center; stale green art under it never shows.
    assert.ok(closeTo(pixel(data, 800, 400, 400), RED), 'SKU painted at the slot layer position')
    assert.ok(closeTo(pixel(data, 800, 350, 500), RED), 'old art below the slot stays hidden under the SKU')

    // The kept decoration above the slot overlaps the SKU and must win.
    assert.ok(
      closeTo(pixel(data, 800, 380, 340), [255, 170, 0]),
      'decoration above the slot still covers the SKU edge',
    )

    // Stale art crossed the slot's right edge: the part outside the slot is
    // gone too (background gray), proving the whole sibling was suppressed.
    assert.ok(closeTo(pixel(data, 800, 555, 500), GRAY), 'stale art outside the slot box is suppressed')

    // The stacked shadow copy's lone pixels (below the SKU's fitted extent)
    // must not leak — this is the "two products" failure mode.
    assert.ok(closeTo(pixel(data, 800, 400, 612), GRAY), 'stacked shadow copy is hidden, not drawn above/below')

    // Suppressed same-group decoration does not paint cyan over the SKU.
    assert.ok(closeTo(pixel(data, 800, 370, 450), RED), 'suppressed same-group decoration is hidden')

    // Retained layers keep their own pixels.
    assert.ok(closeTo(pixel(data, 800, 550, 320), [255, 255, 0]), 'edge-touching same-group sibling survives')
    assert.ok(closeTo(pixel(data, 800, 660, 380), [170, 102, 255]), 'cross-group decoration survives')
    assert.ok(closeTo(pixel(data, 800, 100, 100), GRAY), 'background survives')

    // === 2. two slots: shadow copy ownership and fit-box stability ==========
    const two = await parseFixture(cwd, 'two-slot.psd', buildTwoSlotPsd())
    two.slots = new Set(
      two.leaves.filter((leaf) => leaf.name === '槽位A' || leaf.name === '槽位B').map((leaf) => leaf.id),
    )
    const twoScene = buildScene(two)
    assert.deepEqual(twoScene.suppressed, [], 'the shadow copy merges into a cluster, never suppressed')

    const partA = twoScene.slots.find((part) => part.name === '槽位A')
    const partB = twoScene.slots.find((part) => part.name === '槽位B')
    assert.deepEqual(
      [partA.rect.x, partA.rect.y, partA.rect.w, partA.rect.h],
      [210, 230, 280, 380],
      "slot A's fit box is not inflated by slot B's shadow",
    )
    assert.deepEqual(
      [partB.rect.x, partB.rect.y, partB.rect.w, partB.rect.h],
      [226, 230, 284, 382],
      "slot B keeps its own shadow copy in the fit-box union",
    )
    assert.deepEqual(
      twoScene.parts.map((part) => part.kind),
      ['layers', 'slot', 'slot'],
      'the shadow copy is hidden inside cluster B, not emitted as a layer',
    )

    const twoData = renderScene(twoScene, sku, 800, 800)
    // (505,600) is inside 阴影B's box but outside slot A: a leaked copy would
    // paint dark navy there; the correct render shows SKU red (fitted into B).
    assert.ok(closeTo(pixel(twoData, 800, 505, 600), RED), "B's shadow copy is replaced by the SKU, not stacked on it")

    // === 3. root-level slot: root siblings suppressed, background kept ======
    const root = await parseFixture(cwd, 'root-slot.psd', buildRootSlotPsd())
    root.slots = new Set([root.leaves.find((leaf) => leaf.name === '槽位').id])
    const rootScene = buildScene(root)
    assert.deepEqual(
      rootScene.suppressed.map((item) => item.name),
      ['旧图', '顶饰'],
      'root-level stale siblings are suppressed together with the slot',
    )
    assert.ok(
      !rootScene.suppressed.some((item) => item.name === '背景'),
      'a full-bleed background is never treated as stale product art',
    )
    const rootData = renderScene(rootScene, sku, 800, 800)
    assert.ok(closeTo(pixel(rootData, 800, 400, 400), RED), 'SKU renders for a root-level slot')
    assert.ok(closeTo(pixel(rootData, 800, 100, 100), GRAY), 'root background still paints behind the SKU')
    assert.ok(closeTo(pixel(rootData, 800, 555, 400), GRAY), 'root stale art outside the slot box is gone')

    console.log('composite test passed')
  } finally {
    await fs.rm(workspace, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
