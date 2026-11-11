import { useMemo, useState, type MutableRefObject } from 'react'
import { Cloud } from 'lucide-react'
import type { DeckId } from '../../app/engineTypes'
import type { LibraryTrack } from '../../hooks/useLibrary'
import { formatBpm, formatTime } from './libraryPanelUtils'

interface LibraryTrackTableProps {
  focusedTrackId: string | null
  keyboardLoadDeckId: DeckId | null
  rowRefs: MutableRefObject<Record<string, HTMLTableRowElement | null>>
  tracks: LibraryTrack[]
  onDragStart: (event: React.DragEvent<HTMLTableRowElement>, trackId: string) => void
  onFocusTrack: (trackId: string) => void
  onLoadTrack: (deckId: DeckId, track: LibraryTrack) => void
  onRowKeyDown: (event: React.KeyboardEvent<HTMLTableRowElement>, track: LibraryTrack) => void
}

const TRACK_WINDOW_SIZE = 200

export function LibraryTrackTable({
  focusedTrackId,
  keyboardLoadDeckId,
  rowRefs,
  tracks,
  onDragStart,
  onFocusTrack,
  onLoadTrack,
  onRowKeyDown
}: LibraryTrackTableProps): JSX.Element {
  const [requestedStart, setRequestedStart] = useState(0)
  const focusedIndex = focusedTrackId ? tracks.findIndex((track) => track.id === focusedTrackId) : -1
  const focusedStart =
    focusedIndex >= 0 && (focusedIndex < requestedStart || focusedIndex >= requestedStart + TRACK_WINDOW_SIZE)
      ? Math.floor(focusedIndex / TRACK_WINDOW_SIZE) * TRACK_WINDOW_SIZE
      : requestedStart
  const maximumStart = Math.max(0, Math.floor((tracks.length - 1) / TRACK_WINDOW_SIZE) * TRACK_WINDOW_SIZE)
  const windowStart = Math.min(focusedStart, maximumStart)
  const visibleTracks = useMemo(
    () => tracks.slice(windowStart, windowStart + TRACK_WINDOW_SIZE),
    [tracks, windowStart]
  )
  const windowEnd = Math.min(tracks.length, windowStart + visibleTracks.length)
  const moveWindow = (nextStart: number): void => {
    setRequestedStart(nextStart)

    const nextTrack = tracks[nextStart]
    if (nextTrack) {
      onFocusTrack(nextTrack.id)
    }
  }

  return (
    <>
      <table className="library-table">
        <thead>
          <tr>
            <th>Title</th>
            <th className="library-col-artist">Artist</th>
            <th className="library-col-time">Time</th>
            <th className="library-col-bpm">BPM</th>
            <th className="library-col-load" aria-label="Load controls" />
          </tr>
        </thead>
        <tbody>
          {visibleTracks.map((track) => (
            <tr
              ref={(element) => {
                rowRefs.current[track.id] = element
              }}
              key={track.id}
              aria-label={
                keyboardLoadDeckId
                  ? `${track.title}. Press Enter to load into deck ${keyboardLoadDeckId}`
                  : `${track.title}. Enter loading is locked until a deck is safely off-air`
              }
              draggable
              tabIndex={focusedTrackId === track.id ? 0 : -1}
              onDragStart={(event) => onDragStart(event, track.id)}
              onFocus={() => onFocusTrack(track.id)}
              onKeyDown={(event) => onRowKeyDown(event, track)}
            >
              <td>
                <span className="library-track-title" title={track.title}>
                  <span className="library-track-title-text">{track.title}</span>
                  {track.source === 'external' && !track.file ? (
                    <span aria-label="Not stored locally" className="library-track-remote" title="Not stored locally">
                      <Cloud aria-hidden="true" size={13} strokeWidth={2.3} />
                    </span>
                  ) : null}
                </span>
              </td>
              <td className="library-col-artist" title={track.artist}>
                {track.artist ?? '—'}
              </td>
              <td className="library-col-time">{formatTime(track.duration)}</td>
              <td className="library-col-bpm">{formatBpm(track.bpm)}</td>
              <td className="library-col-load">
                <div className="library-load-chips">
                  <button
                    className="load-chip load-chip-a"
                    title="Load into deck A"
                    type="button"
                    onClick={() => onLoadTrack('A', track)}
                  >
                    A
                  </button>
                  <button
                    className="load-chip load-chip-b"
                    title="Load into deck B"
                    type="button"
                    onClick={() => onLoadTrack('B', track)}
                  >
                    B
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {tracks.length > TRACK_WINDOW_SIZE ? (
        <nav aria-label="Library track pages" className="library-window-controls">
          <button
            disabled={windowStart === 0}
            type="button"
            onClick={() => moveWindow(Math.max(0, windowStart - TRACK_WINDOW_SIZE))}
          >
            Previous
          </button>
          <span aria-live="polite">
            Tracks {windowStart + 1}–{windowEnd} of {tracks.length}
          </span>
          <button
            disabled={windowEnd >= tracks.length}
            type="button"
            onClick={() => moveWindow(Math.min(maximumStart, windowStart + TRACK_WINDOW_SIZE))}
          >
            Next
          </button>
        </nav>
      ) : null}
    </>
  )
}
