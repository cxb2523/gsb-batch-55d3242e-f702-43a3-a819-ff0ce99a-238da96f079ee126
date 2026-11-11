import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LibraryTrack } from './useLibrary'
import { useDeckLoading } from './useDeckLoading'

const localTrack: LibraryTrack = {
  id: 'track-1',
  title: 'Local Track',
  duration: 60,
  bpm: 120,
  firstBeatOffset: 0,
  source: 'local',
  file: new File(['audio'], 'local.mp3', { type: 'audio/mpeg' })
}

const remoteTrack: LibraryTrack = {
  id: 'track-2',
  title: 'Remote Track',
  duration: 60,
  bpm: 120,
  firstBeatOffset: 0,
  source: 'external',
  providerId: 'demo-local',
  externalRef: 'track-1'
}

function createOptions(overrides: Partial<Parameters<typeof useDeckLoading>[0]> = {}) {
  return {
    libraryReady: true,
    addFiles: vi.fn().mockResolvedValue([localTrack]),
    resolveTrackFile: vi.fn().mockResolvedValue(
      localTrack.file ? { file: localTrack.file, analysis: { bpm: localTrack.bpm, firstBeatOffset: 0 } } : null
    ),
    getTrack: vi.fn((trackId: string) => (trackId === localTrack.id ? localTrack : undefined)),
    loadTrack: vi.fn().mockResolvedValue(true),
    ...overrides
  }
}

function createDeferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolvePromise = (_value: T): void => undefined
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve
  })

  return { promise, resolve: resolvePromise }
}

