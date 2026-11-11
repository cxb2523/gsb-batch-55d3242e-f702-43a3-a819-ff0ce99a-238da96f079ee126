import { MAX_PITCH_PERCENT, MIN_PITCH_PERCENT } from '../audio/deck'
import type { DeckState } from '../app/deckState'

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus
}

// Positions are in track time, where beats are spaced by the native BPM
// regardless of playback rate, so each deck phase is measured on its own grid.
export function getBeatFraction(position: number, firstBeatOffset: number, nativeBpm: number): number {
  return positiveModulo(((position - firstBeatOffset) * nativeBpm) / 60, 1)
}

export function normalizeFractionOffset(fraction: number): number {
  const wrapped = positiveModulo(fraction, 1)
  return wrapped > 0.5 ? wrapped - 1 : wrapped
}

export function getPhaseOffsetSeconds(deck: DeckState, masterDeck: DeckState): number {
  if (deck.bpm <= 0 || masterDeck.bpm <= 0 || masterDeck.effectiveBpm <= 0) {
    return 0
  }

  const deckFraction = getBeatFraction(deck.position, deck.firstBeatOffset, deck.bpm)
  const masterFraction = getBeatFraction(masterDeck.position, masterDeck.firstBeatOffset, masterDeck.bpm)

  return normalizeFractionOffset(deckFraction - masterFraction) * (60 / masterDeck.effectiveBpm)
}

export function calculateSyncPitch(nativeBpm: number, targetBpm: number): number | null {
  if (nativeBpm <= 0 || targetBpm <= 0) {
    return null
  }

  return clamp((targetBpm / nativeBpm - 1) * 100, MIN_PITCH_PERCENT, MAX_PITCH_PERCENT)
}

export function calculatePhaseNudgeSeconds(
  deckPosition: number,
  deckFirstBeatOffset: number,
  deckBpm: number,
  masterPosition: number,
  masterFirstBeatOffset: number,
  masterBpm: number
): number {
  if (deckBpm <= 0 || masterBpm <= 0) {
    return 0
  }

  const deckFraction = getBeatFraction(deckPosition, deckFirstBeatOffset, deckBpm)
  const masterFraction = getBeatFraction(masterPosition, masterFirstBeatOffset, masterBpm)

  return normalizeFractionOffset(deckFraction - masterFraction) * (60 / deckBpm)
}
