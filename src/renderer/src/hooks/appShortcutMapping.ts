import type { DeckId } from '../app/engineTypes'

export const CROSSFADER_NUDGE = 0.08
export const PITCH_NUDGE = 0.1

export type ShortcutCommand =
  | { type: 'toggle-shortcuts' }
  | { type: 'close-shortcuts' }
  | { type: 'toggle-playback'; deckId: DeckId }
  | { type: 'cue-press'; deckId: DeckId }
  | { type: 'cue-release'; deckId: DeckId }
  | { type: 'sync'; deckId: DeckId }
  | { type: 'toggle-cue'; deckId: DeckId }
  | { type: 'crossfade'; value: number }
  | { type: 'pitch'; deckId: DeckId; value: number }
  | { type: 'nudge'; deckId: DeckId; direction: -1 | 1 }

export function isRepeatSensitiveCode(code: string): boolean {
  return (
    code === 'KeyQ' ||
    code === 'KeyW' ||
    code === 'KeyA' ||
    code === 'KeyS' ||
    code === 'KeyD' ||
    code === 'KeyF' ||
    code === 'KeyT' ||
    code === 'KeyY' ||
    code === 'KeyC'
  )
}

export interface ShortcutState {
  deckPitch: Record<DeckId, number>
  loadingDecks: Partial<Record<DeckId, string>>
  crossfade: number
  shortcutsOpen: boolean
}

export interface ShortcutKeyInput {
  altKey: boolean
  code: string
  ctrlKey: boolean
  key: string
  metaKey: boolean
  repeat: boolean
  shiftKey: boolean
}

export function getShortcutCommand(input: ShortcutKeyInput, state: ShortcutState): ShortcutCommand | null {
  const deckALoading = Boolean(state.loadingDecks.A)
  const deckBLoading = Boolean(state.loadingDecks.B)
  const isPitchArrow = input.code === 'ArrowUp' || input.code === 'ArrowDown'

  if (input.metaKey || input.ctrlKey || (input.altKey && (!isPitchArrow || input.shiftKey))) {
    return null
  }

  if (input.repeat && isRepeatSensitiveCode(input.code)) {
    return null
  }

  if (input.key === '?' || (input.code === 'Slash' && input.shiftKey)) {
    return { type: 'toggle-shortcuts' }
  }

  if (input.code === 'Escape' && state.shortcutsOpen) {
    return { type: 'close-shortcuts' }
  }

  if (input.code === 'KeyQ' && !deckALoading) {
    return { type: 'toggle-playback', deckId: 'A' }
  }

  if (input.code === 'KeyW' && !deckBLoading) {
    return { type: 'toggle-playback', deckId: 'B' }
  }

  if (input.code === 'KeyA' && !deckALoading) {
    return { type: 'cue-press', deckId: 'A' }
  }

  if (input.code === 'KeyS' && !deckBLoading) {
    return { type: 'cue-press', deckId: 'B' }
  }

  if (input.code === 'KeyD' && !deckALoading) {
    return { type: 'sync', deckId: 'A' }
  }

  if (input.code === 'KeyF' && !deckBLoading) {
    return { type: 'sync', deckId: 'B' }
  }

  if (input.code === 'KeyT') {
    return { type: 'toggle-cue', deckId: 'A' }
  }

  if (input.code === 'KeyY') {
    return { type: 'toggle-cue', deckId: 'B' }
  }

  if (input.code === 'KeyZ') {
    return { type: 'crossfade', value: Math.max(-1, state.crossfade - CROSSFADER_NUDGE) }
  }

  if (input.code === 'KeyX') {
    return { type: 'crossfade', value: Math.min(1, state.crossfade + CROSSFADER_NUDGE) }
  }

  if (input.code === 'KeyC') {
    return { type: 'crossfade', value: 0 }
  }

  if (isPitchArrow) {
    const direction = input.code === 'ArrowUp' ? 1 : -1

    if (input.shiftKey) {
      return { type: 'pitch', deckId: 'A', value: state.deckPitch.A + direction * PITCH_NUDGE }
    }

    if (input.altKey) {
      return { type: 'pitch', deckId: 'B', value: state.deckPitch.B + direction * PITCH_NUDGE }
    }
  }

  if (input.code === 'BracketLeft') {
    return { type: 'nudge', deckId: input.shiftKey ? 'B' : 'A', direction: -1 }
  }

  if (input.code === 'BracketRight') {
    return { type: 'nudge', deckId: input.shiftKey ? 'B' : 'A', direction: 1 }
  }

  return null
}

export function getShortcutReleaseCommand(code: string): ShortcutCommand | null {
  if (code === 'KeyA') {
    return { type: 'cue-release', deckId: 'A' }
  }

  if (code === 'KeyS') {
    return { type: 'cue-release', deckId: 'B' }
  }

  return null
}
