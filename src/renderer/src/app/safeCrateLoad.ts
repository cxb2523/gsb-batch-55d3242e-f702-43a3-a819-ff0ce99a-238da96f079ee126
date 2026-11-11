import type { DeckId } from './engineTypes'

export interface CrateLoadDeckState {
  hasTrack: boolean
  isLoading: boolean
  isPlaying: boolean
  volume: number
}

export interface SafeCrateLoadState {
  crossfade: number
  decks: Record<DeckId, CrateLoadDeckState>
}

const INAUDIBLE_GAIN_THRESHOLD = 0.1

function getCrossfadeGain(deckId: DeckId, crossfade: number): number {
  const clampedCrossfade = Math.min(1, Math.max(-1, crossfade))
  const angle = ((clampedCrossfade + 1) * Math.PI) / 4
  return deckId === 'A' ? Math.cos(angle) : Math.sin(angle)
}

function getAudibleGain(deckId: DeckId, state: SafeCrateLoadState): number {
  const volume = Math.min(1, Math.max(0, state.decks[deckId].volume))
  return getCrossfadeGain(deckId, state.crossfade) * volume
}

export function getSafeCrateLoadTarget(state: SafeCrateLoadState): DeckId | null {
  const deckA = state.decks.A
  const deckB = state.decks.B

  if (!deckA.isPlaying && !deckB.isPlaying) {
    const availableEmptyDeck = (['A', 'B'] as const).find(
      (deckId) => !state.decks[deckId].isLoading && !state.decks[deckId].hasTrack
    )

    if (availableEmptyDeck) {
      return availableEmptyDeck
    }

    return (['A', 'B'] as const).find((deckId) => !state.decks[deckId].isLoading) ?? null
  }

  if (deckA.isPlaying !== deckB.isPlaying) {
    const stoppedDeckId: DeckId = deckA.isPlaying ? 'B' : 'A'
    return state.decks[stoppedDeckId].isLoading ? null : stoppedDeckId
  }

  const gainA = getAudibleGain('A', state)
  const gainB = getAudibleGain('B', state)
  const deckAIsInaudible = gainA <= INAUDIBLE_GAIN_THRESHOLD
  const deckBIsInaudible = gainB <= INAUDIBLE_GAIN_THRESHOLD

  if (deckAIsInaudible && !deckBIsInaudible && !deckA.isLoading) {
    return 'A'
  }

  if (deckBIsInaudible && !deckAIsInaudible && !deckB.isLoading) {
    return 'B'
  }

  if (deckAIsInaudible && deckBIsInaudible) {
    return (['A', 'B'] as const).find((deckId) => !state.decks[deckId].isLoading) ?? null
  }

  return null
}
