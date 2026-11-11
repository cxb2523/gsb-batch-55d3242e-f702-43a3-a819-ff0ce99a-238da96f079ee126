import { describe, expect, it } from 'vitest'
import {
  canStartRecordingFromPhase,
  createCountdownSnapshot,
  createErrorSnapshot,
  createIdleRecorderSnapshot,
  createRecordingSnapshot,
  createSavedSnapshot,
  createStartingSnapshot
} from './recorderState'

describe('recorder state', () => {
  it('creates a clean idle snapshot', () => {
    expect(createIdleRecorderSnapshot()).toEqual({
      phase: 'idle',
      mode: null,
      startedAtMs: null,
      countdownRemaining: null,
      filePath: null,
      warning: null,
      error: null
    })
  })

  it('allows starting only from terminal or idle phases', () => {
    expect(canStartRecordingFromPhase('idle')).toBe(true)
    expect(canStartRecordingFromPhase('saved')).toBe(true)
    expect(canStartRecordingFromPhase('error')).toBe(true)
    expect(canStartRecordingFromPhase('recording')).toBe(false)
    expect(canStartRecordingFromPhase('countdown')).toBe(false)
  })

  it('creates countdown and starting snapshots', () => {
    expect(createCountdownSnapshot('audio-screen', 5)).toMatchObject({
      phase: 'countdown',
      mode: 'audio-screen',
      countdownRemaining: 5
    })
    expect(createStartingSnapshot('audio')).toMatchObject({
      phase: 'starting',
      mode: 'audio',
      countdownRemaining: null
    })
  })

  it('carries existing context into recording, saved and error states', () => {
    const starting = createStartingSnapshot('audio-screen-camera')
    const recording = createRecordingSnapshot(starting, '/tmp/set.mp4', 'warning', 123)

    expect(recording).toMatchObject({
      phase: 'recording',
      mode: 'audio-screen-camera',
      filePath: '/tmp/set.mp4',
      warning: 'warning',
      startedAtMs: 123
    })
    expect(createSavedSnapshot(recording, '/tmp/final.mp4', null)).toMatchObject({
      phase: 'saved',
      filePath: '/tmp/final.mp4',
      warning: null
    })
    expect(createErrorSnapshot(recording, 'failed')).toMatchObject({
      phase: 'error',
      error: 'failed'
    })
  })
})
