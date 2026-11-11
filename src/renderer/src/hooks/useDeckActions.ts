import { type Dispatch, type MutableRefObject, type SetStateAction, useCallback } from 'react'
import type { Deck, DeckLoadAnalysis } from '../audio/deck'
import type { DeckState } from '../app/deckState'
import { getDeckSnapshot } from '../app/deckState'
import { calculatePhaseNudgeSeconds, calculateSyncPitch } from './engineMath'
import type { DeckId } from '../app/engineTypes'

const NUDGE_SECONDS = 0.035
const JOG_SECONDS_PER_DEGREE = 0.001

type GetDeck = (deckId: DeckId) => Deck
type SetDecks = Dispatch<SetStateAction<Record<DeckId, DeckState>>>

export interface DeckActions {
  loadTrack: (deckId: DeckId, file: File, analysis?: DeckLoadAnalysis, trackId?: string) => Promise<boolean>
  togglePlayback: (deckId: DeckId) => Promise<void>
  seek: (deckId: DeckId, seconds: number) => void
  cueToStart: (deckId: DeckId) => void
  setCuePoint: (deckId: DeckId) => void
  cuePress: (deckId: DeckId) => Promise<void>
  cueRelease: (deckId: DeckId) => void
  setPitch: (deckId: DeckId, percent: number) => void
  syncDeck: (deckId: DeckId) => void
  nudgeDeck: (deckId: DeckId, direction: -1 | 1) => void
  jogBend: (deckId: DeckId, degrees: number) => void
  jogScratchEnd: (deckId: DeckId) => void
  jogScratchStart: (deckId: DeckId) => number
  jogScrub: (deckId: DeckId, seconds: number, direction: -1 | 1) => void
  triggerHotCue: (deckId: DeckId, index: number) => void
  clearHotCue: (deckId: DeckId, index: number) => void
  setLoopIn: (deckId: DeckId) => void
  setLoopOut: (deckId: DeckId) => void
  exitLoop: (deckId: DeckId) => void
  setAutoLoop: (deckId: DeckId, beats: number) => void
}

