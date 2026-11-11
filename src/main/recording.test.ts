import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electronMock = vi.hoisted(() => ({
  handle: vi.fn(),
  appOn: vi.fn(),
  showItemInFolder: vi.fn(),
  fromId: vi.fn()
}))

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/fake-music',
    on: electronMock.appOn,
    quit: vi.fn()
  },
  ipcMain: { handle: electronMock.handle },
  shell: { showItemInFolder: electronMock.showItemInFolder },
  webContents: { fromId: electronMock.fromId }
}))

class FakeWriteStream extends EventEmitter {
  destroyed = false
  closed = false
  writeCalls: Array<{ chunk: unknown }> = []
  endCalled = false

  write(chunk: unknown, callback: (error?: Error) => void): boolean {
    this.writeCalls.push({ chunk })
    callback()
    return true
  }

  end(): void {
    this.endCalled = true
    this.destroyed = true
    this.closed = true
    queueMicrotask(() => this.emit('close'))
  }
}

const fsMock = vi.hoisted(() => ({
  createWriteStream: vi.fn(),
  lastStream: null as FakeWriteStream | null
}))

vi.mock('node:fs', () => ({
  createWriteStream: fsMock.createWriteStream,
  default: {
    createWriteStream: fsMock.createWriteStream
  }
}))

const fsPromisesMock = vi.hoisted(() => ({
  mkdir: vi.fn(async () => undefined),
  rm: vi.fn(async () => undefined),
  statfs: vi.fn()
}))

vi.mock('node:fs/promises', () => ({
  mkdir: fsPromisesMock.mkdir,
  rm: fsPromisesMock.rm,
  statfs: fsPromisesMock.statfs,
  default: {
    mkdir: fsPromisesMock.mkdir,
    rm: fsPromisesMock.rm,
    statfs: fsPromisesMock.statfs
  }
}))

function createFakeStream(): FakeWriteStream {
  const stream = new FakeWriteStream()
  return stream
}

/**
 * Wires createWriteStream to emit 'open' right after being called, so it
 * fires after `once(stream, 'open')` has subscribed inside openStream().
 */
function primeCreateWriteStream(stream: FakeWriteStream): void {
  fsMock.createWriteStream.mockImplementation(() => {
    queueMicrotask(() => stream.emit('open'))
    return stream
  })
}

function createEvent(senderId: number): { sender: { id: number; setBackgroundThrottling: ReturnType<typeof vi.fn> } } {
  return {
    sender: {
      id: senderId,
      setBackgroundThrottling: vi.fn()
    }
  }
}

function ampleDiskSpace(): { bavail: number; bsize: number } {
  return { bavail: 10_000_000, bsize: 1024 }
}

function scarceDiskSpace(): { bavail: number; bsize: number } {
  return { bavail: 1, bsize: 1 }
}

async function loadRecordingModule(): Promise<typeof import('./recording.js')> {
  vi.resetModules()
  return import('./recording.js')
}

function getHandler(channel: string): (...args: unknown[]) => unknown {
  const call = electronMock.handle.mock.calls.find(([registeredChannel]) => registeredChannel === channel)

  if (!call) {
    throw new Error(`Handler for ${channel} was not registered`)
  }

  return call[1] as (...args: unknown[]) => unknown
}

