import { describe, expect, it } from 'vitest'
import { getWaveformKeyboardSeekPosition } from './waveformKeyboard'

describe('waveform keyboard seeking', () => {
  it('supports fine, large and boundary seeks', () => {
    expect(getWaveformKeyboardSeekPosition('ArrowRight', 10, 60, 1, 10)).toBe(11)
    expect(getWaveformKeyboardSeekPosition('PageDown', 5, 60, 1, 10)).toBe(0)
    expect(getWaveformKeyboardSeekPosition('Home', 30, 60, 1, 10)).toBe(0)
    expect(getWaveformKeyboardSeekPosition('End', 30, 60, 1, 10)).toBe(60)
    expect(getWaveformKeyboardSeekPosition('Enter', 30, 60, 1, 10)).toBeNull()
  })
})
