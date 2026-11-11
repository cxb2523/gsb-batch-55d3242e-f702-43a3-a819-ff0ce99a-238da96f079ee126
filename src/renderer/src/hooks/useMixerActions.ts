import { type Dispatch, type SetStateAction, useCallback } from 'react'
import type { EqBand } from '../audio/deck'
import type { DJEngine } from '../audio/engine'
import type { Deck } from '../audio/deck'
import type { ChannelState, DeckId, MixerState } from '../app/engineTypes'

type GetDeck = (deckId: DeckId) => Deck

export interface MixerActions {
  setTrim: (deckId: DeckId, value: number) => void
  setEq: (deckId: DeckId, band: EqBand, value: number) => void
  setChannelVolume: (deckId: DeckId, value: number) => void
  toggleCue: (deckId: DeckId) => void
  setCrossfade: (value: number) => void
  setCueMix: (value: number) => void
  setPhonesVolume: (value: number) => void
  setMasterVolume: (value: number) => void
}

export function useMixerActions(
  engine: DJEngine,
  getDeck: GetDeck,
  setChannels: Dispatch<SetStateAction<Record<DeckId, ChannelState>>>,
  setMixer: Dispatch<SetStateAction<MixerState>>
): MixerActions {
  const setTrim = useCallback(
    (deckId: DeckId, value: number): void => {
      setChannels((current) => {
        if (current[deckId].trim === value) {
          return current
        }

        getDeck(deckId).setTrim(value)
        return { ...current, [deckId]: { ...current[deckId], trim: value } }
      })
    },
    [getDeck, setChannels]
  )

  const setEq = useCallback(
    (deckId: DeckId, band: EqBand, value: number): void => {
      setChannels((current) => {
        if (current[deckId].eq[band] === value) {
          return current
        }

        getDeck(deckId).setEq(band, value)
        return {
          ...current,
          [deckId]: {
            ...current[deckId],
            eq: { ...current[deckId].eq, [band]: value }
          }
        }
      })
    },
    [getDeck, setChannels]
  )

  const setChannelVolume = useCallback(
    (deckId: DeckId, value: number): void => {
      setChannels((current) => {
        if (current[deckId].volume === value) {
          return current
        }

        getDeck(deckId).setChannelFader(value)
        return { ...current, [deckId]: { ...current[deckId], volume: value } }
      })
    },
    [getDeck, setChannels]
  )

  const toggleCue = useCallback(
    (deckId: DeckId): void => {
      setChannels((current) => {
        const nextCue = !current[deckId].cue
        engine.mixer.setCue(deckId, nextCue)
        return { ...current, [deckId]: { ...current[deckId], cue: nextCue } }
      })
    },
    [engine, setChannels]
  )

  const setCrossfade = useCallback(
    (value: number): void => {
      setMixer((current) => {
        if (current.crossfade === value) {
          return current
        }

        engine.mixer.setCrossfade(value)
        return { ...current, crossfade: value }
      })
    },
    [engine, setMixer]
  )

  const setCueMix = useCallback(
    (value: number): void => {
      setMixer((current) => {
        if (current.cueMix === value) {
          return current
        }

        engine.mixer.setCueMix(value)
        return { ...current, cueMix: value }
      })
    },
    [engine, setMixer]
  )

  const setMasterVolume = useCallback(
    (value: number): void => {
      setMixer((current) => {
        if (current.masterVolume === value) {
          return current
        }

        engine.mixer.setMasterGain(value)
        return { ...current, masterVolume: value }
      })
    },
    [engine, setMixer]
  )

  const setPhonesVolume = useCallback(
    (value: number): void => {
      setMixer((current) => {
        if (current.phonesVolume === value) {
          return current
        }

        engine.mixer.setPhonesGain(value)
        return { ...current, phonesVolume: value }
      })
    },
    [engine, setMixer]
  )

  return {
    setTrim,
    setEq,
    setChannelVolume,
    toggleCue,
    setCrossfade,
    setCueMix,
    setPhonesVolume,
    setMasterVolume
  }
}
