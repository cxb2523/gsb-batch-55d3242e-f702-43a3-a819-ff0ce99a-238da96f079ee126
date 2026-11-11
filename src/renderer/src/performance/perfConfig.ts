export const PERFORMANCE_TRACE_STORAGE_KEY = 'nextdj.perf'

export function isPerformanceTracingEnabled(): boolean {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(PERFORMANCE_TRACE_STORAGE_KEY) === '1') {
      return true
    }

    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).get('nextdjPerf') === '1'
    }
  } catch {
    return false
  }

  return false
}
