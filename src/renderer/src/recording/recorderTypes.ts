export type RecordingMode = 'audio' | 'audio-screen' | 'audio-screen-camera'
export type RecorderPhase = 'idle' | 'countdown' | 'starting' | 'recording' | 'stopping' | 'saved' | 'error'

export interface RecorderSnapshot {
  phase: RecorderPhase
  mode: RecordingMode | null
  startedAtMs: number | null
  countdownRemaining: number | null
  filePath: string | null
  warning: string | null
  error: string | null
}