export function useDeckActions(
  getDeck: GetDeck,
  setDecks: SetDecks,
  deckPitchRef: MutableRefObject<Record<DeckId, number>>
): DeckActions {
  const loadTrack = useCallback(
    async (deckId: DeckId, file: File, analysis?: DeckLoadAnalysis, trackId?: string): Promise<boolean> => {
      const deck = getDeck(deckId)
      const committed = await deck.loadFile(file, analysis, trackId)

      if (!committed) {
        return false
      }

      const pitch = deck.setPitch(deckPitchRef.current[deckId])

      deckPitchRef.current[deckId] = pitch
      setDecks((current) => ({
        ...current,
        [deckId]: {
          ...current[deckId],
          trackName: deck.metadata.name,
          duration: deck.duration,
          position: 0,
          isPlaying: false,
          pitch,
          bpm: deck.metadata.bpm,
          firstBeatOffset: deck.metadata.firstBeatOffset,
          artworkUrl: deck.metadata.artworkUrl,
          effectiveBpm: deck.getEffectiveBpm(),
          hotCues: deck.hotCues,
          cuePoint: deck.cuePoint,
          loop: deck.loop,
          waveform: deck.waveform
        }
      }))
      return true
    },
    [deckPitchRef, getDeck, setDecks]
  )

  const togglePlayback = useCallback(
    async (deckId: DeckId): Promise<void> => {
      const deck = getDeck(deckId)

      if (deck.isPlaying) {
        deck.pause()
      } else {
        await deck.play()
      }

      setDecks((current) => ({
        ...current,
        [deckId]: { ...current[deckId], isPlaying: deck.isPlaying, position: deck.getPosition() }
      }))
    },
    [getDeck, setDecks]
  )

  const seek = useCallback(
    (deckId: DeckId, seconds: number): void => {
      const deck = getDeck(deckId)
      deck.seek(seconds)
      setDecks((current) => ({
        ...current,
        [deckId]: { ...current[deckId], position: deck.getPosition() }
      }))
    },
    [getDeck, setDecks]
  )

  const cueToStart = useCallback(
    (deckId: DeckId): void => {
      seek(deckId, 0)
    },
    [seek]
  )

  const setCuePoint = useCallback(
    (deckId: DeckId): void => {
      const deck = getDeck(deckId)

      if (deck.isPlaying || deck.duration <= 0) {
        return
      }

      deck.setCuePoint()
      setDecks((current) => ({
        ...current,
        [deckId]: { ...current[deckId], cuePoint: deck.cuePoint, position: deck.getPosition() }
      }))
    },
    [getDeck, setDecks]
  )

  const cuePress = useCallback(
    async (deckId: DeckId): Promise<void> => {
      const deck = getDeck(deckId)
      await deck.cuePress()
      setDecks((current) => ({
        ...current,
        [deckId]: getDeckSnapshot(deck, current[deckId].pitch)
      }))
    },
    [getDeck, setDecks]
  )

  const cueRelease = useCallback(
    (deckId: DeckId): void => {
      const deck = getDeck(deckId)
      deck.cueRelease()
      setDecks((current) => ({
        ...current,
        [deckId]: getDeckSnapshot(deck, current[deckId].pitch)
      }))
    },
    [getDeck, setDecks]
  )

  const setPitch = useCallback(
    (deckId: DeckId, percent: number): void => {
      if (deckPitchRef.current[deckId] === percent) {
        return
      }

      const deck = getDeck(deckId)
      const pitch = deck.setPitch(percent)

      deckPitchRef.current[deckId] = pitch
      setDecks((current) => ({
        ...current,
        [deckId]: { ...current[deckId], pitch, effectiveBpm: deck.getEffectiveBpm() }
      }))
    },
    [deckPitchRef, getDeck, setDecks]
  )

  const syncDeck = useCallback(
    (deckId: DeckId): void => {
      const deck = getDeck(deckId)
      const otherDeck = getDeck(deckId === 'A' ? 'B' : 'A')
      const targetBpm = otherDeck.getEffectiveBpm()

      if (deck.metadata.bpm <= 0 || targetBpm <= 0) {
        return
      }

      const pitch = calculateSyncPitch(deck.metadata.bpm, targetBpm)

      if (pitch === null) {
        return
      }

      deck.setPitch(pitch)
      deckPitchRef.current[deckId] = pitch

      const nudgeSeconds = calculatePhaseNudgeSeconds(
        deck.getPosition(),
        deck.metadata.firstBeatOffset,
        deck.metadata.bpm,
        otherDeck.getPosition(),
        otherDeck.metadata.firstBeatOffset,
        otherDeck.metadata.bpm
      )

      if (Number.isFinite(nudgeSeconds) && Math.abs(nudgeSeconds) > 0.003) {
        deck.nudge(-nudgeSeconds)
      }

      if (!deck.isPlaying && otherDeck.isPlaying) {
        void deck.play()
      }

      setDecks((current) => ({
        ...current,
        [deckId]: { ...getDeckSnapshot(deck, pitch), pitch }
      }))
    },
    [deckPitchRef, getDeck, setDecks]
  )

  const updateDeckSnapshot = useCallback(
    (deckId: DeckId, updateDeck: (deck: Deck) => void): void => {
      const deck = getDeck(deckId)
      updateDeck(deck)
      setDecks((current) => ({
        ...current,
        [deckId]: getDeckSnapshot(deck, current[deckId].pitch)
      }))
    },
    [getDeck, setDecks]
  )

  const nudgeDeck = useCallback(
    (deckId: DeckId, direction: -1 | 1): void => {
      updateDeckSnapshot(deckId, (deck) => deck.nudge(direction * NUDGE_SECONDS))
    },
    [updateDeckSnapshot]
  )

  const jogBend = useCallback(
    (deckId: DeckId, degrees: number): void => {
      updateDeckSnapshot(deckId, (deck) => deck.jogShift(degrees * JOG_SECONDS_PER_DEGREE))
    },
    [updateDeckSnapshot]
  )

  const jogScrub = useCallback(
    (deckId: DeckId, seconds: number, direction: -1 | 1): void => {
      updateDeckSnapshot(deckId, (deck) => deck.scrubTo(seconds, direction))
    },
    [updateDeckSnapshot]
  )

  const jogScratchStart = useCallback(
    (deckId: DeckId): number => {
      const deck = getDeck(deckId)
      const position = deck.scratchStart()

      setDecks((current) => ({
        ...current,
        [deckId]: getDeckSnapshot(deck, current[deckId].pitch)
      }))
      return position
    },
    [getDeck, setDecks]
  )

  const jogScratchEnd = useCallback(
    (deckId: DeckId): void => {
      updateDeckSnapshot(deckId, (deck) => deck.scratchEnd())
    },
    [updateDeckSnapshot]
  )

  const triggerHotCue = useCallback(
    (deckId: DeckId, index: number): void => {
      updateDeckSnapshot(deckId, (deck) => deck.triggerHotCue(index))
    },
    [updateDeckSnapshot]
  )

  const clearHotCue = useCallback(
    (deckId: DeckId, index: number): void => {
      updateDeckSnapshot(deckId, (deck) => deck.clearHotCue(index))
    },
    [updateDeckSnapshot]
  )

  const setLoopIn = useCallback(
    (deckId: DeckId): void => {
      updateDeckSnapshot(deckId, (deck) => deck.setLoopIn())
    },
    [updateDeckSnapshot]
  )

  const setLoopOut = useCallback(
    (deckId: DeckId): void => {
      updateDeckSnapshot(deckId, (deck) => deck.setLoopOut())
    },
    [updateDeckSnapshot]
  )

  const exitLoop = useCallback(
    (deckId: DeckId): void => {
      updateDeckSnapshot(deckId, (deck) => deck.exitLoop())
    },
    [updateDeckSnapshot]
  )

  const setAutoLoop = useCallback(
    (deckId: DeckId, beats: number): void => {
      updateDeckSnapshot(deckId, (deck) => deck.setAutoLoop(beats))
    },
    [updateDeckSnapshot]
  )

  return {
    loadTrack,
    togglePlayback,
    seek,
    cueToStart,
    setCuePoint,
    cuePress,
    cueRelease,
    setPitch,
    syncDeck,
    nudgeDeck,
    jogBend,
    jogScratchEnd,
    jogScratchStart,
    jogScrub,
    triggerHotCue,
    clearHotCue,
    setLoopIn,
    setLoopOut,
    exitLoop,
    setAutoLoop
  }
}
