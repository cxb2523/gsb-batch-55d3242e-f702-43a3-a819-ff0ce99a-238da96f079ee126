import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Knob } from './Knob'

describe('Knob', () => {
  it('renders accessible value text and label', () => {
    render(
      <Knob
        accent="#22d3ee"
        defaultValue={0}
        label="High EQ"
        max={6}
        min={-26}
        value={3}
        valueFormatter={(value) => `${value} dB`}
        onChange={vi.fn()}
      />
    )

    expect(screen.getByRole('slider', { name: 'High EQ' })).toHaveAttribute('aria-valuetext', '3 dB')
    expect(screen.getByText('High EQ')).toBeInTheDocument()
  })

  it('resets to the default value on double click', () => {
    const onChange = vi.fn()

    render(
      <Knob
        accent="#22d3ee"
        defaultValue={0}
        label="Trim"
        max={2}
        min={0}
        step={0.1}
        value={1.4}
        onChange={onChange}
      />
    )

    fireEvent.doubleClick(screen.getByRole('slider', { name: 'Trim' }))

    expect(onChange).toHaveBeenCalledWith(0)
  })

  it('does not emit unchanged reset values', () => {
    const onChange = vi.fn()

    render(
      <Knob
        accent="#22d3ee"
        defaultValue={0}
        label="Trim"
        max={2}
        min={0}
        step={0.1}
        value={0}
        onChange={onChange}
      />
    )

    fireEvent.doubleClick(screen.getByRole('slider', { name: 'Trim' }))

    expect(onChange).not.toHaveBeenCalled()
  })

  it('shows the formatted value while hovered', () => {
    render(
      <Knob
        accent="#22d3ee"
        defaultValue={0}
        label="Mid EQ"
        max={6}
        min={-26}
        value={-2}
        valueFormatter={(value) => `${value} dB`}
        onChange={vi.fn()}
      />
    )

    fireEvent.pointerEnter(screen.getByRole('slider', { name: 'Mid EQ' }))

    expect(screen.getByText('-2 dB')).toBeInTheDocument()
  })

  it('supports arrow, page and boundary keyboard controls', () => {
    const onChange = vi.fn()
    render(
      <Knob
        accent="#22d3ee"
        defaultValue={0}
        label="Trim"
        max={2}
        min={0}
        step={0.1}
        value={1}
        onChange={onChange}
      />
    )
    const slider = screen.getByRole('slider', { name: 'Trim' })

    fireEvent.keyDown(slider, { key: 'ArrowUp' })
    fireEvent.keyDown(slider, { key: 'PageDown' })
    fireEvent.keyDown(slider, { key: 'Home' })
    fireEvent.keyDown(slider, { key: 'End' })

    expect(onChange).toHaveBeenNthCalledWith(1, 1.1)
    expect(onChange).toHaveBeenNthCalledWith(2, 0)
    expect(onChange).toHaveBeenNthCalledWith(3, 0)
    expect(onChange).toHaveBeenNthCalledWith(4, 2)
  })

  it('ends a drag when pointer capture is lost', () => {
    const onChange = vi.fn()
    render(
      <Knob
        accent="#22d3ee"
        defaultValue={0}
        label="Trim"
        max={2}
        min={0}
        value={1}
        onChange={onChange}
      />
    )
    const slider = screen.getByRole('slider', { name: 'Trim' })

    Object.assign(slider, { setPointerCapture: vi.fn() })
    fireEvent.pointerDown(slider, { pointerId: 1, clientY: 80, buttons: 1 })
    fireEvent.lostPointerCapture(slider, { pointerId: 1 })
    fireEvent.pointerMove(slider, { pointerId: 1, clientY: 20, buttons: 1 })

    expect(onChange).not.toHaveBeenCalled()
  })
})
