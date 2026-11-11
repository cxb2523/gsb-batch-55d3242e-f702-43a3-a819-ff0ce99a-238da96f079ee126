import type { DeckState } from './deckState'
import type { DeckId } from './engineTypes'

export function getMasterBeatIndex(masterDeckId: DeckId | null, decks: Record<DeckId, DeckState>): number {
  if (!masterDeckId) {
    return -1
  }

  const masterDeck = decks[masterDeckId]

  if (masterDeck.bpm <= 0 || !masterDeck.isPlaying) {
    return -1
  }

  const beatSeconds = 60 / masterDeck.bpm
  let beatIndex = Math.floor((masterDeck.position - masterDeck.firstBeatOffset) / beatSeconds) % 4

  if (beatIndex < 0) {
    beatIndex += 4
  }

  return beatIndex
}
