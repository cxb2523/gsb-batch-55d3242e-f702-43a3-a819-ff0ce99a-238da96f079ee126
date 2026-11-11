import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, Link, Maximize2, Minimize2, Music, Plus, X } from 'lucide-react'
import type { DeckId } from '../../app/engineTypes'
import type { LibraryTrack } from '../../hooks/useLibrary'
import { LibraryTrackTable } from './LibraryTrackTable'
import { PlaylistImportForm } from './PlaylistImportForm'
import { createTrackIdIndex, isEditableTarget } from './libraryPanelUtils'
import { usePlaylistImport } from './usePlaylistImport'

interface LibraryPanelProps {
  tracks: LibraryTrack[]
  error: string | null
  keyboardLoadDeckId: DeckId | null
  onAddFiles: (files: File[] | FileList) => Promise<LibraryTrack[]>
  onAddPlaylistImportTracks: (importTracks: PlaylistImportTrack[]) => Promise<LibraryTrack[]>
  onDismissError: () => void
  onLoadTrack: (deckId: DeckId, track: LibraryTrack) => Promise<void>
}

const COLLAPSED_KEY = 'nextdj.library.collapsed'

export const LibraryPanel = memo(function LibraryPanel({
  tracks,
  error,
  keyboardLoadDeckId,
  onAddFiles,
  onAddPlaylistImportTracks,
  onDismissError,
  onLoadTrack
}: LibraryPanelProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({})
  const [isDropTarget, setIsDropTarget] = useState(false)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSED_KEY) === '1')
  const [expanded, setExpanded] = useState(false)
  const [focusedTrackId, setFocusedTrackId] = useState<string | null>(null)
  const [keyboardLoadWarning, setKeyboardLoadWarning] = useState(false)
  const [playlistImportOpen, setPlaylistImportOpen] = useState(false)
  const {
    handlePlaylistImport,
    handleSelectPlaylistFile,
    hasPlaylistImportProviders,
    isImportingPlaylist,
    playlistInput,
    playlistStatus,
    setPlaylistInput
  } = usePlaylistImport({
    onAddPlaylistImportTracks
  })
  const trackIdIndex = useMemo(() => createTrackIdIndex(tracks), [tracks])
  const firstTrackId = tracks[0]?.id ?? null

  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0')
  }, [collapsed])

  useEffect(() => {
    if (keyboardLoadDeckId) {
      setKeyboardLoadWarning(false)
    }
  }, [keyboardLoadDeckId])

  const toggleExpanded = useCallback((): void => {
    setExpanded((current) => {
      const nextExpanded = !current

      if (nextExpanded) {
        setCollapsed(false)
      }

      return nextExpanded
    })
  }, [])

  useEffect(() => {
    setFocusedTrackId((current) => {
      return current && trackIdIndex.has(current) ? current : firstTrackId
    })
  }, [firstTrackId, trackIdIndex])

  useEffect(() => {
    if (!expanded || tracks.length === 0) {
      return
    }

    const nextFocusedTrackId = focusedTrackId && trackIdIndex.has(focusedTrackId) ? focusedTrackId : firstTrackId

    if (!nextFocusedTrackId) {
      return
    }

    if (nextFocusedTrackId !== focusedTrackId) {
      setFocusedTrackId(nextFocusedTrackId)
    }

    window.requestAnimationFrame(() => {
      rowRefs.current[nextFocusedTrackId]?.focus()
    })
  }, [expanded, firstTrackId, focusedTrackId, trackIdIndex, tracks.length])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (isEditableTarget(event.target) || event.repeat) {
        return
      }

      if (event.code === 'KeyK') {
        event.preventDefault()
        toggleExpanded()
        return
      }

      if (expanded && event.key === 'Escape') {
        event.preventDefault()
        setExpanded(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [expanded, toggleExpanded])

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>): void => {
      const files = event.currentTarget.files

      if (files) {
        void onAddFiles(files).catch(() => undefined)
      }

      event.currentTarget.value = ''
    },
    [onAddFiles]
  )

  const focusTrackAtIndex = useCallback(
    (index: number): void => {
      const track = tracks[index]

      if (!track) {
        return
      }

      setFocusedTrackId(track.id)
      rowRefs.current[track.id]?.focus()
    },
    [tracks]
  )

  const loadTrackFromKeyboard = useCallback(
    (track: LibraryTrack): void => {
      if (!keyboardLoadDeckId) {
        setKeyboardLoadWarning(true)
        return
      }

      setKeyboardLoadWarning(false)
      setExpanded(false)
      void onLoadTrack(keyboardLoadDeckId, track)
    },
    [keyboardLoadDeckId, onLoadTrack]
  )

  const loadTrackExplicitly = useCallback(
    (deckId: DeckId, track: LibraryTrack): void => {
      setKeyboardLoadWarning(false)
      void onLoadTrack(deckId, track)
    },
    [onLoadTrack]
  )

  const handleRowKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTableRowElement>, track: LibraryTrack): void => {
      if (event.target !== event.currentTarget) {
        return
      }

      const currentIndex = trackIdIndex.get(track.id) ?? -1

      if (currentIndex < 0) {
        return
      }

      if (event.key === 'Enter') {
        event.preventDefault()
        loadTrackFromKeyboard(track)
        return
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        focusTrackAtIndex(Math.min(tracks.length - 1, currentIndex + 1))
        return
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault()
        focusTrackAtIndex(Math.max(0, currentIndex - 1))
        return
      }

      if (event.key === 'Home') {
        event.preventDefault()
        focusTrackAtIndex(0)
        return
      }

      if (event.key === 'End') {
        event.preventDefault()
        focusTrackAtIndex(tracks.length - 1)
      }
    },
    [focusTrackAtIndex, loadTrackFromKeyboard, trackIdIndex, tracks.length]
  )

  const handleDragStart = useCallback(
    (event: React.DragEvent<HTMLTableRowElement>, trackId: string): void => {
      event.dataTransfer.effectAllowed = 'copy'
      event.dataTransfer.setData('text/plain', trackId)
    },
    []
  )

  const handleDragOver = useCallback((event: React.DragEvent<HTMLElement>): void => {
    if (event.dataTransfer.types.includes('Files')) {
      event.preventDefault()
      setIsDropTarget(true)
    }
  }, [])

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLElement>): void => {
      event.preventDefault()
      setIsDropTarget(false)

      if (event.dataTransfer.files.length > 0) {
        void onAddFiles(event.dataTransfer.files).catch(() => undefined)
      }
    },
    [onAddFiles]
  )

  const handleCollapsedToggle = useCallback((): void => {
    setExpanded(false)
    setCollapsed((current) => !current)
  }, [])

  return (
    <section
      className={`console-panel library-panel ${collapsed ? 'library-collapsed' : ''} ${expanded ? 'library-expanded' : ''} ${isDropTarget ? 'library-panel-drop-target' : ''}`}
      onDragLeave={() => setIsDropTarget(false)}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="library-header">
        <div className="library-title">
          <Music size={13} strokeWidth={2.4} />
          <span>Crate</span>
          <span
            aria-live="polite"
            className={`library-keyboard-target ${keyboardLoadDeckId ? `library-keyboard-target-${keyboardLoadDeckId.toLowerCase()}` : 'library-keyboard-target-blocked'}`}
            title={
              keyboardLoadDeckId
                ? `Enter loads into deck ${keyboardLoadDeckId}`
                : 'Enter is locked until a deck is safely off-air'
            }
          >
            Enter {keyboardLoadDeckId ? `→ ${keyboardLoadDeckId}` : 'locked'}
          </span>
        </div>
        <div className="library-actions">
          {hasPlaylistImportProviders ? (
            <button
              aria-label="Import playlist"
              className={`icon-button ${playlistImportOpen ? 'icon-button-active' : ''}`}
              title="Import playlist"
              type="button"
              onClick={() => setPlaylistImportOpen((current) => !current)}
            >
              <Link size={15} strokeWidth={2.4} />
            </button>
          ) : null}
          <button
            aria-label="Add tracks"
            className="icon-button"
            title="Add tracks"
            type="button"
            onClick={() => inputRef.current?.click()}
          >
            <Plus size={15} strokeWidth={2.4} />
          </button>
          <button
            aria-label={expanded ? 'Shrink crate' : 'Expand crate'}
            className={`icon-button ${expanded ? 'icon-button-active' : ''}`}
            title={expanded ? 'Shrink crate (K)' : 'Expand crate (K)'}
            type="button"
            onClick={toggleExpanded}
          >
            {expanded ? <Minimize2 size={15} strokeWidth={2.4} /> : <Maximize2 size={15} strokeWidth={2.4} />}
          </button>
          <button
            aria-label={collapsed ? 'Show crate' : 'Hide crate'}
            className="icon-button"
            title={collapsed ? 'Show crate' : 'Hide crate'}
            type="button"
            onClick={handleCollapsedToggle}
          >
            {collapsed ? <ChevronUp size={15} strokeWidth={2.4} /> : <ChevronDown size={15} strokeWidth={2.4} />}
          </button>
        </div>
        <input
          ref={inputRef}
          multiple
          accept="audio/*"
          className="sr-only"
          type="file"
          onChange={handleFileChange}
        />
      </div>

      {collapsed ? null : (
        <>
          {playlistImportOpen && hasPlaylistImportProviders ? (
            <PlaylistImportForm
              disabled={isImportingPlaylist}
              input={playlistInput}
              status={playlistStatus}
              onInputChange={setPlaylistInput}
              onSelectFile={() => void handleSelectPlaylistFile()}
              onSubmit={() => void handlePlaylistImport()}
            />
          ) : null}

          {error ? (
            <div className="library-error" role="alert">
              <AlertTriangle aria-hidden="true" size={14} />
              <span>{error}</span>
              <button aria-label="Dismiss library error" type="button" onClick={onDismissError}>
                <X aria-hidden="true" size={13} />
              </button>
            </div>
          ) : null}

          {keyboardLoadWarning ? (
            <div className="library-load-warning" role="status">
              <AlertTriangle aria-hidden="true" size={14} />
              <span>No safe deck is available. Move the crossfader, stop a deck, or wait for loading to finish.</span>
            </div>
          ) : null}

          <div className="library-table-wrap">
            {tracks.length === 0 ? (
              <div className="library-empty">
                <Music size={22} strokeWidth={1.6} />
                <p>Drop audio here or add tracks to build your crate.</p>
              </div>
            ) : (
              <LibraryTrackTable
                focusedTrackId={focusedTrackId}
                keyboardLoadDeckId={keyboardLoadDeckId}
                rowRefs={rowRefs}
                tracks={tracks}
                onDragStart={handleDragStart}
                onFocusTrack={setFocusedTrackId}
                onLoadTrack={loadTrackExplicitly}
                onRowKeyDown={handleRowKeyDown}
              />
            )}
          </div>
        </>
      )}
    </section>
  )
})
