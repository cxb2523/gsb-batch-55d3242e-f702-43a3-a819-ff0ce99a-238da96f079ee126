import { describe, expect, it } from 'vitest'
import { isEditableTarget } from './keyboard'

describe('keyboard helpers', () => {
  it('detects editable targets', () => {
    expect(isEditableTarget(document.createElement('input'))).toBe(true)
    expect(isEditableTarget(document.createElement('textarea'))).toBe(true)
    expect(isEditableTarget(document.createElement('select'))).toBe(true)

    const div = document.createElement('div')
    div.setAttribute('contenteditable', 'true')
    expect(isEditableTarget(div)).toBe(true)
    expect(isEditableTarget(document.createElement('button'))).toBe(false)
  })
})
