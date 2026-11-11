import { useCallback, useEffect, useRef, useState } from 'react'
import type { DeckLoadAnalysis, EqBand } from '../audio/deck'
import { getEngine, type DJEngine } from '../audio/engine'
import { createDeckState, type DeckState } from '../app/deckState'
import { getPhaseOffsetSeconds } from './engineMath'
import {
  createChannelState,
  createMixerState,
  persistControls,
  readPersistedControls,
  type PersistedControls
} from './enginePersistence'
import type { ChannelState, DeckId, MixerState, OutputState } from '../app/engineTypes'
import { useDeckActions } from './useDeckActions'
import { useEngineOutput } from './useEngineOutput'
import { useMixerActions } from './useMixerActions'
import { useTransportTicker } from './useTransportTicker'

export type { DeckId } from '../app/engineTypes'

export function useEngine(): {
  engine: DJEngine
  decks: Record<DeckId, DeckState>
  masterDeckId: DeckId | null
  phaseOffsets: Record<DeckId, number>
  channels: Record<DeckId, ChannelState>
  mixer: MixerState
  output: OutputState
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
  setTrim: (deckId: DeckId, value: number) => void
  setEq: (deckId: DeckId, band: EqBand, value: number) => void
  setChannelVolume: (deckId: DeckId, value: number) => void
  toggleCue: (deckId: DeckId) => void
  setCrossfade: (value: number) => void
  setCueMix: (value: number) => void
  setPhonesVolume: (value: number) => void
  setMasterVolume: (value: number) => void
  setMasterDevice: (deviceId: string) => void
  setCueDevice: (deviceId: string) => void
  refreshOutputDevices: () => Promise<void>
} {
  const engineRef = useRef<DJEngine | null>(null)
  const persistedControlsRef = useRef<PersistedControls | null>(null)
  const masterDeckIdRef = useRef<DeckId | null>(null)

  if (!persistedControlsRef.current) {
    persistedControlsRef.current = readPersistedControls()
  }

  const [decks, setDecks] = useState<Record<DeckId, DeckState>>(() => ({
    A: { ...createDeckState(), pitch: persistedControlsRef.current?.deckPitch.A ?? 0 },
    B: { ...createDeckState(), pitch: persistedControlsRef.current?.deckPitch.B ?? 0 }
  }))
  const [channels, setChannels] = useState<Record<DeckId, ChannelState>>(() => ({
    A: { ...createChannelState(), ...persistedControlsRef.current?.channels.A },
    B: { ...createChannelState(), ...persistedControlsRef.current?.channels.B }
  }))
  const [mixer, setMixer] = useState<MixerState>(() => {
    return persistedControlsRef.current?.mixer ?? createMixerState()
  })
  const [masterDeckId, setMasterDeckId] = useState<DeckId | null>(null)
  const deckPitchRef = useRef<Record<DeckId, number>>({
    A: persistedControlsRef.current?.deckPitch.A ?? 0,
    B: persistedControlsRef.current?.deckPitch.B ?? 0
  })

  const updateMasterDeck = useCallback((nextMasterDeckId: DeckId | null): void => {
    if (masterDeckIdRef.current === nextMasterDeckId) {
      return
    }

    masterDeckIdRef.current = nextMasterDeckId
    setMasterDeckId(nextMasterDeckId)
  }, [])

  if (!engineRef.current) {
    engineRef.current = getEngine()
  }

  const engine = engineRef.current
  const { output, setMasterDevice, setCueDevice, refreshOutputDevices } = useEngineOutput(engine)

  const getDeck = useCallback(
    (deckId: DeckId) => (deckId === 'A' ? engine.deckA : engine.deckB),
    [engine]
  )

  useEffect(() => {
    const persistedControls = persistedControlsRef.current

    if (persistedControls) {
      ;(['A', 'B'] as const).forEach((deckId) => {
        const deck = deckId === 'A' ? engine.deckA : engine.deckB
        const channel = persistedControls.channels[deckId]

        deck.setPitch(persistedControls.deckPitch[deckId])
        deck.setTrim(channel.trim)
        deck.setEq('high', channel.eq.high)
        deck.setEq('mid', channel.eq.mid)
        deck.setEq('low', channel.eq.low)
        deck.setChannelFader(channel.volume)
      })
      engine.mixer.setCrossfade(persistedControls.mixer.crossfade)
      engine.mixer.setCueMix(persistedControls.mixer.cueMix)
      engine.mixer.setPhonesGain(persistedControls.mixer.phonesVolume)
      engine.mixer.setMasterGain(persistedControls.mixer.masterVolume)
    }

    engine.deckA.onEnded = () => {
      setDecks((current) => ({ ...current, A: { ...current.A, isPlaying: false } }))
    }
    engine.deckB.onEnded = () => {
      setDecks((current) => ({ ...current, B: { ...current.B, isPlaying: false } }))
    }

    return () => {
      engine.deckA.onEnded = null
      engine.deckB.onEnded = null
    }
  }, [engine])

  useEffect(() => {
    persistControls(channels, mixer, { A: decks.A.pitch, B: decks.B.pitch })
  }, [channels, decks.A.pitch, decks.B.pitch, mixer])

  useTransportTicker(engine, masterDeckIdRef, updateMasterDeck, setDecks)

  const deckActions = useDeckActions(getDeck, setDecks, deckPitchRef)
  const mixerActions = useMixerActions(engine, getDeck, setChannels, setMixer)

  const phaseOffsets: Record<DeckId, number> = {
    A: masterDeckId && masterDeckId !== 'A' ? getPhaseOffsetSeconds(decks.A, decks[masterDeckId]) : 0,
    B: masterDeckId && masterDeckId !== 'B' ? getPhaseOffsetSeconds(decks.B, decks[masterDeckId]) : 0
  }

  return {
    engine,
    decks,
    masterDeckId,
    phaseOffsets,
    channels,
    mixer,
    output,
    ...deckActions,
    ...mixerActions,
    setMasterDevice,
    setCueDevice,
    refreshOutputDevices
  }
}
