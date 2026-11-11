import { describe, expect, it } from 'vitest'
import { createDeckState } from './deckState'
import type { DeckId } from './engineTypes'
import { getMasterBeatIndex } from './masterBeat'

function createDecks(overrides: Partial<ReturnType<typeof createDeckState>> = {}) {
  return {
    A: { ...createDeckState(), ...overrides },
    B: createDeckState()
  } satisfies Record<DeckId, ReturnType<typeof createDeckState>>
}

describe('master beat', () => {
  it('returns -1 without an active playable master deck', () => {
    expect(getMasterBeatIndex(null, createDecks())).toBe(-1)
    expect(getMasterBeatIndex('A', createDecks({ bpm: 0, isPlaying: true }))).toBe(-1)
    expect(getMasterBeatIndex('A', createDecks({ bpm: 120, isPlaying: false }))).toBe(-1)
  })

  it('calculates the beat index from position, bpm and first beat offset', () => {
    expect(
      getMasterBeatIndex('A', createDecks({ bpm: 120, isPlaying: true, position: 1.75, firstBeatOffset: 0.5 }))
    ).toBe(2)
  })

  it('wraps negative beat indexes into the four-beat cycle', () => {
    expect(
      getMasterBeatIndex('A', createDecks({ bpm: 120, isPlaying: true, position: 0.25, firstBeatOffset: 0.5 }))
    ).toBe(3)
  })
})
