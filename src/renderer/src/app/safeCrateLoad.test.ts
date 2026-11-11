import { describe, expect, it } from 'vitest'
import { getSafeCrateLoadTarget, type SafeCrateLoadState } from './safeCrateLoad'

function createState(overrides: Partial<SafeCrateLoadState> = {}): SafeCrateLoadState {
  return {
    crossfade: 0,
    decks: {
      A: { hasTrack: true, isLoading: false, isPlaying: false, volume: 1 },
      B: { hasTrack: true, isLoading: false, isPlaying: false, volume: 1 }
    },
    ...overrides
  }
}

describe('safe crate load target', () => {
  it('uses the stopped deck when only one deck is playing', () => {
    expect(
      getSafeCrateLoadTarget(
        createState({
          decks: {
            A: { hasTrack: true, isLoading: false, isPlaying: true, volume: 1 },
            B: { hasTrack: true, isLoading: false, isPlaying: false, volume: 1 }
          }
        })
      )
    ).toBe('B')
  })

  it('uses the faded-out deck when both decks are playing', () => {
    const playingDecks = {
      A: { hasTrack: true, isLoading: false, isPlaying: true, volume: 1 },
      B: { hasTrack: true, isLoading: false, isPlaying: true, volume: 1 }
    }

    expect(getSafeCrateLoadTarget(createState({ crossfade: 1, decks: playingDecks }))).toBe('A')
    expect(getSafeCrateLoadTarget(createState({ crossfade: -1, decks: playingDecks }))).toBe('B')
  })

  it('uses a deck silenced by its channel fader', () => {
    expect(
      getSafeCrateLoadTarget(
        createState({
          decks: {
            A: { hasTrack: true, isLoading: false, isPlaying: true, volume: 0 },
            B: { hasTrack: true, isLoading: false, isPlaying: true, volume: 1 }
          }
        })
      )
    ).toBe('A')
  })

  it('blocks loading while both decks are audible', () => {
    expect(
      getSafeCrateLoadTarget(
        createState({
          decks: {
            A: { hasTrack: true, isLoading: false, isPlaying: true, volume: 1 },
            B: { hasTrack: true, isLoading: false, isPlaying: true, volume: 1 }
          }
        })
      )
    ).toBeNull()
  })

  it('does not treat a moderate crossfade as safely off-air', () => {
    expect(
      getSafeCrateLoadTarget(
        createState({
          crossfade: 0.75,
          decks: {
            A: { hasTrack: true, isLoading: false, isPlaying: true, volume: 1 },
            B: { hasTrack: true, isLoading: false, isPlaying: true, volume: 1 }
          }
        })
      )
    ).toBeNull()
  })

  it('prefers an empty deck when neither deck is playing', () => {
    expect(
      getSafeCrateLoadTarget(
        createState({
          decks: {
            A: { hasTrack: true, isLoading: false, isPlaying: false, volume: 1 },
            B: { hasTrack: false, isLoading: false, isPlaying: false, volume: 1 }
          }
        })
      )
    ).toBe('B')
  })

  it('never chooses a deck that is already loading', () => {
    expect(
      getSafeCrateLoadTarget(
        createState({
          decks: {
            A: { hasTrack: true, isLoading: false, isPlaying: true, volume: 1 },
            B: { hasTrack: true, isLoading: true, isPlaying: false, volume: 1 }
          }
        })
      )
    ).toBeNull()
  })
})
