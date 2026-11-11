import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PlaylistImportTrack } from '../../../shared/nextdj'
import { readAudioMetadata } from '../library/audioMetadata'
import { mapWithConcurrency } from '../library/concurrentTasks'
import { createPlaylistFileName, createTrackId, isAudioFile } from '../library/libraryFiles'
import {
  deletePersistedFiles,
  fileFromBlob,
  getPersistedFile,
  persistTrackMetadata,
  putPersistedFile,
  readPersistedLibrary
} from '../library/libraryRepository'
import { LibraryTransactionQueue, prepareLibraryUpdate } from '../library/libraryTransactions'
import type { LibraryTrack } from '../library/libraryTypes'
import type { DeckLoadAnalysis } from '../audio/deck'
import { createEmbeddedArtworkUrl } from '../library/audioArtwork'
import { readCachedFileBuffer } from '../audio/audioFileCache'

export type { LibraryTrack } from '../library/libraryTypes'

export interface ResolvedTrackFile {
  file: File
  analysis?: DeckLoadAnalysis
}

const LEGACY_EXTERNAL_SOURCE = 'you' + 'tube'
const LEGACY_EXTERNAL_REF_KEY = 'you' + 'tubeUrl'
const LEGACY_TRACK_ID_PREFIX = 'you' + 'tube-'
const LEGACY_PROVIDER_ID = 'legacy-external'
const HYDRATION_CONCURRENCY = 4
const METADATA_CONCURRENCY = 2
const FILE_PERSISTENCE_CONCURRENCY = 2

function migratePersistedTrack(track: ReturnType<typeof readPersistedLibrary>['tracks'][number]): LibraryTrack {
  if (track.source === LEGACY_EXTERNAL_SOURCE) {
    const legacyRef = typeof track[LEGACY_EXTERNAL_REF_KEY] === 'string' ? track[LEGACY_EXTERNAL_REF_KEY] : undefined
    const legacyId = track.id.startsWith(LEGACY_TRACK_ID_PREFIX)
      ? track.id.slice(LEGACY_TRACK_ID_PREFIX.length)
      : track.id

    return {
      id: `external-${LEGACY_PROVIDER_ID}-${legacyId}`,
      title: track.title,
      artist: track.artist,
      artworkUrl: track.artworkUrl,
      duration: track.duration,
      bpm: track.bpm,
      firstBeatOffset: track.firstBeatOffset,
      source: 'external',
      providerId: LEGACY_PROVIDER_ID,
      externalRef: legacyRef
    }
  }

  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    artworkUrl: track.artworkUrl,
    duration: track.duration,
    bpm: track.bpm,
    firstBeatOffset: track.firstBeatOffset,
    source: track.source === 'external' ? 'external' : 'local',
    providerId: track.providerId,
    externalRef: track.externalRef
  }
}

function describeLibraryError(error: unknown): string {
  return error instanceof Error ? error.message : 'The library operation could not be completed.'
}

