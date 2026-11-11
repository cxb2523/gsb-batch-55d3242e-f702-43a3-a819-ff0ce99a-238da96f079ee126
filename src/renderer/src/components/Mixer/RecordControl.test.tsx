import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { RecorderState } from '../../hooks/useRecorder'
import { RecordControl } from './RecordControl'

function createRecorder(overrides: Partial<RecorderState> = {}): RecorderState {
  return {
    phase: 'idle',
    mode: null,
    elapsedMs: 0,
    countdownRemaining: null,
    warning: null,
    error: null,
    filePath: null,
    start: vi.fn(),
    stop: vi.fn(),
    reveal: vi.fn(),
    dismiss: vi.fn(),
    ...overrides
  }
}

describe('RecordControl', () => {
  it('opens the mode menu and starts the selected recording mode', () => {
    const recorder = createRecorder()

    render(<RecordControl recorder={recorder} />)

    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Audio \+ Screen \+ Cam/ }))

    expect(recorder.dismiss).toHaveBeenCalled()
    expect(recorder.start).toHaveBeenCalledWith('audio-screen-camera')
  })

  it('cancels countdown recordings via the countdown button', () => {
    const recorder = createRecorder({ phase: 'countdown', countdownRemaining: 3 })

    render(<RecordControl recorder={recorder} />)

    expect(screen.getByText('REC IN')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel recording countdown' }))

    expect(recorder.stop).toHaveBeenCalled()
  })

  it('shows elapsed time and warnings while recording', () => {
    const recorder = createRecorder({
      phase: 'recording',
      elapsedMs: 65_250,
      warning: 'Screen capture ended soon.'
    })

    render(<RecordControl recorder={recorder} />)

    expect(screen.getByText('1:05')).toBeInTheDocument()
    expect(screen.getByText('Screen capture ended soon.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }))
    expect(recorder.stop).toHaveBeenCalled()
  })

  it('reveals saved recordings', () => {
    const recorder = createRecorder({ phase: 'saved', filePath: '/tmp/set.mp4' })

    render(<RecordControl recorder={recorder} />)

    fireEvent.click(screen.getByRole('button', { name: 'Recording saved, show in Finder' }))
    expect(recorder.reveal).toHaveBeenCalled()
  })

  it('shows errors and dismisses before reopening the menu', () => {
    const recorder = createRecorder({ phase: 'error', error: 'Disk is full.' })

    render(<RecordControl recorder={recorder} />)

    expect(screen.getByText('Disk is full.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }))

    expect(recorder.dismiss).toHaveBeenCalled()
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })
})
