import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Recorder } from './recorder'
import type { RecorderSnapshot } from './recorderTypes'

class FakeMediaStream {
  readonly tracks: MediaStreamTrack[]

  constructor(tracks: MediaStreamTrack[]) {
    this.tracks = tracks
  }

  getAudioTracks(): MediaStreamTrack[] {
    return this.tracks.filter((track) => track.kind === 'audio')
  }
}

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = []
  static isTypeSupported = vi.fn((mimeType: string) => mimeType === 'audio/mp4;codecs=mp4a.40.2')

  readonly options: MediaRecorderOptions
  readonly stream: MediaStream
  ondataavailable: ((event: BlobEvent) => void) | null = null
  onerror: (() => void) | null = null
  onstart: (() => void) | null = null
  state: RecordingState = 'inactive'
  startCalls: number[] = []
  stopCalls = 0
  private readonly listeners = new Map<string, Array<() => void>>()

  constructor(stream: MediaStream, options: MediaRecorderOptions) {
    this.stream = stream
    this.options = options
    FakeMediaRecorder.instances.push(this)
  }

  start(timeslice?: number): void {
    this.state = 'recording'
    this.startCalls.push(timeslice ?? 0)
    this.onstart?.()
  }

  stop(): void {
    this.state = 'inactive'
    this.stopCalls += 1
    this.listeners.get('stop')?.forEach((listener) => listener())
  }

  addEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }

  emitData(data: Blob): void {
    this.ondataavailable?.({ data } as BlobEvent)
  }
}

function createAudioTrack(): MediaStreamTrack {
  return {
    kind: 'audio',
    stop: vi.fn()
  } as unknown as MediaStreamTrack
}

function installRecordingRuntime(): void {
  Object.defineProperty(globalThis, 'MediaRecorder', {
    configurable: true,
    value: FakeMediaRecorder
  })
  Object.defineProperty(globalThis, 'MediaStream', {
    configurable: true,
    value: FakeMediaStream
  })
}

function installBridge() {
  const unsubscribe = vi.fn()
  const bridge = {
    appName: 'NextDJ',
    checkForUpdate: vi.fn(),
    openUpdateDownload: vi.fn(),
    selectPlaylistImportFile: vi.fn(),
    listPlaylistImportProviders: vi.fn(),
    listPlaylistImportTracks: vi.fn(),
    resolvePlaylistImportTrack: vi.fn(),
    startRecording: vi.fn().mockResolvedValue({ id: 'recording-1', filePath: '/recordings/live.m4a' }),
    appendRecordingChunk: vi.fn().mockResolvedValue(undefined),
    stopRecording: vi.fn().mockResolvedValue({ filePath: '/recordings/final.m4a' }),
    cancelRecording: vi.fn().mockResolvedValue(undefined),
    revealRecording: vi.fn().mockResolvedValue(undefined),
    onRecordingWriteError: vi.fn(() => unsubscribe)
  }

  window.nextdj = bridge
  return { bridge, unsubscribe }
}

function createRecorder(): { changes: RecorderSnapshot[]; recorder: Recorder } {
  const recorder = new Recorder(() => new FakeMediaStream([createAudioTrack()]) as unknown as MediaStream)
  const changes: RecorderSnapshot[] = []
  recorder.onChange = (snapshot) => {
    changes.push(snapshot)
  }

  return { changes, recorder }
}

function lastChange(changes: RecorderSnapshot[]): RecorderSnapshot {
  return changes[changes.length - 1]
}

async function finishCountdown(startPromise: Promise<void>): Promise<void> {
  await vi.advanceTimersByTimeAsync(5_000)
  await startPromise
}

