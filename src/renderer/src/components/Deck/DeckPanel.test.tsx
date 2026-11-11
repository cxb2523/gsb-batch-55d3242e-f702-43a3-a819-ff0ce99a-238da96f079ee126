import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LoopState } from '../../audio/deckTypes'
import { DeckPanel } from './DeckPanel'

vi.mock('../Waveform/Overview', () => ({
  Overview: ({ onSeek }: { onSeek: (seconds: number) => void }) => (
    <button type="button" onClick={() => onSeek(12)}>
      Overview mock
    </button>
  )
}))

vi.mock('../Waveform/ZoomWaveform', () => ({
  ZoomWaveform: ({ onSeek }: { onSeek: (seconds: number) => void }) => (
    <button type="button" onClick={() => onSeek(24)}>
      Zoom mock
    </button>
  )
}))

vi.mock('../controls/JogWheel', () => ({
  JogWheel: ({ label, onBend, onScratchEnd, onScratchStart, onScrub, onSeek }: { label: string; onBend: (degrees: number) => void; onScratchEnd: () => void; onScratchStart: () => number; onScrub: (seconds: number, direction: -1 | 1) => void; onSeek: (seconds: number) => void }) => (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        onScratchStart()
        onBend(3)
        onScrub(29, -1)
        onScratchEnd()
        onSeek(30)
      }}
    >
      Jog mock
    </button>
  )
}))

const inactiveLoop: LoopState = { start: null, end: null, active: false }
const activeLoop: LoopState = { start: 8, end: 16, active: true }

function renderDeck(overrides: Partial<Parameters<typeof DeckPanel>[0]> = {}) {
  return render(
    <DeckPanel
      accent="#22d3ee"
      bpm={124}
      deckId="A"
      duration={180}
      effectiveBpm={124}
      firstBeatOffset={0.1}
      getPosition={() => 42}
      isLoading={false}
      isPlaying={false}
      loop={inactiveLoop}
      masterDeckId="B"
      masterEffectiveBpm={126}
      phaseOffset={0.02}
      pitch={0}
      position={45}
      trackName="Loaded Track"
      waveform={null}
      onAutoLoop={vi.fn()}
      onCueDown={vi.fn().mockResolvedValue(undefined)}
      onCueSet={vi.fn()}
      onCueUp={vi.fn()}
      onJogBend={vi.fn()}
      onJogScratchEnd={vi.fn()}
      onJogScratchStart={vi.fn(() => 45)}
      onJogScrub={vi.fn()}
      onLoad={vi.fn().mockResolvedValue(undefined)}
      onLoopExit={vi.fn()}
      onNudge={vi.fn()}
      onPitchChange={vi.fn()}
      onSeek={vi.fn()}
      onSync={vi.fn()}
      onTogglePlayback={vi.fn().mockResolvedValue(undefined)}
      onTrackDrop={vi.fn().mockResolvedValue(undefined)}
      {...overrides}
    />
  )
}

