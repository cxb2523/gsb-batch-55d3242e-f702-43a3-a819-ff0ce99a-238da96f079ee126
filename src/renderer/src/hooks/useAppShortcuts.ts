import { useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { isEditableTarget } from '../keyboard'
import type { DeckId } from '../app/engineTypes'
import {
  getShortcutCommand,
  getShortcutReleaseCommand,
  type ShortcutCommand
} from './appShortcutMapping'

interface UseAppShortcutsOptions {
  deckPitch: Record<DeckId, number>
  loadingDecks: Partial<Record<DeckId, string>>
  crossfade: number
  shortcutsOpen: boolean
  setShortcutsOpen: Dispatch<SetStateAction<boolean>>
  togglePlayback: (deckId: DeckId) => Promise<void>
  cuePress: (deckId: DeckId) => Promise<void>
  cueRelease: (deckId: DeckId) => void
  syncDeck: (deckId: DeckId) => void
  toggleCue: (deckId: DeckId) => void
  setCrossfade: (value: number) => void
  setPitch: (deckId: DeckId, percent: number) => void
  nudgeDeck: (deckId: DeckId, direction: -1 | 1) => void
}

export function useAppShortcuts({
  deckPitch,
  loadingDecks,
  crossfade,
  shortcutsOpen,
  setShortcutsOpen,
  togglePlayback,
  cuePress,
  cueRelease,
  syncDeck,
  toggleCue,
  setCrossfade,
  setPitch,
  nudgeDeck
}: UseAppShortcutsOptions): void {
  useEffect(() => {
    const applyCommand = (command: ShortcutCommand): void => {
      if (command.type === 'toggle-shortcuts') {
        setShortcutsOpen((current) => !current)
        return
      }

      if (command.type === 'close-shortcuts') {
        setShortcutsOpen(false)
        return
      }

      if (command.type === 'toggle-playback') {
        void togglePlayback(command.deckId)
        return
      }

      if (command.type === 'cue-press') {
        void cuePress(command.deckId)
        return
      }

      if (command.type === 'cue-release') {
        cueRelease(command.deckId)
        return
      }

      if (command.type === 'sync') {
        syncDeck(command.deckId)
        return
      }

      if (command.type === 'toggle-cue') {
        toggleCue(command.deckId)
        return
      }

      if (command.type === 'crossfade') {
        setCrossfade(command.value)
        return
      }

      if (command.type === 'pitch') {
        setPitch(command.deckId, command.value)
        return
      }

      nudgeDeck(command.deckId, command.direction)
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (isEditableTarget(event.target)) {
        return
      }

      const command = getShortcutCommand(event, {
        deckPitch: { A: deckPitch.A, B: deckPitch.B },
        loadingDecks: { A: loadingDecks.A, B: loadingDecks.B },
        crossfade,
        shortcutsOpen
      })

      if (command) {
        event.preventDefault()
        applyCommand(command)
      }
    }

    const handleKeyUp = (event: KeyboardEvent): void => {
      if (isEditableTarget(event.target)) {
        return
      }

      const command = getShortcutReleaseCommand(event.code)

      if (command) {
        applyCommand(command)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [
    crossfade,
    cuePress,
    cueRelease,
    deckPitch.A,
    deckPitch.B,
    loadingDecks.A,
    loadingDecks.B,
    nudgeDeck,
    setCrossfade,
    setPitch,
    setShortcutsOpen,
    shortcutsOpen,
    syncDeck,
    toggleCue,
    togglePlayback
  ])
}
