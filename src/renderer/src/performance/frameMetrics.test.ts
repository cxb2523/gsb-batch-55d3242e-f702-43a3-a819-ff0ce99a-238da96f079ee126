import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPerformanceSnapshot, resetPerformanceSummary } from './perfCollector'
import { PERFORMANCE_TRACE_STORAGE_KEY } from './perfConfig'
import { createFrameMeter } from './frameMetrics'

describe('frame metrics', () => {
  let nowValue = 0

  beforeEach(() => {
    localStorage.clear()
    resetPerformanceSummary()
    nowValue = 0
    vi.spyOn(performance, 'now').mockImplementation(() => nowValue)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    resetPerformanceSummary()
  })

  it('runs operations without logging when tracing is disabled', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined)
    const meter = createFrameMeter('waveform.overview')

    meter.measure(() => {
      nowValue = 40
    })

    expect(debug).not.toHaveBeenCalled()
  })

  it('logs slow frames when tracing is enabled', () => {
    localStorage.setItem(PERFORMANCE_TRACE_STORAGE_KEY, '1')
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined)
    const meter = createFrameMeter('waveform.zoom', 10)

    meter.measure(() => {
      nowValue = 9
    })
    meter.measure(() => {
      nowValue = 25
    })

    expect(debug).toHaveBeenCalledTimes(1)
    expect(debug).toHaveBeenCalledWith('[nextdj:perf] waveform.zoom slow frame: 16.0ms')
    expect(getPerformanceSnapshot().slowFrames['waveform.zoom']).toMatchObject({
      count: 1,
      latestMs: 16,
      maxMs: 16
    })
  })
})
