import { useCallback, useEffect, useState } from 'react'
import type { LibraryTrack } from '../../hooks/useLibrary'

interface UsePlaylistImportOptions {
  onAddPlaylistImportTracks: (importTracks: PlaylistImportTrack[]) => Promise<LibraryTrack[]>
}

interface PlaylistImportState {
  hasPlaylistImportProviders: boolean
  isImportingPlaylist: boolean
  playlistStatus: string | null
  playlistInput: string
  setPlaylistInput: (input: string) => void
  handleSelectPlaylistFile: () => Promise<void>
  handlePlaylistImport: () => Promise<void>
}

const PROVIDER_DEPENDENCY_ERROR_PATTERN =
  /Playlist provider dependency "[a-z0-9][a-z0-9._-]{0,63}" was not found\. Install it or configure the provider\./i

export function describePlaylistImportError(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Could not read this playlist.'
  }

  return PROVIDER_DEPENDENCY_ERROR_PATTERN.exec(error.message)?.[0] ?? error.message
}

export function usePlaylistImport({ onAddPlaylistImportTracks }: UsePlaylistImportOptions): PlaylistImportState {
  const [playlistInput, setPlaylistInput] = useState('')
  const [playlistStatus, setPlaylistStatus] = useState<string | null>(null)
  const [isImportingPlaylist, setIsImportingPlaylist] = useState(false)
  const [hasPlaylistImportProviders, setHasPlaylistImportProviders] = useState(false)

  useEffect(() => {
    let cancelled = false

    void window.nextdj
      ?.listPlaylistImportProviders()
      .then((providers) => {
        if (!cancelled) {
          setHasPlaylistImportProviders(providers.length > 0)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHasPlaylistImportProviders(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  const handlePlaylistImport = useCallback(async (): Promise<void> => {
    const listPlaylistImportTracks = window.nextdj?.listPlaylistImportTracks

    if (!listPlaylistImportTracks) {
      setPlaylistStatus('Playlist import is not available in this build.')
      return
    }

    setIsImportingPlaylist(true)
    setPlaylistStatus('Reading playlist...')

    try {
      const importTracks = await listPlaylistImportTracks(playlistInput)

      if (importTracks.length === 0) {
        setPlaylistStatus('No tracks were found in this playlist.')
        return
      }

      await onAddPlaylistImportTracks(importTracks)
      setPlaylistStatus(`Listed ${importTracks.length} track${importTracks.length === 1 ? '' : 's'}. Downloads happen on load.`)
      setPlaylistInput('')
    } catch (error) {
      setPlaylistStatus(describePlaylistImportError(error))
    } finally {
      setIsImportingPlaylist(false)
    }
  }, [onAddPlaylistImportTracks, playlistInput])

  const handleSelectPlaylistFile = useCallback(async (): Promise<void> => {
    try {
      const selectedPath = await window.nextdj?.selectPlaylistImportFile()

      if (selectedPath) {
        setPlaylistInput(selectedPath)
        setPlaylistStatus(null)
      }
    } catch (error) {
      setPlaylistStatus(describePlaylistImportError(error))
    }
  }, [])

  return {
    hasPlaylistImportProviders,
    isImportingPlaylist,
    playlistStatus,
    playlistInput,
    setPlaylistInput,
    handleSelectPlaylistFile,
    handlePlaylistImport
  }
}
