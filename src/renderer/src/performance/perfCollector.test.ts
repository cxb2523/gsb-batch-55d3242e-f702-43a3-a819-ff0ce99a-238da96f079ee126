import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PERFORMANCE_TRACE_STORAGE_KEY } from './perfConfig'
import {
  getPerformanceSnapshot,
  installPerformanceProfiler,
  recordLongTask,
  recordPerformanceMeasure,
  recordSlowFrame,
  resetPerformanceSummary
} from './perfCollector'

type PerfGlobal = typeof globalThis & {
  __NEXTDJ_PERF__?: {
    reset: () => void
    snapshot: () => ReturnType<typeof getPerformanceSnapshot>
  }
}

describe('performance collector', () => {
  beforeEach(() => {
    localStorage.clear()
    resetPerformanceSummary()
    delete (globalThis as PerfGlobal).__NEXTDJ_PERF__
  })

  afterEach(() => {
    localStorage.clear()
    resetPerformanceSummary()
    delete (globalThis as PerfGlobal).__NEXTDJ_PERF__
  })

  it('ignores samples while tracing is disabled', () => {
    recordPerformanceMeasure('deck.loadFile.decodeAudioData', 10)

    expect(getPerformanceSnapshot().measures).toEqual({})
  })

  it('summarizes measures, slow frames and long tasks when tracing is enabled', () => {
    localStorage.setItem(PERFORMANCE_TRACE_STORAGE_KEY, '1')

    recordPerformanceMeasure('deck.loadFile.decodeAudioData', 10)
    recordPerformanceMeasure('deck.loadFile.decodeAudioData', 30)
    recordSlowFrame('waveform.zoom', 14)
    recordLongTask(62)

    expect(getPerformanceSnapshot()).toEqual({
      longTasks: {
        renderer: {
          averageMs: 62,
          count: 1,
          latestMs: 62,
          maxMs: 62,
          minMs: 62,
          totalMs: 62
        }
      },
      measures: {
        'deck.loadFile.decodeAudioData': {
          averageMs: 20,
          count: 2,
          latestMs: 30,
          maxMs: 30,
          minMs: 10,
          totalMs: 40
        }
      },
      slowFrames: {
        'waveform.zoom': {
          averageMs: 14,
          count: 1,
          latestMs: 14,
          maxMs: 14,
          minMs: 14,
          totalMs: 14
        }
      }
    })
  })

  it('installs a DevTools profiler only when tracing is enabled', () => {
    const disabledCleanup = installPerformanceProfiler()

    expect((globalThis as PerfGlobal).__NEXTDJ_PERF__).toBeUndefined()
    disabledCleanup()

    localStorage.setItem(PERFORMANCE_TRACE_STORAGE_KEY, '1')
    const enabledCleanup = installPerformanceProfiler()
    const profiler = (globalThis as PerfGlobal).__NEXTDJ_PERF__

    expect(profiler?.snapshot()).toEqual(getPerformanceSnapshot())
    profiler?.reset()
    enabledCleanup()
    expect((globalThis as PerfGlobal).__NEXTDJ_PERF__).toBeUndefined()
  })
})