describe('recording IPC', () => {
  beforeEach(() => {
    electronMock.handle.mockReset()
    electronMock.appOn.mockReset()
    electronMock.showItemInFolder.mockReset()
    electronMock.fromId.mockReset()
    fsMock.createWriteStream.mockReset()
    fsPromisesMock.mkdir.mockReset().mockResolvedValue(undefined)
    fsPromisesMock.rm.mockReset().mockResolvedValue(undefined)
    fsPromisesMock.statfs.mockReset()
    delete process.env.NEXTDJ_PERF_RECORDINGS_DIR
    process.env.NEXTDJ_PERF_RECORDINGS_DIR = '/tmp/fake-recordings'
  })

  afterEach(() => {
    delete process.env.NEXTDJ_PERF_RECORDINGS_DIR
  })

  it('starts a recording session and opens a write stream in exclusive mode', async () => {
    fsPromisesMock.statfs.mockResolvedValue(ampleDiskSpace())
    const stream = createFakeStream()
    primeCreateWriteStream(stream)

    const { registerRecordingIpc } = await loadRecordingModule()
    registerRecordingIpc()

    const startHandler = getHandler('recording:start')
    const event = createEvent(1)
    const resultPromise = startHandler(event, { extension: 'webm', video: false }) as Promise<{
      id: string
      filePath: string
    }>
    const result = await resultPromise

    expect(result.id).toEqual(expect.any(String))
    expect(result.filePath.startsWith('/tmp/fake-recordings')).toBe(true)
    expect(fsMock.createWriteStream).toHaveBeenCalledWith(result.filePath, { flags: 'wx' })
  })

  it('cleans up the reserved file when disk space is insufficient', async () => {
    fsPromisesMock.statfs.mockResolvedValue(scarceDiskSpace())

    const { registerRecordingIpc } = await loadRecordingModule()
    registerRecordingIpc()

    const startHandler = getHandler('recording:start')
    const event = createEvent(1)

    await expect(startHandler(event, { extension: 'webm', video: false })).rejects.toThrow(
      'Not enough free disk space to record'
    )

    expect(fsPromisesMock.rm).toHaveBeenCalledWith(
      expect.stringContaining('/tmp/fake-recordings'),
      { force: true }
    )
    expect(fsMock.createWriteStream).not.toHaveBeenCalled()
  })

  it('refuses to append a chunk to a session owned by a different sender', async () => {
    fsPromisesMock.statfs.mockResolvedValue(ampleDiskSpace())
    const stream = createFakeStream()
    primeCreateWriteStream(stream)

    const { registerRecordingIpc } = await loadRecordingModule()
    registerRecordingIpc()

    const startHandler = getHandler('recording:start')
    const ownerEvent = createEvent(1)
    const { id } = (await startHandler(ownerEvent, { extension: 'webm', video: false })) as { id: string }

    const appendHandler = getHandler('recording:append-chunk')
    const intruderEvent = createEvent(2)
    const chunk = new ArrayBuffer(8)

    // The ownership check (sessions.getOwnedActive) runs before any writes,
    // so a sender who doesn't own the session gets rejected outright.
    await expect(appendHandler(intruderEvent, id, chunk)).rejects.toThrow('Recording session not found.')

    expect(stream.writeCalls).toHaveLength(0)
  })

  it('rejects reveal for paths outside the recordings directory and allows paths inside', async () => {
    const { registerRecordingIpc } = await loadRecordingModule()
    registerRecordingIpc()

    const revealHandler = getHandler('recording:reveal')

    expect(() => revealHandler({}, '/tmp/fake-recordings Evil/x.mp4')).toThrow('Invalid recording path.')
    expect(electronMock.showItemInFolder).not.toHaveBeenCalled()

    revealHandler({}, '/tmp/fake-recordings/inside.mp4')
    expect(electronMock.showItemInFolder).toHaveBeenCalledWith('/tmp/fake-recordings/inside.mp4')
  })

  it('stops a session and returns file info after appending a chunk from the owner', async () => {
    fsPromisesMock.statfs.mockResolvedValue(ampleDiskSpace())
    const stream = createFakeStream()
    primeCreateWriteStream(stream)

    const { registerRecordingIpc } = await loadRecordingModule()
    registerRecordingIpc()

    const startHandler = getHandler('recording:start')
    const ownerEvent = createEvent(1)
    const { id, filePath } = (await startHandler(ownerEvent, { extension: 'webm', video: false })) as {
      id: string
      filePath: string
    }

    const appendHandler = getHandler('recording:append-chunk')
    const chunk = new ArrayBuffer(4)
    await appendHandler(ownerEvent, id, chunk)
    expect(stream.writeCalls).toHaveLength(1)

    const stopHandler = getHandler('recording:stop')
    const stopResult = (await stopHandler(ownerEvent, id)) as { filePath: string; bytes: number }

    expect(stopResult.filePath).toBe(filePath)
    expect(stopResult.bytes).toBe(4)
  })
})
