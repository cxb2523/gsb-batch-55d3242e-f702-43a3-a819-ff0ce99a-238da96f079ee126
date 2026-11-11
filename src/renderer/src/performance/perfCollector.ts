import { isPerformanceTracingEnabled } from './perfConfig'

export interface PerformanceSummaryEntry {
  averageMs: number
  count: number
  latestMs: number
  maxMs: number
  minMs: number
  totalMs: number
}

export interface PerformanceSnapshot {
  longTasks: Record<string, PerformanceSummaryEntry>
  measures: Record<string, PerformanceSummaryEntry>
  slowFrames: Record<string, PerformanceSummaryEntry>
}

export interface PerformanceProfiler {
  reset: () => void
  snapshot: () => PerformanceSnapshot
}

const GLOBAL_PROFILER_KEY = '__NEXTDJ_PERF__'

type SummaryBucket = 'longTasks' | 'measures' | 'slowFrames'
type MutablePerformanceSnapshot = Record<SummaryBucket, Map<string, PerformanceSummaryEntry>>
type ProfilerGlobal = typeof globalThis & {
  [GLOBAL_PROFILER_KEY]?: PerformanceProfiler
}

const summaries: MutablePerformanceSnapshot = {
  longTasks: new Map(),
  measures: new Map(),
  slowFrames: new Map()
}

function cloneEntry(entry: PerformanceSummaryEntry): PerformanceSummaryEntry {
  return { ...entry }
}

function serializeBucket(bucket: Map<string, PerformanceSummaryEntry>): Record<string, PerformanceSummaryEntry> {
  const entries: Record<string, PerformanceSummaryEntry> = {}

  for (const [name, summary] of bucket) {
    entries[name] = cloneEntry(summary)
  }

  return entries
}

function record(bucket: SummaryBucket, name: string, durationMs: number): void {
  if (!isPerformanceTracingEnabled() || !Number.isFinite(durationMs) || durationMs < 0) {
    return
  }

  const current = summaries[bucket].get(name)

  if (!current) {
    summaries[bucket].set(name, {
      averageMs: durationMs,
      count: 1,
      latestMs: durationMs,
      maxMs: durationMs,
      minMs: durationMs,
      totalMs: durationMs
    })
    return
  }

  const totalMs = current.totalMs + durationMs
  const count = current.count + 1

  summaries[bucket].set(name, {
    averageMs: totalMs / count,
    count,
    latestMs: durationMs,
    maxMs: Math.max(current.maxMs, durationMs),
    minMs: Math.min(current.minMs, durationMs),
    totalMs
  })
}

export function recordPerformanceMeasure(name: string, durationMs: number): void {
  record('measures', name, durationMs)
}

export function recordSlowFrame(name: string, durationMs: number): void {
  record('slowFrames', name, durationMs)
}

export function recordLongTask(durationMs: number): void {
  record('longTasks', 'renderer', durationMs)
}

export function resetPerformanceSummary(): void {
  summaries.longTasks.clear()
  summaries.measures.clear()
  summaries.slowFrames.clear()
}

export function getPerformanceSnapshot(): PerformanceSnapshot {
  return {
    longTasks: serializeBucket(summaries.longTasks),
    measures: serializeBucket(summaries.measures),
    slowFrames: serializeBucket(summaries.slowFrames)
  }
}

export function installPerformanceProfiler(): () => void {
  if (!isPerformanceTracingEnabled()) {
    return () => undefined
  }

  const target = globalThis as ProfilerGlobal
  const profiler = {
    reset: resetPerformanceSummary,
    snapshot: getPerformanceSnapshot
  }

  target[GLOBAL_PROFILER_KEY] = profiler

  return () => {
    if (target[GLOBAL_PROFILER_KEY] === profiler) {
      delete target[GLOBAL_PROFILER_KEY]
    }
  }
}
