import { act, renderHook } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Deck } from '../audio/deck'
import type { DJEngine } from '../audio/engine'
import type { ChannelState, DeckId, MixerState } from '../app/engineTypes'
import { useMixerActions } from './useMixerActions'

const initialChannels: Record<DeckId, ChannelState> = {
  A: {
    trim: 0,
    eq: { low: 0, mid: 0, high: 0 },
    volume: 1,
    cue: false
  },
  B: {
    trim: 0,
    eq: { low: 0, mid: 0, high: 0 },
    volume: 1,
    cue: true
  }
}

const initialMixer: MixerState = {
  crossfade: 0.5,
  cueMix: 0.5,
  phonesVolume: 0.7,
  masterVolume: 0.8
}

function createDeck(): Deck {
  return {
    setTrim: vi.fn(),
    setEq: vi.fn(),
    setChannelFader: vi.fn()
  } as unknown as Deck
}

function createEngine(): DJEngine {
  return {
    mixer: {
      setCue: vi.fn(),
      setCrossfade: vi.fn(),
      setCueMix: vi.fn(),
      setPhonesGain: vi.fn(),
      setMasterGain: vi.fn()
    }
  } as unknown as DJEngine
}

function renderMixerActions() {
  const engine = createEngine()
  const decks: Record<DeckId, Deck> = {
    A: createDeck(),
    B: createDeck()
  }
  const getDeck = vi.fn((deckId: DeckId) => decks[deckId])

  const result = renderHook(() => {
    const [channels, setChannels] = useState(initialChannels)
    const [mixer, setMixer] = useState(initialMixer)
    const actions = useMixerActions(engine, getDeck, setChannels, setMixer)

    return { actions, channels, mixer }
  })

  return { ...result, engine, decks, getDeck }
}

describe('useMixerActions', () => {
  it('updates deck gain controls and channel state', () => {
    const { result, decks } = renderMixerActions()

    act(() => {
      result.current.actions.setTrim('A', 3)
      result.current.actions.setEq('A', 'mid', -2)
      result.current.actions.setChannelVolume('A', 0.42)
    })

    expect(decks.A.setTrim).toHaveBeenCalledWith(3)
    expect(decks.A.setEq).toHaveBeenCalledWith('mid', -2)
    expect(decks.A.setChannelFader).toHaveBeenCalledWith(0.42)
    expect(result.current.channels.A).toMatchObject({
      trim: 3,
      eq: { low: 0, mid: -2, high: 0 },
      volume: 0.42
    })
    expect(result.current.channels.B).toEqual(initialChannels.B)
  })

  it('toggles cue state through the engine mixer', () => {
    const { result, engine } = renderMixerActions()

    act(() => {
      result.current.actions.toggleCue('A')
      result.current.actions.toggleCue('B')
    })

    expect(engine.mixer.setCue).toHaveBeenCalledWith('A', true)
    expect(engine.mixer.setCue).toHaveBeenCalledWith('B', false)
    expect(result.current.channels.A.cue).toBe(true)
    expect(result.current.channels.B.cue).toBe(false)
  })

  it('updates mixer controls through the engine mixer and React state', () => {
    const { result, engine } = renderMixerActions()

    act(() => {
      result.current.actions.setCrossfade(0.25)
      result.current.actions.setCueMix(0.75)
      result.current.actions.setPhonesVolume(0.4)
      result.current.actions.setMasterVolume(0.6)
    })

    expect(engine.mixer.setCrossfade).toHaveBeenCalledWith(0.25)
    expect(engine.mixer.setCueMix).toHaveBeenCalledWith(0.75)
    expect(engine.mixer.setPhonesGain).toHaveBeenCalledWith(0.4)
    expect(engine.mixer.setMasterGain).toHaveBeenCalledWith(0.6)
    expect(result.current.mixer).toEqual({
      crossfade: 0.25,
      cueMix: 0.75,
      phonesVolume: 0.4,
      masterVolume: 0.6
    })
  })

  it('skips engine writes and state churn when controls are unchanged', () => {
    const { result, engine, decks } = renderMixerActions()
    const channels = result.current.channels
    const mixer = result.current.mixer

    act(() => {
      result.current.actions.setTrim('A', initialChannels.A.trim)
      result.current.actions.setEq('A', 'mid', initialChannels.A.eq.mid)
      result.current.actions.setChannelVolume('A', initialChannels.A.volume)
      result.current.actions.setCrossfade(initialMixer.crossfade)
      result.current.actions.setCueMix(initialMixer.cueMix)
      result.current.actions.setPhonesVolume(initialMixer.phonesVolume)
      result.current.actions.setMasterVolume(initialMixer.masterVolume)
    })

    expect(decks.A.setTrim).not.toHaveBeenCalled()
    expect(decks.A.setEq).not.toHaveBeenCalled()
    expect(decks.A.setChannelFader).not.toHaveBeenCalled()
    expect(engine.mixer.setCrossfade).not.toHaveBeenCalled()
    expect(engine.mixer.setCueMix).not.toHaveBeenCalled()
    expect(engine.mixer.setPhonesGain).not.toHaveBeenCalled()
    expect(engine.mixer.setMasterGain).not.toHaveBeenCalled()
    expect(result.current.channels).toBe(channels)
    expect(result.current.mixer).toBe(mixer)
  })
})
