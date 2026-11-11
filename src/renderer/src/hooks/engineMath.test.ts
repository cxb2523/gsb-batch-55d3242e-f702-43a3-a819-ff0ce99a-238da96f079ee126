import { describe, expect, it } from 'vitest'
import { createDeckState } from '../app/deckState'
import {
  calculatePhaseNudgeSeconds,
  calculateSyncPitch,
  getBeatFraction,
  getPhaseOffsetSeconds,
  positiveModulo
} from './engineMath'

describe('engine math', () => {
  it('wraps negative modulo values into the positive range', () => {
    expect(positiveModulo(-0.25, 1)).toBe(0.75)
  })

  it('calculates beat fractions from native track time', () => {
    expect(getBeatFraction(1.5, 0.5, 120)).toBe(0)
    expect(getBeatFraction(1.75, 0.5, 120)).toBe(0.5)
  })

  it('returns phase offsets in master effective seconds', () => {
    const deck = { ...createDeckState(), position: 1.75, bpm: 120, firstBeatOffset: 0.5 }
    const masterDeck = {
      ...createDeckState(),
      position: 1.5,
      bpm: 120,
      firstBeatOffset: 0.5,
      effectiveBpm: 120
    }

    expect(getPhaseOffsetSeconds(deck, masterDeck)).toBeCloseTo(0.25)
  })

  it('calculates bounded sync pitch', () => {
    expect(calculateSyncPitch(120, 126)).toBeCloseTo(5)
    expect(calculateSyncPitch(120, 160)).toBe(16)
    expect(calculateSyncPitch(0, 120)).toBeNull()
  })

  it('calculates phase nudges in the deck native beat length', () => {
    expect(calculatePhaseNudgeSeconds(1.75, 0.5, 120, 1.5, 0.5, 120)).toBeCloseTo(0.25)
  })
})
