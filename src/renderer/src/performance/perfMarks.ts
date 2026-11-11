import { recordPerformanceMeasure } from './perfCollector'
import { isPerformanceTracingEnabled } from './perfConfig'
export { PERFORMANCE_TRACE_STORAGE_KEY, isPerformanceTracingEnabled } from './perfConfig'

let measurementId = 0

function hasPerformanceApi(): boolean {
  return typeof performance !== 'undefined' && typeof performance.mark === 'function'
}

function finishMeasurement(name: string, startMark: string, endMark: string): void {
  performance.mark(endMark)
  performance.measure(`nextdj.${name}`, startMark, endMark)

  const entries = performance.getEntriesByName(`nextdj.${name}`)
  const latestEntry = entries[entries.length - 1]

  if (latestEntry) {
    recordPerformanceMeasure(name, latestEntry.duration)

    if (isPerformanceTracingEnabled()) {
      console.debug(`[nextdj:perf] ${name}: ${latestEntry.duration.toFixed(1)}ms`)
    }
  }

  performance.clearMarks(startMark)
  performance.clearMarks(endMark)
}

export function measureSync<T>(name: string, operation: () => T): T {
  if (!hasPerformanceApi()) {
    return operation()
  }

  measurementId += 1
  const startMark = `nextdj.${name}.${measurementId}.start`
  const endMark = `nextdj.${name}.${measurementId}.end`

  performance.mark(startMark)

  try {
    return operation()
  } finally {
    finishMeasurement(name, startMark, endMark)
  }
}

export async function measureAsync<T>(name: string, operation: () => Promise<T>): Promise<T> {
  if (!hasPerformanceApi()) {
    return operation()
  }

  measurementId += 1
  const startMark = `nextdj.${name}.${measurementId}.start`
  const endMark = `nextdj.${name}.${measurementId}.end`

  performance.mark(startMark)

  try {
    return await operation()
  } finally {
    finishMeasurement(name, startMark, endMark)
  }
}
