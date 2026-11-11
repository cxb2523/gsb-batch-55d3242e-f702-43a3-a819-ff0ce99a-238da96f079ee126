import { describe, expect, it } from 'vitest'
import { createTrackIdIndex, formatBpm, formatTime, isEditableTarget } from './libraryPanelUtils'

describe('library panel utils', () => {
  it('indexes tracks by id for constant-time keyboard navigation', () => {
    const index = createTrackIdIndex([{ id: 'first' }, { id: 'second' }, { id: 'third' }])

    expect(index.get('first')).toBe(0)
    expect(index.get('second')).toBe(1)
    expect(index.get('missing')).toBeUndefined()
  })

  it('formats durations for crate rows', () => {
    expect(formatTime(0)).toBe('0:00')
    expect(formatTime(Number.NaN)).toBe('0:00')
    expect(formatTime(65.9)).toBe('1:05')
    expect(formatTime(3600)).toBe('60:00')
  })

  it('formats BPM values defensively', () => {
    expect(formatBpm(0)).toBe('--')
    expect(formatBpm(-1)).toBe('--')
    expect(formatBpm(128.256)).toBe('128.3')
  })

  it('detects editable keyboard targets', () => {
    expect(isEditableTarget(document.createElement('input'))).toBe(true)
    expect(isEditableTarget(document.createElement('textarea'))).toBe(true)
    expect(isEditableTarget(document.createElement('select'))).toBe(true)

    const editable = document.createElement('div')
    editable.setAttribute('contenteditable', 'true')
    expect(isEditableTarget(editable)).toBe(true)
    expect(isEditableTarget(document.createElement('button'))).toBe(false)
    expect(isEditableTarget(null)).toBe(false)
  })
})
