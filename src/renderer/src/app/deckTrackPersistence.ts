import type { DeckId } from './engineTypes'

export const DECK_TRACK_STORAGE_KEY = 'nextdj.deckTracks.v1'

export type DeckTrackSelection = Partial<Record<DeckId, string>>

export function parseDeckTrackSelection(rawValue: string | null): DeckTrackSelection {
  try {
    const parsed = JSON.parse(rawValue ?? '{}') as unknown

    if (!parsed || typeof parsed !== 'object') {
      return {}
    }

    const record = parsed as Record<string, unknown>

    return {
      ...(typeof record.A === 'string' ? { A: record.A } : {}),
      ...(typeof record.B === 'string' ? { B: record.B } : {})
    }
  } catch {
    return {}
  }
}

export function readDeckTrackSelection(): DeckTrackSelection {
  return parseDeckTrackSelection(localStorage.getItem(DECK_TRACK_STORAGE_KEY))
}

export function persistDeckTrack(deckId: DeckId, trackId: string): void {
  const parsed = readDeckTrackSelection()
  localStorage.setItem(DECK_TRACK_STORAGE_KEY, JSON.stringify({ ...parsed, [deckId]: trackId }))
}

export function clearDeckTrackSelection(): void {
  localStorage.removeItem(DECK_TRACK_STORAGE_KEY)
}
