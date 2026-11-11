import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Overview } from './Overview'
import { ZoomWaveform } from './ZoomWaveform'

vi.mock('../../performance/visualClock', () => ({
  subscribeVisualFrame: vi.fn(() => () => undefined)
}))

describe('waveform keyboard accessibility', () => {
  it('seeks the overview in fixed and boundary steps', () => {
    const onSeek = vi.fn()
    render(
      <Overview accent="#22d3ee" duration={60} getPosition={() => 10} waveform={null} onSeek={onSeek} />
    )
    const waveform = screen.getByRole('slider', { name: 'Track overview waveform' })

    fireEvent.keyDown(waveform, { key: 'ArrowRight' })
    fireEvent.keyDown(waveform, { key: 'End' })

    expect(onSeek).toHaveBeenNthCalledWith(1, 15)
    expect(onSeek).toHaveBeenNthCalledWith(2, 60)
  })

  it('seeks the zoom waveform in beat-aware steps', () => {
    const onSeek = vi.fn()
    render(
      <ZoomWaveform
        accent="#22d3ee"
        bpm={120}
        duration={60}
        firstBeatOffset={0}
        getPosition={() => 10}
        waveform={null}
        onSeek={onSeek}
      />
    )
    const waveform = screen.getByRole('slider', { name: 'Zoomed deck waveform' })

    fireEvent.keyDown(waveform, { key: 'ArrowRight' })
    fireEvent.keyDown(waveform, { key: 'PageUp' })

    expect(onSeek).toHaveBeenNthCalledWith(1, 10.5)
    expect(onSeek).toHaveBeenNthCalledWith(2, 12)
  })
})
