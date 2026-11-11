import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NextDjBridge } from '../../../shared/nextdj'
import { useAppUpdate } from './useAppUpdate'

function installBridge(overrides: Partial<NextDjBridge>): void {
  window.nextdj = {
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
    revealRecording: vi.fn(),
    onRecordingWriteError: vi.fn(),
    ...overrides
  }
}

describe('useAppUpdate', () => {
  afterEach(() => {
    delete window.nextdj
  })

  it('exposes a newer stable release and opens its download through the bridge', async () => {
    const openUpdateDownload = vi.fn(async () => undefined)
    installBridge({
      checkForUpdate: vi.fn(async () => ({
        available: true,
        currentVersion: '0.1.1',
        latestVersion: '0.1.2',
        downloadUrl:
          'https://github.com/antoniolg/next-dj/releases/download/v0.1.2/NextDJ-0.1.2-mac-arm64.dmg'
      })),
      openUpdateDownload
    })

    const { result } = renderHook(() => useAppUpdate())
    await waitFor(() => expect(result.current.update?.latestVersion).toBe('0.1.2'))

    await act(() => result.current.openDownload())
    expect(openUpdateDownload).toHaveBeenCalledOnce()

    act(() => result.current.dismiss())
    expect(result.current.update).toBeNull()
  })

  it('stays silent when up to date or offline', async () => {
    installBridge({
      checkForUpdate: vi.fn(async () => ({
        available: false,
        currentVersion: '0.1.1',
        latestVersion: '0.1.1',
        downloadUrl: 'https://github.com/antoniolg/next-dj/releases/tag/v0.1.1'
      }))
    })

    const current = renderHook(() => useAppUpdate())
    await waitFor(() => expect(window.nextdj?.checkForUpdate).toHaveBeenCalledOnce())
    expect(current.result.current.update).toBeNull()
    current.unmount()

    installBridge({ checkForUpdate: vi.fn(async () => Promise.reject(new Error('offline'))) })
    const offline = renderHook(() => useAppUpdate())
    await waitFor(() => expect(window.nextdj?.checkForUpdate).toHaveBeenCalledOnce())
    expect(offline.result.current.update).toBeNull()
  })

  it('keeps a retryable error when the browser cannot be opened', async () => {
    installBridge({
      checkForUpdate: vi.fn(async () => ({
        available: true,
        currentVersion: '0.1.1',
        latestVersion: '0.1.2',
        downloadUrl: 'https://github.com/antoniolg/next-dj/releases/tag/v0.1.2'
      })),
      openUpdateDownload: vi.fn(async () => Promise.reject(new Error('browser unavailable')))
    })

    const { result } = renderHook(() => useAppUpdate())
    await waitFor(() => expect(result.current.update).not.toBeNull())
    await act(() => result.current.openDownload())

    expect(result.current.error).toBe('Could not open the update download. Please try again.')
    expect(result.current.openingDownload).toBe(false)
  })
})
