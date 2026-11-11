import { describe, expect, it } from 'vitest'
import { clearHotCueState, isValidHotCueIndex, triggerHotCueState } from './deckHotCues'

describe('deck hot cues', () => {
  it('validates hot cue indexes against the available slots', () => {
    expect(isValidHotCueIndex(0, 4)).toBe(true)
    expect(isValidHotCueIndex(3, 4)).toBe(true)
    expect(isValidHotCueIndex(4, 4)).toBe(false)
    expect(isValidHotCueIndex(1.5, 4)).toBe(false)
  })

  it('ignores trigger requests for invalid slots or empty decks', () => {
    const hotCues = [null, null, null, null]

    expect(triggerHotCueState(hotCues, 4, 12, 60)).toEqual({
      hotCues,
      seekPosition: null,
      shouldSave: false
    })
    expect(triggerHotCueState(hotCues, 0, 12, 0)).toEqual({
      hotCues,
      seekPosition: null,
      shouldSave: false
    })
  })

  it('creates a new hot cue in an empty slot', () => {
    const result = triggerHotCueState([null, null, null, null], 1, 12.5, 60)

    expect(result).toEqual({
      hotCues: [null, { position: 12.5, color: '#f97316' }, null, null],
      seekPosition: null,
      shouldSave: true
    })
  })

  it('seeks to existing hot cues without mutating them', () => {
    const hotCues = [{ position: 8, color: '#fff' }, null, null, null]

    expect(triggerHotCueState(hotCues, 0, 12.5, 60)).toEqual({
      hotCues,
      seekPosition: 8,
      shouldSave: false
    })
  })

  it('clears valid slots and leaves invalid slots unchanged', () => {
    const hotCues = [{ position: 8, color: '#fff' }, null, null, null]

    expect(clearHotCueState(hotCues, 0)).toEqual([null, null, null, null])
    expect(clearHotCueState(hotCues, 8)).toBe(hotCues)
  })
})
