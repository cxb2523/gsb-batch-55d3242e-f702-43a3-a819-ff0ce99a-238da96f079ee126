import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPerformanceSnapshot, resetPerformanceSummary } from './perfCollector'
import { PERFORMANCE_TRACE_STORAGE_KEY } from './perfConfig'
import { startLongTaskObserver } from './longTaskObserver'

class MockPerformanceObserver {
  static supportedEntryTypes = ['longtask']
  static instances: MockPerformanceObserver[] = []

  observe = vi.fn()
  disconnect = vi.fn()

  constructor(private readonly callback: PerformanceObserverCallback) {
    MockPerformanceObserver.instances.push(this)
  }

  emit(duration: number): void {
    this.callback(
      {
        getEntries: () => [{ duration } as PerformanceEntry]
      } as PerformanceObserverEntryList,
      this as unknown as PerformanceObserver
    )
  }
}

describe('long task observer', () => {
  const originalPerformanceObserver = globalThis.PerformanceObserver

  beforeEach(() => {
    localStorage.clear()
    resetPerformanceSummary()
    MockPerformanceObserver.instances = []
    Object.defineProperty(globalThis, 'PerformanceObserver', {
      configurable: true,
      value: MockPerformanceObserver
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    resetPerformanceSummary()
    Object.defineProperty(globalThis, 'PerformanceObserver', {
      configurable: true,
      value: originalPerformanceObserver
    })
  })

  it('does nothing when tracing is disabled', () => {
    const stop = startLongTaskObserver()

    stop()

    expect(MockPerformanceObserver.instances).toHaveLength(0)
  })

  it('does nothing when long tasks are unsupported', () => {
    localStorage.setItem(PERFORMANCE_TRACE_STORAGE_KEY, '1')
    MockPerformanceObserver.supportedEntryTypes = []

    const stop = startLongTaskObserver()

    stop()

    expect(MockPerformanceObserver.instances).toHaveLength(0)
  })

  it('logs long tasks and disconnects the observer', () => {
    localStorage.setItem(PERFORMANCE_TRACE_STORAGE_KEY, '1')
    MockPerformanceObserver.supportedEntryTypes = ['longtask']
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined)

    const stop = startLongTaskObserver()
    const observer = MockPerformanceObserver.instances[0]

    observer.emit(67.42)
    stop()

    expect(observer.observe).toHaveBeenCalledWith({ entryTypes: ['longtask'] })
    expect(debug).toHaveBeenCalledWith('[nextdj:perf] renderer long task: 67.4ms')
    expect(getPerformanceSnapshot().longTasks.renderer).toMatchObject({
      count: 1,
      latestMs: 67.42,
      maxMs: 67.42
    })
    expect(observer.disconnect).toHaveBeenCalledTimes(1)
  })
})
