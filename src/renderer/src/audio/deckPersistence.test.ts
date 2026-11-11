import { beforeEach, describe, expect, it } from 'vitest'
import { loadCuePoint, loadHotCues, migrateDeckPersistenceKey, saveCuePoint, saveHotCues } from './deckPersistence'

describe('deck persistence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns empty hot cues for missing or corrupt storage', () => {
    expect(loadHotCues('track.mp3', (seconds) => seconds)).toEqual([null, null, null, null])

    localStorage.setItem('nextdj.hotCues', '{')
    expect(loadHotCues('track.mp3', (seconds) => seconds)).toEqual([null, null, null, null])
  })

  it('loads hot cues with clamped positions and default colors', () => {
    localStorage.setItem(
      'nextdj.hotCues',
      JSON.stringify({
        'track.mp3': [{ position: 12, color: '#fff' }, { position: 999 }, { bad: true }]
      })
    )

    expect(loadHotCues('track.mp3', (seconds) => Math.min(seconds, 30))).toEqual([
      { position: 12, color: '#fff' },
      { position: 30, color: '#f97316' },
      null,
      null
    ])
  })

  it('saves hot cues without dropping other tracks', () => {
    localStorage.setItem('nextdj.hotCues', JSON.stringify({ other: [{ position: 1, color: '#aaa' }] }))

    saveHotCues('track.mp3', [{ position: 5, color: '#22d3ee' }, null, null, null])

    expect(JSON.parse(localStorage.getItem('nextdj.hotCues') ?? '{}')).toEqual({
      other: [{ position: 1, color: '#aaa' }],
      'track.mp3': [{ position: 5, color: '#22d3ee' }, null, null, null]
    })
  })

  it('loads and saves cue points defensively', () => {
    expect(loadCuePoint('track.mp3', (seconds) => seconds)).toBe(0)

    saveCuePoint('track.mp3', 42)
    expect(loadCuePoint('track.mp3', (seconds) => Math.min(seconds, 10))).toBe(10)

    localStorage.setItem('nextdj.cuePoints', '{')
    expect(loadCuePoint('track.mp3', (seconds) => seconds)).toBe(0)
  })

  it('migrates filename-keyed cues to a stable track identity without overwriting it', () => {
    saveHotCues('same-name.mp3', [{ position: 5, color: '#22d3ee' }, null, null, null])
    saveCuePoint('same-name.mp3', 4)

    migrateDeckPersistenceKey('same-name.mp3', 'track-123')

    expect(loadHotCues('track-123', (seconds) => seconds)[0]).toMatchObject({ position: 5 })
    expect(loadCuePoint('track-123', (seconds) => seconds)).toBe(4)

    saveCuePoint('track-123', 8)
    migrateDeckPersistenceKey('same-name.mp3', 'track-123')
    expect(loadCuePoint('track-123', (seconds) => seconds)).toBe(8)
  })
})