export function useLibrary(): {
  tracks: LibraryTrack[]
  isReady: boolean
  error: string | null
  clearError: () => void
  addFiles: (files: File[] | FileList) => Promise<LibraryTrack[]>
  addPlaylistImportTracks: (importTracks: PlaylistImportTrack[]) => Promise<LibraryTrack[]>
  resolveTrackFile: (track: LibraryTrack) => Promise<ResolvedTrackFile | null>
  getTrack: (trackId: string) => LibraryTrack | undefined
} {
  const [tracks, setTracks] = useState<LibraryTrack[]>([])
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const tracksRef = useRef<LibraryTrack[]>([])
  const transactionQueueRef = useRef(new LibraryTransactionQueue())
  const tracksById = useMemo(() => new Map(tracks.map((track) => [track.id, track])), [tracks])
  const clearError = useCallback((): void => setError(null), [])

  useEffect(() => {
    let cancelled = false

    const hydrate = async (): Promise<void> => {
      const persistedLibrary = readPersistedLibrary()
      const hydratedTracks = await mapWithConcurrency(
        persistedLibrary.tracks,
        HYDRATION_CONCURRENCY,
        async (track): Promise<LibraryTrack> => {
          const blob = track.hasFile ? await getPersistedFile(track.id).catch(() => null) : null
          const migratedTrack = migratePersistedTrack(track)
          const file = blob ? fileFromBlob(blob, track) : undefined
          const artworkUrl =
            migratedTrack.artworkUrl ??
            (file ? createEmbeddedArtworkUrl(await readCachedFileBuffer(file).catch(() => new ArrayBuffer(0))) : undefined)

          if (file && migratedTrack.id !== track.id) {
            await putPersistedFile(migratedTrack.id, file).catch(() => undefined)
          }

          return {
            ...migratedTrack,
            artworkUrl,
            file
          }
        }
      )

      if (!cancelled) {
        tracksRef.current = hydratedTracks
        setTracks(hydratedTracks)
        setError(
          persistedLibrary.issues.length > 0
            ? `Recovered the library and quarantined ${persistedLibrary.issues.length} invalid record${persistedLibrary.issues.length === 1 ? '' : 's'}.`
            : null
        )
        setIsReady(true)
      }
    }

    void hydrate()

    return () => {
      cancelled = true
    }
  }, [])

  const addFiles = useCallback(async (files: File[] | FileList): Promise<LibraryTrack[]> => {
    try {
      const audioFiles = Array.from(files).filter(isAudioFile)
      const nextTracks = await mapWithConcurrency(audioFiles, METADATA_CONCURRENCY, async (file) => ({
        id: createTrackId(file),
        title: file.name,
        ...(await readAudioMetadata(file)),
        file,
        source: 'local' as const
      }))

      return await transactionQueueRef.current.run(async () => {
        const updatedTracks = prepareLibraryUpdate(tracksRef.current, nextTracks)

        await mapWithConcurrency(nextTracks, FILE_PERSISTENCE_CONCURRENCY, (track) =>
          track.file ? putPersistedFile(track.id, track.file) : Promise.resolve()
        )
        persistTrackMetadata(updatedTracks)
        tracksRef.current = updatedTracks
        setTracks(updatedTracks)
        setError(null)
        return nextTracks
      })
    } catch (operationError) {
      setError(describeLibraryError(operationError))
      throw operationError
    }
  }, [])

  const addPlaylistImportTracks = useCallback(async (importTracks: PlaylistImportTrack[]): Promise<LibraryTrack[]> => {
    const importedTracks = importTracks.map((track) => ({
      id: `external-${track.providerId}-${track.id}`,
      title: track.title,
      artist: track.artist,
      artworkUrl: track.artworkUrl,
      duration: track.duration,
      bpm: 0,
      firstBeatOffset: 0,
      source: 'external' as const,
      providerId: track.providerId,
      externalRef: track.externalRef
    }))

    try {
      return await transactionQueueRef.current.run(async () => {
        const currentTracks = tracksRef.current
        const currentTracksById = new Map(currentTracks.map((track) => [track.id, track]))
        const nextTracks = importedTracks.map((track) => {
          const currentTrack = currentTracksById.get(track.id)

          return currentTrack?.file
            ? {
                ...track,
                duration: currentTrack.duration,
                bpm: currentTrack.bpm,
                firstBeatOffset: currentTrack.firstBeatOffset,
                file: currentTrack.file
              }
            : track
        })
        const updatedTracks = prepareLibraryUpdate([], nextTracks)
        const retainedTrackIds = new Set(updatedTracks.map((track) => track.id))
        const removedFileIds = currentTracks
          .filter((track) => !retainedTrackIds.has(track.id))
          .map((track) => track.id)

        persistTrackMetadata(updatedTracks)
        tracksRef.current = updatedTracks
        setTracks(updatedTracks)
        setError(null)
        await deletePersistedFiles(removedFileIds).catch(() => undefined)
        return nextTracks
      })
    } catch (operationError) {
      setError(describeLibraryError(operationError))
      throw operationError
    }
  }, [])

  const resolveTrackFile = useCallback(async (track: LibraryTrack): Promise<ResolvedTrackFile | null> => {
    if (track.file) {
      return {
        file: track.file,
        analysis: { bpm: track.bpm, firstBeatOffset: track.firstBeatOffset, artworkUrl: track.artworkUrl }
      }
    }

    if (track.source !== 'external' || !track.providerId || !track.externalRef) {
      return null
    }

    const resolver = window.nextdj?.resolvePlaylistImportTrack

    if (!resolver) {
      return null
    }

    try {
      const result = await resolver(track.providerId, track.externalRef)

      if (!result.file) {
        return null
      }

      const file = new File([result.file.data], createPlaylistFileName(track.title, result.file.name), {
        lastModified: result.file.lastModified,
        type: result.file.type ?? 'audio/mpeg'
      })
      const { duration, ...fileAnalysis } = await readAudioMetadata(file)
      const analysis = {
        ...fileAnalysis,
        artworkUrl: track.artworkUrl ?? fileAnalysis.artworkUrl
      }

      await transactionQueueRef.current.run(async () => {
        const updatedTracks = tracksRef.current.map((currentTrack) =>
          currentTrack.id === track.id
            ? {
                ...currentTrack,
                duration,
                ...analysis,
                file
              }
            : currentTrack
        )

        await putPersistedFile(track.id, file)
        persistTrackMetadata(updatedTracks)
        tracksRef.current = updatedTracks
        setTracks(updatedTracks)
        setError(null)
      })

      return { file, analysis }
    } catch (operationError) {
      setError(describeLibraryError(operationError))
      throw operationError
    }
  }, [])

  const getTrack = useCallback((trackId: string): LibraryTrack | undefined => tracksById.get(trackId), [tracksById])

  return { tracks, isReady, error, clearError, addFiles, addPlaylistImportTracks, resolveTrackFile, getTrack }
}
