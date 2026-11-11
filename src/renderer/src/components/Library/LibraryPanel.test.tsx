import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LibraryTrack } from '../../hooks/useLibrary'
import { LibraryPanel } from './LibraryPanel'

const tracks: LibraryTrack[] = [
  {
    id: 'track-a',
    title: 'First Track',
    duration: 75,
    bpm: 124,
    firstBeatOffset: 0,
    source: 'local'
  },
  {
    id: 'track-b',
    title: 'Second Track',
    duration: 90,
    bpm: 126,
    firstBeatOffset: 0.2,
    source: 'local'
  }
]

function renderPanel(overrides: Partial<Parameters<typeof LibraryPanel>[0]> = {}) {
  return render(
    <LibraryPanel
      keyboardLoadDeckId="A"
      tracks={tracks}
      error={null}
      onAddFiles={vi.fn().mockResolvedValue([])}
      onAddPlaylistImportTracks={vi.fn().mockResolvedValue([])}
      onDismissError={vi.fn()}
      onLoadTrack={vi.fn().mockResolvedValue(undefined)}
      {...overrides}
    />
  )
}

describe('LibraryPanel', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    delete window.nextdj
    localStorage.clear()
  })

  it('loads focused tracks from the expanded crate keyboard flow', async () => {
    const onLoadTrack = vi.fn().mockResolvedValue(undefined)
    renderPanel({ keyboardLoadDeckId: 'B', onLoadTrack })

    fireEvent.click(screen.getByRole('button', { name: 'Expand crate' }))

    const firstRow = await screen.findByLabelText('First Track. Press Enter to load into deck B')
    fireEvent.keyDown(firstRow, { key: 'ArrowDown' })
    fireEvent.keyDown(screen.getByLabelText('Second Track. Press Enter to load into deck B'), { key: 'Enter' })

    expect(onLoadTrack).toHaveBeenCalledWith('B', tracks[1])
    expect(screen.getByRole('button', { name: 'Expand crate' })).toBeInTheDocument()
  })

  it('blocks Enter when neither deck is a safe automatic target', async () => {
    const onLoadTrack = vi.fn().mockResolvedValue(undefined)
    renderPanel({ keyboardLoadDeckId: null, onLoadTrack })

    expect(screen.getByText('Enter locked')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Expand crate' }))
    const firstRow = await screen.findByLabelText(
      'First Track. Enter loading is locked until a deck is safely off-air'
    )
    fireEvent.keyDown(firstRow, { key: 'Enter' })

    expect(onLoadTrack).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent(
      'No safe deck is available. Move the crossfader, stop a deck, or wait for loading to finish.'
    )
  })

  it('adds files from the hidden file input and drop target', () => {
    const onAddFiles = vi.fn().mockResolvedValue([])
    const { container } = renderPanel({ onAddFiles })
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['audio'], 'set.wav', { type: 'audio/wav' })

    fireEvent.change(input, { target: { files: [file] } })

    expect(onAddFiles).toHaveBeenCalledWith([file])

    const droppedFiles = [new File(['more-audio'], 'drop.wav', { type: 'audio/wav' })]
    fireEvent.drop(container.querySelector('.library-panel') as HTMLElement, {
      dataTransfer: { files: droppedFiles }
    })

    expect(onAddFiles).toHaveBeenLastCalledWith(droppedFiles)
  })

  it('imports external playlists through the desktop bridge', async () => {
    const onAddPlaylistImportTracks = vi.fn().mockResolvedValue([])
    const importTracks = [
      {
        providerId: 'demo-local',
        id: 'abc',
        title: 'Playlist Track',
        artist: 'Playlist Artist',
        duration: 180,
        externalRef: 'abc'
      }
    ]

    window.nextdj = {
      appName: 'NextDJ',
      checkForUpdate: vi.fn(),
      openUpdateDownload: vi.fn(),
      selectPlaylistImportFile: vi.fn(),
      listPlaylistImportProviders: vi.fn().mockResolvedValue([{ id: 'demo-local', displayName: 'Demo Local' }]),
      listPlaylistImportTracks: vi.fn().mockResolvedValue(importTracks),
      resolvePlaylistImportTrack: vi.fn(),
      startRecording: vi.fn(),
      appendRecordingChunk: vi.fn(),
      stopRecording: vi.fn(),
      cancelRecording: vi.fn(),
      revealRecording: vi.fn(),
      onRecordingWriteError: vi.fn()
    }

    renderPanel({ onAddPlaylistImportTracks })

    fireEvent.click(await screen.findByRole('button', { name: 'Import playlist' }))
    fireEvent.change(screen.getByLabelText('Playlist URL'), {
      target: { value: 'demo:playlist' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))

    await waitFor(() => expect(window.nextdj?.listPlaylistImportTracks).toHaveBeenCalledWith('demo:playlist'))
    expect(onAddPlaylistImportTracks).toHaveBeenCalledWith(importTracks)
    expect(await screen.findByText('Listed 1 track. Downloads happen on load.')).toBeInTheDocument()
  })

  it('shows a clean missing playlist dependency error', async () => {
    const onAddPlaylistImportTracks = vi.fn().mockResolvedValue([])
    window.nextdj = {
      appName: 'NextDJ',
      checkForUpdate: vi.fn(),
      openUpdateDownload: vi.fn(),
      selectPlaylistImportFile: vi.fn(),
      listPlaylistImportProviders: vi.fn().mockResolvedValue([{ id: 'youtube', displayName: 'YouTube' }]),
      listPlaylistImportTracks: vi.fn().mockRejectedValue(
        new Error(
          "Error invoking remote method 'playlist-import:list-tracks': Error: Playlist provider dependency \"yt-dlp\" was not found. Install it or configure the provider."
        )
      ),
      resolvePlaylistImportTrack: vi.fn(),
      startRecording: vi.fn(),
      appendRecordingChunk: vi.fn(),
      stopRecording: vi.fn(),
      cancelRecording: vi.fn(),
      revealRecording: vi.fn(),
      onRecordingWriteError: vi.fn()
    }

    renderPanel({ onAddPlaylistImportTracks })

    fireEvent.click(await screen.findByRole('button', { name: 'Import playlist' }))
    fireEvent.change(screen.getByLabelText('Playlist URL'), {
      target: { value: 'https://www.youtube.com/playlist?list=fixture' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))

    expect(
      await screen.findByText(
        'Playlist provider dependency "yt-dlp" was not found. Install it or configure the provider.'
      )
    ).toBeInTheDocument()
    expect(screen.queryByText(/Error invoking remote method/)).not.toBeInTheDocument()
    expect(onAddPlaylistImportTracks).not.toHaveBeenCalled()
  })

  it('shows and dismisses recoverable library errors', () => {
    const onDismissError = vi.fn()
    renderPanel({ error: 'Recovered one invalid track.', onDismissError })

    expect(screen.getByRole('alert')).toHaveTextContent('Recovered one invalid track.')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss library error' }))
    expect(onDismissError).toHaveBeenCalledTimes(1)
  })

  it('persists collapsed state without hiding controls permanently', () => {
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: 'Hide crate' }))

    expect(localStorage.getItem('nextdj.library.collapsed')).toBe('1')
    expect(screen.queryByText('First Track')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show crate' }))

    expect(localStorage.getItem('nextdj.library.collapsed')).toBe('0')
    expect(screen.getByText('First Track')).toBeInTheDocument()
  })

  it('windows large libraries and provides accessible page navigation', () => {
    const largeLibrary = Array.from({ length: 450 }, (_, index): LibraryTrack => ({
      id: `track-${index + 1}`,
      title: `Track ${index + 1}`,
      duration: 60,
      bpm: 120,
      firstBeatOffset: 0,
      source: 'local'
    }))

    renderPanel({ tracks: largeLibrary })

    expect(screen.getByText('Track 1')).toBeInTheDocument()
    expect(screen.queryByText('Track 201')).not.toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(201)

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    expect(screen.getByText('Track 201')).toBeInTheDocument()
    expect(screen.getByText('Tracks 201–400 of 450')).toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(201)
  })
})
