import type { RecorderPhase, RecorderSnapshot, RecordingMode } from './recorderTypes'

export function createIdleRecorderSnapshot(): RecorderSnapshot {
  return {
    phase: 'idle',
    mode: null,
    startedAtMs: null,
    countdownRemaining: null,
    filePath: null,
    warning: null,
    error: null
  }
}

export function canStartRecordingFromPhase(phase: RecorderPhase): boolean {
  return phase === 'idle' || phase === 'saved' || phase === 'error'
}

export function createCountdownSnapshot(mode: RecordingMode, countdownRemaining: number): RecorderSnapshot {
  return {
    ...createIdleRecorderSnapshot(),
    phase: 'countdown',
    mode,
    countdownRemaining
  }
}

export function createStartingSnapshot(mode: RecordingMode): RecorderSnapshot {
  return {
    ...createIdleRecorderSnapshot(),
    phase: 'starting',
    mode
  }
}

export function createRecordingSnapshot(
  snapshot: RecorderSnapshot,
  filePath: string,
  warning: string | null,
  startedAtMs: number
): RecorderSnapshot {
  return {
    ...snapshot,
    phase: 'recording',
    startedAtMs,
    countdownRemaining: null,
    filePath,
    warning
  }
}

export function createSavedSnapshot(
  snapshot: RecorderSnapshot,
  filePath: string,
  warning: string | null
): RecorderSnapshot {
  return {
    ...snapshot,
    phase: 'saved',
    filePath,
    warning
  }
}

export function createErrorSnapshot(snapshot: RecorderSnapshot, error: string): RecorderSnapshot {
  return {
    ...snapshot,
    phase: 'error',
    error
  }
}
