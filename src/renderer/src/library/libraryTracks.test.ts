import { describe, expect, it } from 'vitest'
import type { LibraryTrack } from './libraryTypes'
import { mergeUniqueTracks } from './libraryTracks'

const existingTrack: LibraryTrack = {
  id: 'track-1',
  title: 'Existing',
  duration: 60,
  bpm: 120,
  firstBeatOffset: 0,
  source: 'local'
}

const nextTrack: LibraryTrack = {
  id: 'track-2',
  title: 'Next',
  duration: 90,
  bpm: 124,
  firstBeatOffset: 0.1,
  source: 'local'
}

describe('library tracks', () => {
  it('keeps existing order and appends only new track ids', () => {
    expect(mergeUniqueTracks([existingTrack], [{ ...existingTrack }, nextTrack])).toEqual([existingTrack, nextTrack])
  })

  it('returns the same list when there are no candidate tracks', () => {
    const tracks = [existingTrack]

    expect(mergeUniqueTracks(tracks, [])).toBe(tracks)
  })

  it('deduplicates repeated candidate ids in one pass', () => {
    expect(mergeUniqueTracks([], [nextTrack, { ...nextTrack, title: 'Duplicate' }])).toEqual([nextTrack])
  })
})
