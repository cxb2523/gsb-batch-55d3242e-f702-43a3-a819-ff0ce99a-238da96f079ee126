import { describe, expect, it } from 'vitest'
import { mapWithConcurrency } from './concurrentTasks'

describe('mapWithConcurrency', () => {
  it('preserves result order while bounding active tasks', async () => {
    let active = 0
    let maximumActive = 0
    const releases: Array<() => void> = []
    const mapped = mapWithConcurrency([1, 2, 3, 4], 2, async (value) => {
      active += 1
      maximumActive = Math.max(maximumActive, active)
      await new Promise<void>((resolve) => releases.push(resolve))
      active -= 1
      return value * 2
    })

    await Promise.resolve()
    expect(active).toBe(2)
    releases.shift()?.()
    releases.shift()?.()
    await Promise.resolve()
    await Promise.resolve()
    expect(active).toBe(2)
    releases.shift()?.()
    releases.shift()?.()

    await expect(mapped).resolves.toEqual([2, 4, 6, 8])
    expect(maximumActive).toBe(2)
  })
})
