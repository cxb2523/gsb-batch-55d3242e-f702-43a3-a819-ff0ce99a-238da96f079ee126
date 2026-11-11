import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DJEngine } from '../audio/engine'
import type { RecorderSnapshot } from '../recording/recorderTypes'
import { useRecorder } from './useRecorder'

const recorderMocks = vi.hoisted(() => {
  const instances: Array<{
    onChange: ((snapshot: RecorderSnapshot) => void) | null
    start: ReturnType<typeof vi.fn>
    stop: ReturnType<typeof vi.fn>
    dismiss: ReturnType<typeof vi.fn>
    dispose: ReturnType<typeof vi.fn>
  }> = []

  return {
    instances,
    Recorder: vi.fn(function MockRecorder() {
      const instance = {
        onChange: null,
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn().mockResolvedValue(undefined),
        dismiss: vi.fn(),
        dispose: vi.fn()
      }
      instances.push(instance)
      return instance
    })
  }
})

vi.mock('../recording/recorder', () => ({
  Recorder: recorderMocks.Recorder
}))

function createEngine(contextState: AudioContextState = 'running'): DJEngine {
  return {
    mixer: {
      context: {
        state: contextState,
        resume: vi.fn().mockResolvedValue(undefined)
      },
      recordStream: {}
    }
  } as unknown as DJEngine
}

function createSnapshot(overrides: Partial<RecorderSnapshot>): RecorderSnapshot {
  return {
    phase: 'idle',
    mode: null,
    startedAtMs: null,
    countdownRemaining: null,
    filePath: null,
    warning: null,
    error: null,
    ...overrides
  }
}

function installBridge() {
  const bridge = {
    appName: 'NextDJ',
    checkForUpdate: vi.fn(),
    openUpdateDownload: vi.fn(),
    selectPlaylistImportFile: vi.fn(),
    listPlaylistImportProviders: vi.fn(),
    listPlaylistImportTracks: vi.fn(),
    resolvePlaylistImportTrack: vi.fn(),
    startRecording: vi.fn(),
    appendRecordingChunk: vi.fn(),
    stopRecording: vi.fn(),
    cancelRecording: vi.fn(),
    revealRecording: vi.fn().mockResolvedValue(undefined),
    onRecordingWriteError: vi.fn()
  }

  window.nextdj = bridge
  return bridge
}

describe('useRecorder', () => {
  beforeEach(() => {
    recorderMocks.instances.length = 0
    recorderMocks.Recorder.mockClear()
    delete window.nextdj
  })

  afterEach(() => {
    vi.useRealTimers()
    delete window.nextdj
  })

  it('creates one recorder and disposes it on unmount', () => {
    const { unmount } = renderHook(() => useRecorder(createEngine()))

    expect(recorderMocks.Recorder).toHaveBeenCalledTimes(1)
    expect(recorderMocks.instances[0].onChange).toEqual(expect.any(Function))

    unmount()

    expect(recorderMocks.instances[0].onChange).toBeNull()
    expect(recorderMocks.instances[0].dispose).toHaveBeenCalledTimes(1)
  })

  it('resumes a suspended audio context before starting', () => {
    const engine = createEngine('suspended')
    const { result } = renderHook(() => useRecorder(engine))

    act(() => {
      result.current.start('audio-screen')
    })

    expect(engine.mixer.context.resume).toHaveBeenCalledTimes(1)
    expect(recorderMocks.instances[0].start).toHaveBeenCalledWith('audio-screen')
  })

  it('delegates stop and dismiss actions to the recorder', () => {
    const { result } = renderHook(() => useRecorder(createEngine()))

    act(() => {
      result.current.stop()
      result.current.dismiss()
    })

    expect(recorderMocks.instances[0].stop).toHaveBeenCalledTimes(1)
    expect(recorderMocks.instances[0].dismiss).toHaveBeenCalledTimes(1)
  })

  it('exposes recorder snapshots and elapsed recording time', () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    const { result } = renderHook(() => useRecorder(createEngine()))

    act(() => {
      recorderMocks.instances[0].onChange?.(
        createSnapshot({
          phase: 'recording',
          mode: 'audio',
          startedAtMs: 9_000,
          filePath: '/tmp/set.webm',
          warning: 'camera missing'
        })
      )
    })

    expect(result.current.phase).toBe('recording')
    expect(result.current.mode).toBe('audio')
    expect(result.current.filePath).toBe('/tmp/set.webm')
    expect(result.current.warning).toBe('camera missing')
    expect(result.current.elapsedMs).toBe(1_000)

    act(() => {
      vi.setSystemTime(11_000)
      vi.advanceTimersByTime(500)
    })

    expect(result.current.elapsedMs).toBe(2_500)

    act(() => {
      recorderMocks.instances[0].onChange?.(createSnapshot({ phase: 'idle' }))
    })

    expect(result.current.elapsedMs).toBe(0)
  })

  it('reveals saved files and auto-dismisses saved snapshots', () => {
    vi.useFakeTimers()
    const bridge = installBridge()
    const { result } = renderHook(() => useRecorder(createEngine()))

    act(() => {
      recorderMocks.instances[0].onChange?.(
        createSnapshot({
          phase: 'saved',
          mode: 'audio-screen-camera',
          filePath: '/recordings/set.webm'
        })
      )
    })

    act(() => {
      result.current.reveal()
    })

    expect(bridge.revealRecording).toHaveBeenCalledWith('/recordings/set.webm')

    act(() => {
      vi.advanceTimersByTime(8_000)
    })

    expect(recorderMocks.instances[0].dismiss).toHaveBeenCalledTimes(1)
  })
})
