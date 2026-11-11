import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { JogWheel } from './JogWheel'
import {
  getJogAngleDelta,
  getJogInteractionMode,
  getJogProgressDegrees,
  getJogScrubPosition,
  getJogSeekPosition
} from './jogWheelMath'

describe('JogWheel helpers', () => {
  it('wraps angle deltas across the 180 degree boundary', () => {
    expect(getJogAngleDelta(170, -170)).toBe(20)
    expect(getJogAngleDelta(-170, 170)).toBe(-20)
    expect(getJogAngleDelta(10, 30)).toBe(20)
  })

  it('calculates stopped-deck seek positions from jog deltas', () => {
    expect(getJogSeekPosition(10, 90, 60)).toBe(11)
    expect(getJogSeekPosition(0, -90, 60)).toBe(0)
    expect(getJogSeekPosition(59, 360, 60)).toBe(60)
  })

  it('uses finer movement on the platter and distinguishes it from the rim', () => {
    const rect = { top: 0, height: 100, left: 0, width: 100 }

    expect(getJogScrubPosition(10, 100, 60)).toBe(10.5)
    expect(getJogInteractionMode(50, 50, rect)).toBe('platter')
    expect(getJogInteractionMode(98, 50, rect)).toBe('rim')
  })

  it('calculates clamped progress degrees', () => {
    expect(getJogProgressDegrees(30, 60)).toBe(180)
    expect(getJogProgressDegrees(90, 60)).toBe(360)
    expect(getJogProgressDegrees(10, 0)).toBe(0)
  })
})

describe('JogWheel', () => {
  it('renders an accessible jog control with progress styling', () => {
    const { container } = render(
      <JogWheel
        accent="#22d3ee"
        duration={60}
        isPlaying={false}
        label="Deck A jog"
        position={30}
        onBend={vi.fn()}
        onScratchEnd={vi.fn()}
        onScratchStart={() => 30}
        onScrub={vi.fn()}
        onSeek={vi.fn()}
      />
    )

    expect(screen.getByRole('slider', { name: 'Deck A jog' })).toHaveStyle({
      '--jog-progress': '180deg'
    })
    expect(container.querySelector('.jog-rotor > .jog-position-marker')).toBeInTheDocument()
  })

  it('seeks stopped decks and bends playing decks from the keyboard', () => {
    const onSeek = vi.fn()
    const onBend = vi.fn()
    const { rerender } = render(
      <JogWheel
        accent="#22d3ee"
        duration={60}
        isPlaying={false}
        label="Deck A jog"
        position={30}
        onBend={onBend}
        onScratchEnd={vi.fn()}
        onScratchStart={() => 30}
        onScrub={vi.fn()}
        onSeek={onSeek}
      />
    )
    const slider = screen.getByRole('slider', { name: 'Deck A jog' })

    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    fireEvent.keyDown(slider, { key: 'End' })
    expect(onSeek).toHaveBeenNthCalledWith(1, 31)
    expect(onSeek).toHaveBeenNthCalledWith(2, 60)

    rerender(
      <JogWheel
        accent="#22d3ee"
        duration={60}
        isPlaying
        label="Deck A jog"
        position={30}
        onBend={onBend}
        onScratchEnd={vi.fn()}
        onScratchStart={() => 30}
        onScrub={vi.fn()}
        onSeek={onSeek}
      />
    )
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Deck A jog' }), { key: 'ArrowLeft' })
    expect(onBend).toHaveBeenCalledWith(-3)
  })

  it('ends a drag when the window loses focus', () => {
    const onSeek = vi.fn()
    const onScratchEnd = vi.fn()
    render(
      <JogWheel
        accent="#22d3ee"
        duration={60}
        isPlaying={false}
        label="Deck A jog"
        position={30}
        onBend={vi.fn()}
        onScratchEnd={onScratchEnd}
        onScratchStart={() => 30}
        onScrub={vi.fn()}
        onSeek={onSeek}
      />
    )
    const slider = screen.getByRole('slider', { name: 'Deck A jog' })

    Object.assign(slider, {
      getBoundingClientRect: () => ({ top: 0, height: 100, left: 0, width: 100 }),
      setPointerCapture: vi.fn()
    })
    fireEvent.pointerDown(slider, { pointerId: 1, clientX: 75, clientY: 50, buttons: 1 })
    fireEvent.blur(window)
    fireEvent.pointerMove(slider, { pointerId: 1, clientX: 50, clientY: 100, buttons: 1 })

    expect(onSeek).not.toHaveBeenCalled()
    expect(onScratchEnd).toHaveBeenCalledTimes(1)
  })

  it('scrubs audibly from the platter and seeks silently from the rim while stopped', () => {
    const onScrub = vi.fn()
    const onSeek = vi.fn()
    render(
      <JogWheel
        accent="#22d3ee"
        duration={60}
        isPlaying={false}
        label="Deck A jog"
        position={10}
        onBend={vi.fn()}
        onScratchEnd={vi.fn()}
        onScratchStart={() => 10}
        onScrub={onScrub}
        onSeek={onSeek}
      />
    )
    const slider = screen.getByRole('slider', { name: 'Deck A jog' })

    Object.assign(slider, {
      getBoundingClientRect: () => ({ top: 0, height: 100, left: 0, width: 100 }),
      setPointerCapture: vi.fn()
    })
    fireEvent.pointerDown(slider, { pointerId: 1, clientX: 75, clientY: 50, buttons: 1 })
    fireEvent.pointerMove(slider, { pointerId: 1, clientX: 50, clientY: 75, buttons: 1 })
    fireEvent.pointerUp(slider, { pointerId: 1 })

    fireEvent.pointerDown(slider, { pointerId: 2, clientX: 100, clientY: 50, buttons: 1 })
    fireEvent.pointerMove(slider, { pointerId: 2, clientX: 50, clientY: 100, buttons: 1 })

    expect(onScrub).toHaveBeenCalledWith(10.45, 1)
    expect(onSeek).toHaveBeenCalledWith(11)
  })

  it('scratches the playing deck from the platter and resumes on release', () => {
    const onBend = vi.fn()
    const onScratchEnd = vi.fn()
    const onScratchStart = vi.fn(() => 20)
    const onScrub = vi.fn()
    render(
      <JogWheel
        accent="#22d3ee"
        duration={60}
        isPlaying
        label="Deck A jog"
        position={19.9}
        onBend={onBend}
        onScratchEnd={onScratchEnd}
        onScratchStart={onScratchStart}
        onScrub={onScrub}
        onSeek={vi.fn()}
      />
    )
    const slider = screen.getByRole('slider', { name: 'Deck A jog' })

    Object.assign(slider, {
      getBoundingClientRect: () => ({ top: 0, height: 100, left: 0, width: 100 }),
      setPointerCapture: vi.fn()
    })
    fireEvent.pointerDown(slider, { pointerId: 1, clientX: 75, clientY: 50, buttons: 1 })
    fireEvent.pointerMove(slider, { pointerId: 1, clientX: 50, clientY: 25, buttons: 1 })
    fireEvent.pointerUp(slider, { pointerId: 1 })

    expect(onScratchStart).toHaveBeenCalledTimes(1)
    expect(onScrub).toHaveBeenCalledWith(19.55, -1)
    expect(onBend).not.toHaveBeenCalled()
    expect(onScratchEnd).toHaveBeenCalledTimes(1)
  })
})
