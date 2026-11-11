import { describe, expect, it } from 'vitest'
import { getShortcutCommand, getShortcutReleaseCommand, isRepeatSensitiveCode } from './appShortcutMapping'

const baseState = {
  deckPitch: { A: 0, B: 0 },
  loadingDecks: {},
  crossfade: 0,
  shortcutsOpen: false
}

function key(overrides: Partial<Parameters<typeof getShortcutCommand>[0]>) {
  return {
    altKey: false,
    code: '',
    ctrlKey: false,
    key: '',
    metaKey: false,
    repeat: false,
    shiftKey: false,
    ...overrides
  }
}

describe('app shortcut mapping', () => {
  it('blocks repeat-sensitive commands', () => {
    expect(isRepeatSensitiveCode('KeyQ')).toBe(true)
    expect(getShortcutCommand(key({ code: 'KeyQ', repeat: true }), baseState)).toBeNull()
  })

  it('leaves operating-system shortcut modifiers unhandled', () => {
    expect(getShortcutCommand(key({ code: 'KeyQ', key: 'q', metaKey: true }), baseState)).toBeNull()
    expect(getShortcutCommand(key({ code: 'KeyQ', key: 'q', ctrlKey: true }), baseState)).toBeNull()
    expect(getShortcutCommand(key({ code: 'KeyF', key: 'f', altKey: true }), baseState)).toBeNull()
    expect(getShortcutCommand(key({ code: 'ArrowUp', altKey: true, shiftKey: true }), baseState)).toBeNull()
  })

  it('maps deck transport commands while respecting loading decks', () => {
    expect(getShortcutCommand(key({ code: 'KeyQ' }), baseState)).toEqual({ type: 'toggle-playback', deckId: 'A' })
    expect(getShortcutCommand(key({ code: 'KeyW' }), baseState)).toEqual({ type: 'toggle-playback', deckId: 'B' })
    expect(getShortcutCommand(key({ code: 'KeyQ' }), { ...baseState, loadingDecks: { A: 'Loading' } })).toBeNull()
    expect(getShortcutCommand(key({ code: 'KeyD' }), baseState)).toEqual({ type: 'sync', deckId: 'A' })
  })

  it('maps cue, mixer, pitch and nudge commands', () => {
    expect(getShortcutCommand(key({ code: 'KeyA' }), baseState)).toEqual({ type: 'cue-press', deckId: 'A' })
    expect(getShortcutReleaseCommand('KeyA')).toEqual({ type: 'cue-release', deckId: 'A' })
    expect(getShortcutCommand(key({ code: 'KeyT' }), baseState)).toEqual({ type: 'toggle-cue', deckId: 'A' })
    expect(getShortcutCommand(key({ code: 'KeyZ' }), baseState)).toEqual({ type: 'crossfade', value: -0.08 })
    expect(getShortcutCommand(key({ code: 'KeyX' }), { ...baseState, crossfade: 0.98 })).toEqual({
      type: 'crossfade',
      value: 1
    })
    expect(getShortcutCommand(key({ code: 'ArrowUp', shiftKey: true }), baseState)).toEqual({
      type: 'pitch',
      deckId: 'A',
      value: 0.1
    })
    expect(getShortcutCommand(key({ code: 'ArrowDown', altKey: true }), baseState)).toEqual({
      type: 'pitch',
      deckId: 'B',
      value: -0.1
    })
    expect(getShortcutCommand(key({ code: 'BracketRight', shiftKey: true }), baseState)).toEqual({
      type: 'nudge',
      deckId: 'B',
      direction: 1
    })
  })

  it('maps shortcut overlay commands', () => {
    expect(getShortcutCommand(key({ key: '?' }), baseState)).toEqual({ type: 'toggle-shortcuts' })
    expect(getShortcutCommand(key({ code: 'Slash', shiftKey: true }), baseState)).toEqual({
      type: 'toggle-shortcuts'
    })
    expect(getShortcutCommand(key({ code: 'Escape' }), { ...baseState, shortcutsOpen: true })).toEqual({
      type: 'close-shortcuts'
    })
    expect(getShortcutReleaseCommand('KeyZ')).toBeNull()
  })
})
