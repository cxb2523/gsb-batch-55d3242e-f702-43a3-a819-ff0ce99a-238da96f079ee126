import { useCallback, useEffect, useRef, useState } from 'react'
import {
  clearDeckTrackSelection,
  persistDeckTrack,
  readDeckTrackSelection
} from '../app/deckTrackPersistence'
import type { DeckLoadAnalysis } from '../audio/deck'
import type { LibraryTrack, ResolvedTrackFile } from './useLibrary'
import type { DeckId } from '../app/engineTypes'

type DeckLoadingState = Partial<Record<DeckId, string>>
type DeckErrorState = Partial<Record<DeckId, string>>

interface UseDeckLoadingOptions {
  libraryReady: boolean
  addFiles: (files: File[] | FileList) => Promise<LibraryTrack[]>
  resolveTrackFile: (track: LibraryTrack) => Promise<ResolvedTrackFile | null>
  getTrack: (trackId: string) => LibraryTrack | undefined
  loadTrack: (deckId: DeckId, file: File, analysis?: DeckLoadAnalysis, trackId?: string) => Promise<boolean>
}

function getValidAnalysis(analysis: DeckLoadAnalysis | undefined): DeckLoadAnalysis | undefined {
  if (!analysis || analysis.bpm <= 0 || !Number.isFinite(analysis.bpm) || !Number.isFinite(analysis.firstBeatOffset)) {
    return undefined
  }

  return {
    bpm: analysis.bpm,
    firstBeatOffset: analysis.firstBeatOffset,
    artworkUrl: analysis.artworkUrl
  }
}

function getTrackAnalysis(track: LibraryTrack | undefined): DeckLoadAnalysis | undefined {
  return track ? getValidAnalysis(track) : undefined
}

export function useDeckLoading({
  libraryReady,
  addFiles,
  resolveTrackFile,
  getTrack,
  loadTrack
}: UseDeckLoadingOptions): {
  loadingDecks: DeckLoadingState
  deckErrors: DeckErrorState
  clearDeckError: (deckId: DeckId) => void
  loadFileToDeck: (deckId: DeckId, file: File) => Promise<void>
  loadLibraryTrack: (deckId: DeckId, track: LibraryTrack) => Promise<void>
  loadLibraryTrackById: (deckId: DeckId, trackId: string) => Promise<void>
} {
  const [loadingDecks, setLoadingDecks] = useState<DeckLoadingState>({})
  const [deckErrors, setDeckErrors] = useState<DeckErrorState>({})
  const restoredDecksRef = useRef(false)
  const operationIdsRef = useRef<Record<DeckId, number>>({ A: 0, B: 0 })

  const beginOperation = useCallback((deckId: DeckId): number => {
    operationIdsRef.current[deckId] += 1
    return operationIdsRef.current[deckId]
  }, [])

  const isCurrentOperation = useCallback(
    (deckId: DeckId, operationId: number): boolean => operationIdsRef.current[deckId] === operationId,
    []
  )

  const setDeckLoading = useCallback((deckId: DeckId, message: string | null): void => {
    setLoadingDecks((current) => {
      const next = { ...current }

      if (message) {
        next[deckId] = message
      } else {
        delete next[deckId]
      }

      return next
    })
  }, [])

  const setDeckError = useCallback((deckId: DeckId, message: string | null): void => {
    setDeckErrors((current) => {
      const next = { ...current }

      if (message) {
        next[deckId] = message
      } else {
        delete next[deckId]
      }

      return next
    })
  }, [])

  const clearDeckError = useCallback((deckId: DeckId): void => setDeckError(deckId, null), [setDeckError])

  const loadFileToDeck = useCallback(
    async (deckId: DeckId, file: File): Promise<void> => {
      const operationId = beginOperation(deckId)
      setDeckError(deckId, null)
      setDeckLoading(deckId, 'Analyzing audio...')

      try {
        const [track] = await addFiles([file])

        if (!isCurrentOperation(deckId, operationId)) {
          return
        }

        setDeckLoading(deckId, 'Loading deck...')
        const committed = await loadTrack(deckId, file, getTrackAnalysis(track), track?.id)

        if (committed && track && isCurrentOperation(deckId, operationId)) {
          persistDeckTrack(deckId, track.id)
        }
      } catch (error) {
        if (isCurrentOperation(deckId, operationId)) {
          setDeckError(deckId, error instanceof Error ? error.message : 'Could not load this track.')
        }
      } finally {
        if (isCurrentOperation(deckId, operationId)) {
          setDeckLoading(deckId, null)
        }
      }
    },
    [addFiles, beginOperation, isCurrentOperation, loadTrack, setDeckError, setDeckLoading]
  )

  const loadLibraryTrack = useCallback(
    async (deckId: DeckId, track: LibraryTrack): Promise<void> => {
      const operationId = beginOperation(deckId)
      setDeckError(deckId, null)
      setDeckLoading(deckId, track.file ? 'Loading deck...' : 'Downloading audio...')

      try {
        const resolved = await resolveTrackFile(track)

        if (!resolved || !isCurrentOperation(deckId, operationId)) {
          return
        }

        setDeckLoading(deckId, 'Decoding waveform...')
        const committed = await loadTrack(
          deckId,
          resolved.file,
          getValidAnalysis(resolved.analysis) ?? getTrackAnalysis(track),
          track.id
        )

        if (committed && isCurrentOperation(deckId, operationId)) {
          persistDeckTrack(deckId, track.id)
        }
      } catch (error) {
        if (isCurrentOperation(deckId, operationId)) {
          setDeckError(deckId, error instanceof Error ? error.message : 'Could not load this track.')
        }
      } finally {
        if (isCurrentOperation(deckId, operationId)) {
          setDeckLoading(deckId, null)
        }
      }
    },
    [beginOperation, isCurrentOperation, loadTrack, resolveTrackFile, setDeckError, setDeckLoading]
  )

  const loadLibraryTrackById = useCallback(
    async (deckId: DeckId, trackId: string): Promise<void> => {
      const track = getTrack(trackId)

      if (track) {
        await loadLibraryTrack(deckId, track)
      }
    },
    [getTrack, loadLibraryTrack]
  )

  useEffect(() => {
    if (!libraryReady || restoredDecksRef.current) {
      return
    }

    restoredDecksRef.current = true
    const parsed = readDeckTrackSelection()

    ;(['A', 'B'] as const).forEach((deckId) => {
      const trackId = parsed[deckId]
      const track = trackId ? getTrack(trackId) : undefined

      if (track) {
        void loadLibraryTrack(deckId, track)
      }
    })

    if (!parsed.A && !parsed.B) {
      clearDeckTrackSelection()
    }
  }, [getTrack, libraryReady, loadLibraryTrack])

  return { loadingDecks, deckErrors, clearDeckError, loadFileToDeck, loadLibraryTrack, loadLibraryTrackById }
}
