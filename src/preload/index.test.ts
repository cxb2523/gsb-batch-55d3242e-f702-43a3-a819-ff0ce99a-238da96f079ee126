import { beforeEach, describe, expect, it, vi } from 'vitest'

const electronMock = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn()
}))

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: electronMock.exposeInMainWorld
  },
  ipcRenderer: {
    invoke: electronMock.invoke,
    on: electronMock.on,
    removeListener: electronMock.removeListener
  }
}))

describe('preload bridge', () => {
  beforeEach(() => {
    vi.resetModules()
    electronMock.exposeInMainWorld.mockClear()
    electronMock.invoke.mockReset()
    electronMock.on.mockClear()
    electronMock.removeListener.mockClear()
  })

  it('exposes the stable nextdj bridge contract', async () => {
    await import('./index.js')

    expect(electronMock.exposeInMainWorld).toHaveBeenCalledWith(
      'nextdj',
      expect.objectContaining({
        appName: 'NextDJ',
        checkForUpdate: expect.any(Function),
        openUpdateDownload: expect.any(Function),
        selectPlaylistImportFile: expect.any(Function),
        listPlaylistImportProviders: expect.any(Function),
        listPlaylistImportTracks: expect.any(Function),
        resolvePlaylistImportTrack: expect.any(Function),
        startRecording: expect.any(Function),
        appendRecordingChunk: expect.any(Function),
        stopRecording: expect.any(Function),
        cancelRecording: expect.any(Function),
        revealRecording: expect.any(Function),
        onRecordingWriteError: expect.any(Function)
      })
    )
  })

  it('routes bridge calls to IPC channels without changing their names', async () => {
    electronMock.invoke.mockResolvedValue(undefined)
    await import('./index.js')
    const bridge = electronMock.exposeInMainWorld.mock.calls[0][1]
    const chunk = new ArrayBuffer(8)

    await bridge.checkForUpdate()
    await bridge.openUpdateDownload()
    await bridge.selectPlaylistImportFile()
    await bridge.listPlaylistImportProviders()
    await bridge.listPlaylistImportTracks('demo:playlist')
    await bridge.resolvePlaylistImportTrack('demo', 'track-1')
    await bridge.startRecording({ extension: 'webm', video: false })
    await bridge.appendRecordingChunk('recording-1', chunk)
    await bridge.stopRecording('recording-1')
    await bridge.cancelRecording('recording-1', true)
    await bridge.revealRecording('/tmp/set.webm')

    expect(electronMock.invoke).toHaveBeenNthCalledWith(1, 'app-update:check')
    expect(electronMock.invoke).toHaveBeenNthCalledWith(2, 'app-update:open-download')
    expect(electronMock.invoke).toHaveBeenNthCalledWith(3, 'playlist-import:select-file')
    expect(electronMock.invoke).toHaveBeenNthCalledWith(4, 'playlist-import:list-providers')
    expect(electronMock.invoke).toHaveBeenNthCalledWith(5, 'playlist-import:list-tracks', 'demo:playlist')
    expect(electronMock.invoke).toHaveBeenNthCalledWith(6, 'playlist-import:resolve-track', 'demo', 'track-1')
    expect(electronMock.invoke).toHaveBeenNthCalledWith(7, 'recording:start', { extension: 'webm', video: false })
    expect(electronMock.invoke).toHaveBeenNthCalledWith(8, 'recording:append-chunk', 'recording-1', chunk)
    expect(electronMock.invoke).toHaveBeenNthCalledWith(9, 'recording:stop', 'recording-1')
    expect(electronMock.invoke).toHaveBeenNthCalledWith(10, 'recording:cancel', 'recording-1', true)
    expect(electronMock.invoke).toHaveBeenNthCalledWith(11, 'recording:reveal', '/tmp/set.webm')
  })

  it('returns an unsubscribe function for recording write errors', async () => {
    await import('./index.js')
    const bridge = electronMock.exposeInMainWorld.mock.calls[0][1]
    const callback = vi.fn()

    const unsubscribe = bridge.onRecordingWriteError(callback)
    const listener = electronMock.on.mock.calls[0][1]

    listener({}, { id: 'recording-1', message: 'disk full' })
    unsubscribe()

    expect(electronMock.on).toHaveBeenCalledWith('recording:write-error', expect.any(Function))
    expect(callback).toHaveBeenCalledWith({ id: 'recording-1', message: 'disk full' })
    expect(electronMock.removeListener).toHaveBeenCalledWith('recording:write-error', listener)
  })
})
