import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { VUMeter } from './VUMeter'
import { calculateMeterLevel, getLitSegmentCount, getPeakSegment, getVuSegmentColor } from './vuMeterMath'

describe('VUMeter helpers', () => {
  it('calculates normalized RMS level from time-domain samples', () => {
    expect(calculateMeterLevel(Uint8Array.from([128, 128, 128]))).toBe(0)
    expect(calculateMeterLevel(Uint8Array.from([0, 255]))).toBeCloseTo(1)
  })

  it('maps peaks and segment colors', () => {
    expect(getPeakSegment(0, 18)).toBe(-1)
    expect(getPeakSegment(0.5, 18)).toBe(9)
    expect(getPeakSegment(2, 18)).toBe(17)
    expect(getLitSegmentCount(0, 18)).toBe(0)
    expect(getLitSegmentCount(0.5, 18)).toBe(9)
    expect(getLitSegmentCount(1, 18)).toBe(18)
    expect(getVuSegmentColor(2, 18)).toBe('green')
    expect(getVuSegmentColor(12, 18)).toBe('yellow')
    expect(getVuSegmentColor(16, 18)).toBe('red')
  })
})

describe('VUMeter', () => {
  it('renders labelled meter segments without an analyser', () => {
    render(<VUMeter analyser={null} label="Master" segments={4} />)

    expect(screen.getByLabelText('Master')).toBeInTheDocument()
    expect(screen.getByText('Master')).toBeInTheDocument()
    expect(document.querySelectorAll('.vu-segment')).toHaveLength(4)
  })
})
