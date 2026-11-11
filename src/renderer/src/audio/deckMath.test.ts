import { describe, expect, it } from 'vitest'
import {
  calculateJogPlaybackRate,
  clamp,
  clampEqDb,
  clampPitchPercent,
  clampPositiveValue,
  clampUnitValue,
  pitchPercentToRate
} from './deckMath'

describe('deck math', () => {
  it('clamps generic ranges', () => {
    expect(clamp(-1, 0, 1)).toBe(0)
    expect(clamp(2, 0, 1)).toBe(1)
    expect(clamp(0.5, 0, 1)).toBe(0.5)
  })

  it('converts pitch percentages to playback rates within supported range', () => {
    expect(clampPitchPercent(-20)).toBe(-16)
    expect(clampPitchPercent(20)).toBe(16)
    expect(pitchPercentToRate(5)).toBe(1.05)
    expect(pitchPercentToRate(20)).toBe(1.16)
  })

  it('clamps EQ, fader and positive gain controls', () => {
    expect(clampEqDb(-40)).toBe(-26)
    expect(clampEqDb(12)).toBe(6)
    expect(clampUnitValue(2)).toBe(1)
    expect(clampUnitValue(-1)).toBe(0)
    expect(clampPositiveValue(-1)).toBe(0)
  })

  it('calculates jog bend playback rates', () => {
    expect(calculateJogPlaybackRate(1, 0.015)).toBeCloseTo(1.1)
    expect(calculateJogPlaybackRate(1, 1)).toBe(1.35)
    expect(calculateJogPlaybackRate(0.1, -1)).toBe(0.05)
  })
})