describe('DeckPanel', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders loaded transport state and dispatches transport actions', () => {
    const onTogglePlayback = vi.fn().mockResolvedValue(undefined)
    const onSync = vi.fn()
    const onAutoLoop = vi.fn()
    const onNudge = vi.fn()

    renderDeck({ onAutoLoop, onNudge, onSync, onTogglePlayback })

    expect(screen.getByText('Loaded Track')).toBeInTheDocument()
    expect(screen.getByText('124.0 BPM')).toBeInTheDocument()
    expect(screen.getByText('FOLLOW')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    fireEvent.click(screen.getByText('SYNC'))
    fireEvent.click(screen.getByRole('button', { name: 'Nudge backward' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start 8-beat loop' }))

    expect(onTogglePlayback).toHaveBeenCalledTimes(1)
    expect(onSync).toHaveBeenCalledTimes(1)
    expect(onNudge).toHaveBeenCalledWith(-1)
    expect(onAutoLoop).toHaveBeenCalledWith(8)
  })

  it('shows track artwork in the deck display when available', () => {
    renderDeck({ artworkUrl: 'https://example.com/cover.jpg' })

    expect(document.querySelector('.deck-artwork-image')).toHaveAttribute('src', 'https://example.com/cover.jpg')
  })

  it('loads files and tracks dropped onto the deck without a visible file picker', () => {
    const onLoad = vi.fn().mockResolvedValue(undefined)
    const onTrackDrop = vi.fn().mockResolvedValue(undefined)
    const { container } = renderDeck({ onLoad, onTrackDrop })
    const file = new File(['audio'], 'track.wav', { type: 'audio/wav' })

    fireEvent.drop(container.querySelector('.deck-panel') as HTMLElement, {
      dataTransfer: {
        files: [file],
        getData: () => ''
      }
    })
    fireEvent.drop(container.querySelector('.deck-panel') as HTMLElement, {
      dataTransfer: {
        files: [],
        getData: () => 'track-a'
      }
    })

    expect(onLoad).toHaveBeenCalledWith(file)
    expect(onTrackDrop).toHaveBeenCalledWith('track-a')
    expect(container.querySelector('input[type="file"]')).not.toBeInTheDocument()
  })

  it('shows loading and empty states with disabled controls', () => {
    renderDeck({
      duration: 0,
      isLoading: true,
      loadingMessage: 'Analyzing audio...',
      masterDeckId: null,
      trackName: 'No track loaded'
    })

    expect(screen.getByRole('status')).toHaveTextContent('Analyzing audio...')
    expect(screen.getByText('No track loaded')).toBeInTheDocument()
    expect(screen.getByText('EMPTY')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled()
  })

  it('shows dismissible deck loading errors', () => {
    const onDismissError = vi.fn()
    renderDeck({ errorMessage: 'Decoder rejected this file.', onDismissError })

    expect(screen.getByRole('alert')).toHaveTextContent('Decoder rejected this file.')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss deck A error' }))
    expect(onDismissError).toHaveBeenCalledTimes(1)
  })

  it('routes seek, jog and active loop controls', () => {
    const onJogBend = vi.fn()
    const onJogScratchEnd = vi.fn()
    const onJogScratchStart = vi.fn(() => 45)
    const onJogScrub = vi.fn()
    const onLoopExit = vi.fn()
    const onSeek = vi.fn()

    renderDeck({
      isPlaying: true,
      loop: activeLoop,
      onJogBend,
      onJogScratchEnd,
      onJogScratchStart,
      onJogScrub,
      onLoopExit,
      onSeek
    })

    fireEvent.click(screen.getByRole('button', { name: 'Deck A jog wheel' }))
    fireEvent.click(screen.getByText('Overview mock'))
    fireEvent.click(screen.getByRole('button', { name: 'Exit loop' }))

    expect(onJogBend).toHaveBeenCalledWith(3)
    expect(onJogScratchStart).toHaveBeenCalledTimes(1)
    expect(onJogScrub).toHaveBeenCalledWith(29, -1)
    expect(onJogScratchEnd).toHaveBeenCalledTimes(1)
    expect(onSeek).toHaveBeenCalledWith(30)
    expect(onSeek).toHaveBeenCalledWith(12)
    expect(onLoopExit).toHaveBeenCalledTimes(1)
  })

  it('supports momentary CUE from keyboard press through release', () => {
    const onCueDown = vi.fn().mockResolvedValue(undefined)
    const onCueUp = vi.fn()
    renderDeck({ onCueDown, onCueUp })
    const cue = screen.getByRole('button', { name: 'Cue' })

    fireEvent.keyDown(cue, { key: ' ' })
    fireEvent.keyDown(cue, { key: ' ', repeat: true })
    fireEvent.keyUp(cue, { key: ' ' })

    expect(onCueDown).toHaveBeenCalledTimes(1)
    expect(onCueUp).toHaveBeenCalledTimes(1)
  })

  it('sets CUE without previewing on a short pointer click', () => {
    const onCueDown = vi.fn().mockResolvedValue(undefined)
    const onCueSet = vi.fn()
    const onCueUp = vi.fn()
    renderDeck({ onCueDown, onCueSet, onCueUp })
    const cue = screen.getByRole('button', { name: 'Cue' })

    Object.assign(cue, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => true),
      releasePointerCapture: vi.fn()
    })
    fireEvent.pointerDown(cue, { pointerId: 1, pointerType: 'mouse', button: 0 })
    fireEvent.pointerUp(cue, { pointerId: 1, pointerType: 'mouse', button: 0 })

    expect(onCueSet).toHaveBeenCalledTimes(1)
    expect(onCueDown).not.toHaveBeenCalled()
    expect(onCueUp).not.toHaveBeenCalled()
    expect(cue).toHaveClass('led-button-flash')
  })

  it('previews CUE only after a sustained pointer press', () => {
    vi.useFakeTimers()
    const onCueDown = vi.fn().mockResolvedValue(undefined)
    const onCueSet = vi.fn()
    const onCueUp = vi.fn()
    renderDeck({ onCueDown, onCueSet, onCueUp })
    const cue = screen.getByRole('button', { name: 'Cue' })

    Object.assign(cue, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => true),
      releasePointerCapture: vi.fn()
    })
    fireEvent.pointerDown(cue, { pointerId: 1, pointerType: 'mouse', button: 0 })
    vi.advanceTimersByTime(200)

    expect(onCueSet).toHaveBeenCalledTimes(1)
    expect(onCueDown).toHaveBeenCalledTimes(1)

    fireEvent.pointerUp(cue, { pointerId: 1, pointerType: 'mouse', button: 0 })
    expect(onCueUp).toHaveBeenCalledTimes(1)
  })

  it('ends CUE preview if pointer capture is lost', () => {
    vi.useFakeTimers()
    const onCueUp = vi.fn()
    renderDeck({ onCueSet: vi.fn(), onCueDown: vi.fn().mockResolvedValue(undefined), onCueUp })
    const cue = screen.getByRole('button', { name: 'Cue' })

    Object.assign(cue, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => false),
      releasePointerCapture: vi.fn()
    })
    fireEvent.pointerDown(cue, { pointerId: 1, pointerType: 'mouse', button: 0 })
    vi.advanceTimersByTime(200)
    fireEvent.lostPointerCapture(cue, { pointerId: 1 })

    expect(onCueUp).toHaveBeenCalledTimes(1)
  })

  it('returns to CUE immediately when clicked during playback', () => {
    const onCueDown = vi.fn().mockResolvedValue(undefined)
    const onCueSet = vi.fn()
    const onCueUp = vi.fn()
    renderDeck({ isPlaying: true, onCueDown, onCueSet, onCueUp })
    const cue = screen.getByRole('button', { name: 'Cue' })

    Object.assign(cue, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => true),
      releasePointerCapture: vi.fn()
    })
    fireEvent.pointerDown(cue, { pointerId: 1, pointerType: 'mouse', button: 0 })
    fireEvent.pointerUp(cue, { pointerId: 1, pointerType: 'mouse', button: 0 })

    expect(onCueDown).toHaveBeenCalledTimes(1)
    expect(onCueSet).not.toHaveBeenCalled()
    expect(onCueUp).not.toHaveBeenCalled()
  })
})
