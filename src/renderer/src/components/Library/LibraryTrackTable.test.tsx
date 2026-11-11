import type { MutableRefObject } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { LibraryTrack } from '../../hooks/useLibrary'
import { LibraryTrackTable } from './LibraryTrackTable'

const tracks: LibraryTrack[] = [
  {
    id: 'local-1',
    title: 'Local Track',
    duration: 65,
    bpm: 124.2,
    firstBeatOffset: 0,
    source: 'local'
  },
  {
    id: 'external-1',
    title: 'Remote Track',
    artist: 'Remote Artist',
    duration: 0,
    bpm: 0,
    firstBeatOffset: 0,
    source: 'external',
    providerId: 'demo-local',
    externalRef: 'track-1'
  }
]

function renderTable(overrides: Partial<Parameters<typeof LibraryTrackTable>[0]> = {}) {
  const rowRefs: MutableRefObject<Record<string, HTMLTableRowElement | null>> = { current: {} }

  return render(
    <LibraryTrackTable
      focusedTrackId="local-1"
      keyboardLoadDeckId="B"
      rowRefs={rowRefs}
      tracks={tracks}
      onDragStart={vi.fn()}
      onFocusTrack={vi.fn()}
      onLoadTrack={vi.fn()}
      onRowKeyDown={vi.fn()}
      {...overrides}
    />
  )
}

describe('LibraryTrackTable', () => {
  it('renders track metadata and remote indicators', () => {
    renderTable()

    expect(screen.getByText('Local Track')).toBeInTheDocument()
    expect(screen.getByText('1:05')).toBeInTheDocument()
    expect(screen.getByText('124.2')).toBeInTheDocument()
    expect(screen.getByText('Remote Track')).toBeInTheDocument()
    expect(screen.getByText('Remote Artist')).toBeInTheDocument()
    expect(screen.getByLabelText('Not stored locally')).toBeInTheDocument()
  })

  it('loads tracks into explicit decks', () => {
    const onLoadTrack = vi.fn()
    renderTable({ onLoadTrack })

    fireEvent.click(screen.getAllByTitle('Load into deck A')[0])
    fireEvent.click(screen.getAllByTitle('Load into deck B')[1])

    expect(onLoadTrack).toHaveBeenNthCalledWith(1, 'A', tracks[0])
    expect(onLoadTrack).toHaveBeenNthCalledWith(2, 'B', tracks[1])
  })

  it('delegates row keyboard and focus handling', () => {
    const onFocusTrack = vi.fn()
    const onRowKeyDown = vi.fn()
    renderTable({ onFocusTrack, onRowKeyDown })

    const row = screen.getByLabelText('Local Track. Press Enter to load into deck B')
    fireEvent.focus(row)
    fireEvent.keyDown(row, { key: 'Enter' })

    expect(onFocusTrack).toHaveBeenCalledWith('local-1')
    expect(onRowKeyDown).toHaveBeenCalledWith(expect.anything(), tracks[0])
  })

  it('announces when automatic keyboard loading is locked', () => {
    renderTable({ keyboardLoadDeckId: null })

    expect(
      screen.getByLabelText('Local Track. Enter loading is locked until a deck is safely off-air')
    ).toBeInTheDocument()
  })
})
