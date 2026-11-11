import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { createDeckState } from './app/deckState'

vi.mock('./components/Deck/DeckPanel', () => ({
  DeckPanel: ({ deckId, onTogglePlayback }: { deckId: string; onTogglePlayback: () => void }) => (
    <section aria-label={`Deck ${deckId}`}>
      <button type="button" onClick={onTogglePlayback}>
        Toggle deck {deckId}
      </button>
    </section>
  )
}))

vi.mock('./components/Mixer/MixerPanel', () => ({
  MixerPanel: ({
    onOpenSettings,
    onOpenShortcuts
  }: {
    onOpenSettings: () => void
    onOpenShortcuts: () => void
  }) => (
    <section aria-label="Mixer">
      <button type="button" onClick={onOpenSettings}>
        Open settings
      </button>
      <button type="button" onClick={onOpenShortcuts}>
        Open shortcuts
      </button>
    </section>
  )
}))

vi.mock('./components/Library/LibraryPanel', () => ({
  LibraryPanel: ({ tracks }: { tracks: unknown[] }) => (
    <section aria-label="Library">Tracks: {tracks.length}</section>
  )
}))

vi.mock('./components/Settings/SettingsPanel', () => ({
  SettingsPanel: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <section role="dialog" aria-label="Settings">
        <button type="button" onClick={onClose}>
          Close settings
        </button>
      </section>
    ) : null
}))

const togglePlayback = vi.fn()

vi.mock('./hooks/useEngine', () => ({
  useEngine: () => ({
    engine: {
      deckA: { getPosition: () => 0 },
      deckB: { getPosition: () => 0 },
      mixer: {
        channelAAnalyser: null,
        channelBAnalyser: null
      }
    },
    decks: {
      A: createDeckState(),
      B: createDeckState()
    },
    masterDeckId: null,
    phaseOffsets: { A: 0, B: 0 },
    channels: {
      A: { trim: 1, eq: { high: 0, mid: 0, low: 0 }, volume: 1, cue: false },
      B: { trim: 1, eq: { high: 0, mid: 0, low: 0 }, volume: 1, cue: false }
    },
    mixer: { crossfade: 0, cueMix: 0, phonesVolume: 1, masterVolume: 0.9 },
    output: {
      devices: [],
      master: { activeDeviceId: 'default', requestedDeviceId: 'default', pending: false, error: null },
      cue: { activeDeviceId: 'default', requestedDeviceId: 'default', pending: false, error: null },
      deviceListError: null
    },
    loadTrack: vi.fn(),
    togglePlayback,
    seek: vi.fn(),
    setCuePoint: vi.fn(),
    cuePress: vi.fn(),
    cueRelease: vi.fn(),
    setPitch: vi.fn(),
    syncDeck: vi.fn(),
    nudgeDeck: vi.fn(),
    jogBend: vi.fn(),
    exitLoop: vi.fn(),
    setAutoLoop: vi.fn(),
    setTrim: vi.fn(),
    setEq: vi.fn(),
    setChannelVolume: vi.fn(),
    toggleCue: vi.fn(),
    setCrossfade: vi.fn(),
    setCueMix: vi.fn(),
    setPhonesVolume: vi.fn(),
    setMasterVolume: vi.fn(),
    setMasterDevice: vi.fn(),
    setCueDevice: vi.fn(),
    refreshOutputDevices: vi.fn()
  })
}))

vi.mock('./hooks/useLibrary', () => ({
  useLibrary: () => ({
    tracks: [],
    isReady: true,
    error: null,
    clearError: vi.fn(),
    addFiles: vi.fn(),
    addPlaylistImportTracks: vi.fn(),
    resolveTrackFile: vi.fn(),
    getTrack: vi.fn()
  })
}))

vi.mock('./hooks/useRecorder', () => ({
  useRecorder: () => ({ phase: 'idle' })
}))

vi.mock('./hooks/useDeckLoading', () => ({
  useDeckLoading: () => ({
    loadingDecks: { A: null, B: null },
    deckErrors: {},
    clearDeckError: vi.fn(),
    loadFileToDeck: vi.fn(),
    loadLibraryTrack: vi.fn(),
    loadLibraryTrackById: vi.fn()
  })
}))

vi.mock('./hooks/useAppShortcuts', () => ({
  useAppShortcuts: vi.fn()
}))

vi.mock('./hooks/useAppUpdate', () => ({
  useAppUpdate: () => ({
    update: null,
    openingDownload: false,
    error: null,
    dismiss: vi.fn(),
    openDownload: vi.fn()
  })
}))

describe('App', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('composes decks, mixer and library without real audio devices', () => {
    render(<App />)

    expect(screen.getByLabelText('Deck A')).toBeInTheDocument()
    expect(screen.getByLabelText('Deck B')).toBeInTheDocument()
    expect(screen.getByLabelText('Mixer')).toBeInTheDocument()
    expect(screen.getByLabelText('Library')).toHaveTextContent('Tracks: 0')
    expect(document.title).toBe('NextDJ')
  })

  it('opens and closes settings from the mixer', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }))
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }))
    expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument()
  })

  it('opens keyboard shortcuts from the mixer', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Open shortcuts' }))

    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument()
    expect(screen.getByText('Q / W')).toBeInTheDocument()
  })

  it('wires deck playback actions through the composed panels', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Toggle deck A' }))

    expect(togglePlayback).toHaveBeenCalledWith('A')
  })
})