describe('useDeckLoading', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('loads dropped files, persists the selected track and clears loading state', async () => {
    const options = createOptions()
    const { result } = renderHook(() => useDeckLoading(options))
    const file = new File(['audio'], 'drop.mp3', { type: 'audio/mpeg' })

    await act(async () => {
      await result.current.loadFileToDeck('A', file)
    })

    expect(options.addFiles).toHaveBeenCalledWith([file])
    expect(options.loadTrack).toHaveBeenCalledWith('A', file, { bpm: 120, firstBeatOffset: 0 }, localTrack.id)
    expect(localStorage.getItem('nextdj.deckTracks.v1')).toContain(localTrack.id)
    expect(result.current.loadingDecks.A).toBeUndefined()
  })

  it('loads library tracks through the resolver', async () => {
    const file = new File(['audio'], 'resolved.mp3', { type: 'audio/mpeg' })
    const options = createOptions({
      resolveTrackFile: vi.fn().mockResolvedValue({
        file,
        analysis: { bpm: 122, firstBeatOffset: 0.4 }
      })
    })
    const { result } = renderHook(() => useDeckLoading(options))

    await act(async () => {
      await result.current.loadLibraryTrack('B', remoteTrack)
    })

    expect(options.resolveTrackFile).toHaveBeenCalledWith(remoteTrack)
    expect(options.loadTrack).toHaveBeenCalledWith('B', file, { bpm: 122, firstBeatOffset: 0.4 }, remoteTrack.id)
    expect(localStorage.getItem('nextdj.deckTracks.v1')).toContain(remoteTrack.id)
    expect(result.current.loadingDecks.B).toBeUndefined()
  })

  it('falls back to deck-side BPM detection when stored analysis is invalid', async () => {
    const file = new File(['audio'], 'resolved.mp3', { type: 'audio/mpeg' })
    const unanalysedTrack: LibraryTrack = { ...remoteTrack, bpm: 0 }
    const options = createOptions({
      resolveTrackFile: vi.fn().mockResolvedValue({ file, analysis: { bpm: 0, firstBeatOffset: 0 } })
    })
    const { result } = renderHook(() => useDeckLoading(options))

    await act(async () => {
      await result.current.loadLibraryTrack('A', unanalysedTrack)
    })

    expect(options.loadTrack).toHaveBeenCalledWith('A', file, undefined, unanalysedTrack.id)
  })

  it('skips deck loading when a library track cannot be resolved', async () => {
    const options = createOptions({
      resolveTrackFile: vi.fn().mockResolvedValue(null)
    })
    const { result } = renderHook(() => useDeckLoading(options))

    await act(async () => {
      await result.current.loadLibraryTrack('A', remoteTrack)
    })

    expect(options.loadTrack).not.toHaveBeenCalled()
    expect(result.current.loadingDecks.A).toBeUndefined()
  })

  it('surfaces typed deck load failures without leaving the deck pending', async () => {
    const options = createOptions({
      loadTrack: vi.fn().mockRejectedValue(new Error('Decoder rejected this file.'))
    })
    const { result } = renderHook(() => useDeckLoading(options))

    await act(async () => {
      await result.current.loadLibraryTrack('A', localTrack)
    })

    expect(result.current.loadingDecks.A).toBeUndefined()
    expect(result.current.deckErrors.A).toBe('Decoder rejected this file.')

    act(() => result.current.clearDeckError('A'))
    expect(result.current.deckErrors.A).toBeUndefined()
  })

  it('loads tracks by id when present', async () => {
    const options = createOptions()
    const { result } = renderHook(() => useDeckLoading(options))

    await act(async () => {
      await result.current.loadLibraryTrackById('A', localTrack.id)
      await result.current.loadLibraryTrackById('A', 'missing')
    })

    expect(options.loadTrack).toHaveBeenCalledTimes(1)
  })

  it('lets the latest overlapping load own deck state and persistence', async () => {
    const firstResolution = createDeferred<Awaited<ReturnType<Parameters<typeof useDeckLoading>[0]['resolveTrackFile']>>>()
    const secondFile = new File(['second'], 'second.mp3', { type: 'audio/mpeg' })
    const secondTrack: LibraryTrack = { ...remoteTrack, id: 'track-latest', externalRef: 'track-latest' }
    const resolveTrackFile = vi
      .fn()
      .mockImplementationOnce(() => firstResolution.promise)
      .mockResolvedValueOnce({ file: secondFile, analysis: { bpm: 128, firstBeatOffset: 0.1 } })
    const options = createOptions({ resolveTrackFile })
    const { result } = renderHook(() => useDeckLoading(options))

    await act(async () => {
      const firstLoad = result.current.loadLibraryTrack('A', remoteTrack)
      const secondLoad = result.current.loadLibraryTrack('A', secondTrack)

      await secondLoad
      firstResolution.resolve({ file: localTrack.file as File, analysis: { bpm: 120, firstBeatOffset: 0 } })
      await firstLoad
    })

    expect(options.loadTrack).toHaveBeenCalledTimes(1)
    expect(options.loadTrack).toHaveBeenCalledWith(
      'A',
      secondFile,
      { bpm: 128, firstBeatOffset: 0.1 },
      secondTrack.id
    )
    expect(localStorage.getItem('nextdj.deckTracks.v1')).toContain(secondTrack.id)
    expect(localStorage.getItem('nextdj.deckTracks.v1')).not.toContain(remoteTrack.id)
  })

  it('restores persisted deck selections once the library is ready', async () => {
    localStorage.setItem('nextdj.deckTracks.v1', JSON.stringify({ A: localTrack.id }))
    const options = createOptions()

    renderHook(() => useDeckLoading(options))

    await waitFor(() =>
      expect(options.loadTrack).toHaveBeenCalledWith(
        'A',
        localTrack.file,
        { bpm: 120, firstBeatOffset: 0 },
        localTrack.id
      )
    )
  })

  it('does not restore until the library is ready', async () => {
    localStorage.setItem('nextdj.deckTracks.v1', JSON.stringify({ A: localTrack.id }))
    const options = createOptions({ libraryReady: false })

    renderHook(() => useDeckLoading(options))

    await new Promise((resolve) => window.setTimeout(resolve, 0))
    expect(options.loadTrack).not.toHaveBeenCalled()
  })
})
