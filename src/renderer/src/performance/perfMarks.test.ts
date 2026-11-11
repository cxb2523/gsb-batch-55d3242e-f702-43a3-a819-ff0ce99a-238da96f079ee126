import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPerformanceSnapshot, resetPerformanceSummary } from './perfCollector'
import {
  PERFORMANCE_TRACE_STORAGE_KEY,
  isPerformanceTracingEnabled,
  measureAsync,
  measureSync
} from './perfMarks'

describe('performance marks', () => {
  beforeEach(() => {
    localStorage.clear()
    resetPerformanceSummary()
    performance.clearMarks()
    performance.clearMeasures()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    resetPerformanceSummary()
    performance.clearMarks()
    performance.clearMeasures()
  })

  it('detects opt-in tracing from localStorage', () => {
    expect(isPerformanceTracingEnabled()).toBe(false)

    localStorage.setItem(PERFORMANCE_TRACE_STORAGE_KEY, '1')

    expect(isPerformanceTracingEnabled()).toBe(true)
  })

  it('measures synchronous operations without changing the return value', () => {
    const result = measureSync('test.sync', () => 42)

    expect(result).toBe(42)
    expect(performance.getEntriesByName('nextdj.test.sync')).toHaveLength(1)
  })

  it('measures asynchronous operations and logs only when tracing is enabled', async () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined)

    await measureAsync('test.async.off', async () => 'quiet')

    expect(debug).not.toHaveBeenCalled()

    localStorage.setItem(PERFORMANCE_TRACE_STORAGE_KEY, '1')

    await expect(measureAsync('test.async.on', async () => 'loud')).resolves.toBe('loud')
    expect(debug).toHaveBeenCalledWith(expect.stringMatching(/^\[nextdj:perf\] test\.async\.on: \d+\.\dms$/))
    expect(getPerformanceSnapshot().measures['test.async.on']).toMatchObject({ count: 1 })
  })

  it('keeps measurements when the operation throws', () => {
    expect(() =>
      measureSync('test.throw', () => {
        throw new Error('boom')
      })
    ).toThrow('boom')
    expect(performance.getEntriesByName('nextdj.test.throw')).toHaveLength(1)
  })
})
