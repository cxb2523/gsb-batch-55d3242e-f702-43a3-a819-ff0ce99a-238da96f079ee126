import { isPerformanceTracingEnabled } from './perfConfig'
import { recordLongTask } from './perfCollector'

const LONG_TASK_ENTRY_TYPE = 'longtask'

interface PerformanceObserverConstructor {
  new (callback: PerformanceObserverCallback): PerformanceObserver
  supportedEntryTypes?: string[]
}

function getPerformanceObserver(): PerformanceObserverConstructor | null {
  return typeof PerformanceObserver === 'undefined'
    ? null
    : (PerformanceObserver as PerformanceObserverConstructor)
}

export function startLongTaskObserver(): () => void {
  if (!isPerformanceTracingEnabled()) {
    return () => undefined
  }

  const Observer = getPerformanceObserver()

  if (!Observer?.supportedEntryTypes?.includes(LONG_TASK_ENTRY_TYPE)) {
    return () => undefined
  }

  const observer = new Observer((list) => {
    for (const entry of list.getEntries()) {
      recordLongTask(entry.duration)
      console.debug(`[nextdj:perf] renderer long task: ${entry.duration.toFixed(1)}ms`)
    }
  })

  observer.observe({ entryTypes: [LONG_TASK_ENTRY_TYPE] })

  return () => observer.disconnect()
}
