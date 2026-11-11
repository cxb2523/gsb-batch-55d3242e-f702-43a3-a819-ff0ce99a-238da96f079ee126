import { beforeEach, describe, expect, it } from 'vitest'
import {
  DECK_TRACK_STORAGE_KEY,
  parseDeckTrackSelection,
  persistDeckTrack,
  readDeckTrackSelection
} from './deckTrackPersistence'

describe('deck track persistence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('ignores invalid and non-string deck values', () => {
    expect(parseDeckTrackSelection('{"A":"track-a","B":42}')).toEqual({ A: 'track-a' })
    expect(parseDeckTrackSelection('{oops')).toEqual({})
  })

  it('merges deck selections in localStorage', () => {
    persistDeckTrack('A', 'track-a')
    persistDeckTrack('B', 'track-b')

    expect(readDeckTrackSelection()).toEqual({ A: 'track-a', B: 'track-b' })
    expect(localStorage.getItem(DECK_TRACK_STORAGE_KEY)).toContain('track-a')
  })
})
