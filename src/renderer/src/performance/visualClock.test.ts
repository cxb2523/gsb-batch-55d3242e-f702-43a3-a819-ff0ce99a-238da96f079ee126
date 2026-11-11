import { afterEach, describe, expect, it, vi } from 'vitest'
import { subscribeVisualFrame } from './visualClock'

describe('visual clock', () => {
  afterEach(() => vi.restoreAllMocks())

  it('drives all subscribers from one animation frame loop', () => {
    let nextFrameId = 1
    const callbacks = new Map<number, FrameRequestCallback>()
    const request = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const id = nextFrameId
      nextFrameId += 1
      callbacks.set(id, callback)
      return id
    })
    const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      callbacks.delete(id)
    })
    const first = vi.fn()
    const second = vi.fn()
    const unsubscribeFirst = subscribeVisualFrame(first)
    const unsubscribeSecond = subscribeVisualFrame(second)

    expect(request).toHaveBeenCalledTimes(1)
    const firstFrame = callbacks.get(1)
    callbacks.delete(1)
    firstFrame?.(16)
    expect(first).toHaveBeenCalledWith(16)
    expect(second).toHaveBeenCalledWith(16)
    expect(request).toHaveBeenCalledTimes(2)

    unsubscribeFirst()
    unsubscribeSecond()
    expect(cancel).toHaveBeenCalledWith(2)
    expect(callbacks.size).toBe(0)
  })
})
