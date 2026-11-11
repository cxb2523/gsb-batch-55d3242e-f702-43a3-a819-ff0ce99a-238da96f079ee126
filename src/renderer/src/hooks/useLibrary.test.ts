import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useLibrary } from './useLibrary'

const repository = vi.hoisted(() => ({
  deletePersistedFiles: vi.fn(),
  fileFromBlob: vi.fn(),
  getPersistedFile: vi.fn(),
  persistTrackMetadata: vi.fn(),
  putPersistedFile: vi.fn(),
  readPersistedLibrary: vi.fn()
}))

const metadata = vi.hoisted(() => ({
  readAudioMetadata: vi.fn()
}))

vi.mock('../library/libraryRepository', () => repository)
vi.mock('../library/audioMetadata', () => metadata)

describe('useLibrary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    repository.readPersistedLibrary.mockReturnValue({ tracks: [], issues: [], migrated: false })
    repository.putPersistedFile.mockResolvedValue(undefined)
    repository.deletePersistedFiles.mockResolvedValue(undefined)
    repository.getPersistedFile.mockResolvedValue(null)
    metadata.readAudioMetadata.mockResolvedValue({ duration: 60, bpm: 120, firstBeatOffset: 0 })
  })

  it('commits playlist state only after metadata persistence succeeds', async () => {
    const { result } = renderHook(() => useLibrary())
    await waitFor(() => expect(result.current.isReady).toBe(true))

    await act(async () => {
      await result.current.addPlaylistImportTracks([
        { providerId: 'demo', id: 'one', title: 'One', artworkUrl: 'https://example.com/one.jpg', duration: 60, externalRef: 'one' }
      ])
    })

    expect(repository.persistTrackMetadata).toHaveBeenCalledTimes(1)
    expect(result.current.tracks).toMatchObject([
      { id: 'external-demo-one', title: 'One', artworkUrl: 'https://example.com/one.jpg' }
    ])
    expect(result.current.error).toBeNull()
  })

  it('replaces the current library when a playlist is imported', async () => {
    const { result } = renderHook(() => useLibrary())
    await waitFor(() => expect(result.current.isReady).toBe(true))
    const localFile = new File(['audio'], 'local.mp3', { type: 'audio/mpeg' })
    let localTrackId = ''

    await act(async () => {
      const [localTrack] = await result.current.addFiles([localFile])
      localTrackId = localTrack.id
      await result.current.addPlaylistImportTracks([
        {
          providerId: 'demo',
          id: 'one',
          title: 'One',
          artist: 'Artist One',
          duration: 60,
          externalRef: 'one'
        }
      ])
    })

    expect(result.current.tracks).toMatchObject([
      { id: 'external-demo-one', title: 'One', artist: 'Artist One' }
    ])
    expect(repository.deletePersistedFiles).toHaveBeenCalledWith([localTrackId])
  })

  it('keeps prior state authoritative when persistence fails', async () => {
    repository.readPersistedLibrary.mockReturnValue({
      tracks: [
        {
          id: 'existing',
          title: 'Existing',
          duration: 120,
          bpm: 124,
          firstBeatOffset: 0,
          source: 'local',
          hasFile: false
        }
      ],
      issues: [],
      migrated: false
    })
    repository.persistTrackMetadata.mockImplementationOnce(() => {
      throw new Error('Storage quota exceeded.')
    })
    const { result } = renderHook(() => useLibrary())
    await waitFor(() => expect(result.current.isReady).toBe(true))

    await act(async () => {
      await expect(
        result.current.addPlaylistImportTracks([
          { providerId: 'demo', id: 'one', title: 'One', duration: 60, externalRef: 'one' }
        ])
      ).rejects.toThrow('Storage quota exceeded.')
    })

    expect(result.current.tracks).toMatchObject([{ id: 'existing', title: 'Existing' }])
    expect(repository.deletePersistedFiles).not.toHaveBeenCalled()
    expect(result.current.error).toBe('Storage quota exceeded.')
  })

  it('does not commit local tracks when file persistence fails', async () => {
    repository.putPersistedFile.mockRejectedValueOnce(new Error('IndexedDB unavailable.'))
    const { result } = renderHook(() => useLibrary())
    await waitFor(() => expect(result.current.isReady).toBe(true))

    await act(async () => {
      await expect(result.current.addFiles([new File(['audio'], 'track.mp3', { type: 'audio/mpeg' })])).rejects.toThrow(
        'IndexedDB unavailable.'
      )
    })

    expect(repository.persistTrackMetadata).not.toHaveBeenCalled()
    expect(result.current.tracks).toEqual([])
    expect(result.current.error).toBe('IndexedDB unavailable.')
  })

  it('surfaces quarantined hydration records without blocking valid startup', async () => {
    repository.readPersistedLibrary.mockReturnValue({
      tracks: [],
      issues: [{ index: 1, reason: 'title is invalid' }],
      migrated: false
    })
    const { result } = renderHook(() => useLibrary())

    await waitFor(() => expect(result.current.isReady).toBe(true))
    expect(result.current.error).toContain('quarantined 1 invalid record')

    act(() => result.current.clearError())
    expect(result.current.error).toBeNull()
  })
})