describe('Recorder', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    FakeMediaRecorder.instances.length = 0
    FakeMediaRecorder.isTypeSupported.mockClear()
    installRecordingRuntime()
    installBridge()
  })

  afterEach(() => {
    vi.useRealTimers()
    Reflect.deleteProperty(globalThis, 'MediaRecorder')
    Reflect.deleteProperty(globalThis, 'MediaStream')
    delete window.nextdj
  })

  it('starts audio recordings, appends chunks in order and saves on stop', async () => {
    const { bridge } = installBridge()
    const { changes, recorder } = createRecorder()

    const startPromise = recorder.start('audio')
    await finishCountdown(startPromise)
    const mediaRecorder = FakeMediaRecorder.instances[0]

    expect(bridge.startRecording).toHaveBeenCalledWith({ extension: 'm4a', video: false })
    expect(bridge.onRecordingWriteError).toHaveBeenCalledWith(expect.any(Function))
    expect(mediaRecorder.options).toMatchObject({
      audioBitsPerSecond: 192_000,
      mimeType: 'audio/mp4;codecs=mp4a.40.2'
    })
    expect(mediaRecorder.startCalls).toEqual([1_000])
    expect(lastChange(changes)).toMatchObject({ phase: 'recording', filePath: '/recordings/live.m4a' })

    mediaRecorder.emitData(new Blob(['first']))
    mediaRecorder.emitData(new Blob(['second']))

    const stopPromise = recorder.stop()
    await vi.advanceTimersByTimeAsync(0)
    await stopPromise

    expect(bridge.appendRecordingChunk).toHaveBeenCalledTimes(2)
    expect(bridge.appendRecordingChunk).toHaveBeenNthCalledWith(1, 'recording-1', expect.any(ArrayBuffer))
    expect(bridge.appendRecordingChunk).toHaveBeenNthCalledWith(2, 'recording-1', expect.any(ArrayBuffer))
    expect(bridge.appendRecordingChunk.mock.invocationCallOrder[1]).toBeLessThan(
      bridge.stopRecording.mock.invocationCallOrder[0]
    )
    expect(bridge.stopRecording).toHaveBeenCalledWith('recording-1')
    expect(lastChange(changes)).toMatchObject({ phase: 'saved', filePath: '/recordings/final.m4a' })
  })

  it('cancels an active countdown without opening a recording session', async () => {
    const { bridge } = installBridge()
    const { changes, recorder } = createRecorder()

    const startPromise = recorder.start('audio')
    await vi.advanceTimersByTimeAsync(1_000)
    await recorder.stop()
    await startPromise

    expect(bridge.startRecording).not.toHaveBeenCalled()
    expect(FakeMediaRecorder.instances).toHaveLength(0)
    expect(lastChange(changes)).toMatchObject({ phase: 'idle' })
  })

  it('aborts the capture side when main reports a write error for the current session', async () => {
    const { bridge } = installBridge()
    const { changes, recorder } = createRecorder()

    const startPromise = recorder.start('audio')
    await finishCountdown(startPromise)
    const mediaRecorder = FakeMediaRecorder.instances[0]
    const writeErrorCalls = bridge.onRecordingWriteError.mock.calls as unknown as Array<
      [(error: { id: string; message: string }) => void]
    >
    const onWriteError = writeErrorCalls[0][0]

    onWriteError({ id: 'recording-1', message: 'disk full' })
    await Promise.resolve()

    expect(mediaRecorder.stopCalls).toBe(1)
    expect(bridge.stopRecording).not.toHaveBeenCalled()
    expect(lastChange(changes)).toMatchObject({ phase: 'error', error: 'disk full' })
  })

  it('handles the session cleanup rejection when start fails after opening a session', async () => {
    const { bridge } = installBridge()
    // A vi.fn() mock observes its returned promises internally (for
    // settledResults), which silently marks rejections as handled. To prove
    // the recorder attaches its own rejection handler, hand back a thenable
    // with a spied catch instead of a real rejected promise.
    const rejectionHandled = vi.fn().mockReturnValue(Promise.resolve())
    bridge.cancelRecording.mockReturnValue({ catch: rejectionHandled } as unknown as Promise<void>)
    Object.defineProperty(globalThis, 'MediaRecorder', {
      configurable: true,
      value: class {
        static isTypeSupported = FakeMediaRecorder.isTypeSupported

        constructor() {
          throw new Error('recorder construction failed')
        }
      }
    })
    const { changes, recorder } = createRecorder()

    const startPromise = recorder.start('audio')
    await finishCountdown(startPromise)

    expect(bridge.startRecording).toHaveBeenCalledTimes(1)
    expect(bridge.cancelRecording).toHaveBeenCalledWith('recording-1', true)
    expect(rejectionHandled).toHaveBeenCalledTimes(1)
    expect(lastChange(changes)).toMatchObject({ phase: 'error', error: 'recorder construction failed' })
  })

  it('cancels an active main-process session when disposed', async () => {
    const { bridge } = installBridge()
    const { recorder } = createRecorder()

    const startPromise = recorder.start('audio')
    await finishCountdown(startPromise)
    const mediaRecorder = FakeMediaRecorder.instances[0]

    await recorder.dispose()

    expect(mediaRecorder.stopCalls).toBe(1)
    expect(bridge.cancelRecording).toHaveBeenCalledWith('recording-1', true)
    expect(bridge.stopRecording).not.toHaveBeenCalled()
  })
})
