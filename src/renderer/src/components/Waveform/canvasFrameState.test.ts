import { describe, expect, it } from 'vitest'
import { hasCanvasFrameChanged } from './canvasFrameState'

describe('canvas frame state', () => {
  it('draws the first frame', () => {
    expect(hasCanvasFrameChanged(null, { dpr: 2, height: 120, position: 0, width: 600 })).toBe(true)
  })

  it('skips identical frames', () => {
    const frame = { dpr: 2, height: 120, position: 42, width: 600 }

    expect(hasCanvasFrameChanged(frame, frame)).toBe(false)
  })

  it('draws when position or canvas metrics change', () => {
    const frame = { dpr: 2, height: 120, position: 42, width: 600 }

    expect(hasCanvasFrameChanged(frame, { ...frame, position: 43 })).toBe(true)
    expect(hasCanvasFrameChanged(frame, { ...frame, width: 601 })).toBe(true)
    expect(hasCanvasFrameChanged(frame, { ...frame, height: 121 })).toBe(true)
    expect(hasCanvasFrameChanged(frame, { ...frame, dpr: 1 })).toBe(true)
  })
})
