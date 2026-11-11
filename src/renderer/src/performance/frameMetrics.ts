import { isPerformanceTracingEnabled } from './perfConfig'
import { recordSlowFrame } from './perfCollector'

const DEFAULT_SLOW_FRAME_MS = 12

function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now()
}

export interface FrameMeter {
  measure: (operation: () => void) => void
}

export function createFrameMeter(name: string, slowFrameMs = DEFAULT_SLOW_FRAME_MS): FrameMeter {
  const enabled = isPerformanceTracingEnabled()

  if (!enabled) {
    return {
      measure: (operation) => operation()
    }
  }

  return {
    measure: (operation) => {
      const startedAt = now()
      operation()
      const duration = now() - startedAt

      if (duration >= slowFrameMs) {
        recordSlowFrame(name, duration)
        console.debug(`[nextdj:perf] ${name} slow frame: ${duration.toFixed(1)}ms`)
      }
    }
  }
}
