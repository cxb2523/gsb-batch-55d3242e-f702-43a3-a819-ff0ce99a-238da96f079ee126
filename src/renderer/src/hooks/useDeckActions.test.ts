import { act, renderHook } from '@testing-library/react'
import { useRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Deck } from '../audio/deck'
import { createDeckState } from '../app/deckState'
import type { DeckId } from '../app/engineTypes'
import { useDeckActions } from './useDeckActions'

function createDeck(): Deck {
  return {
    getEffectiveBpm: vi.fn(() => 128),
    setPitch: vi.fn((percent: number) => percent)
  } as unknown as Deck
}

function renderDeckActions(initialPitch = 0) {
  const decks: Record<DeckId, Deck> = {
    A: createDeck(),
    B: createDeck()
  }
  const getDeck = vi.fn((deckId: DeckId) => decks[deckId])

  const result = renderHook(() => {
    const [deckState, setDecks] = useState({
      A: { ...createDeckState(), pitch: initialPitch },
      B: createDeckState()
    })
    const deckPitchRef = useRef<Record<DeckId, number>>({ A: initialPitch, B: 0 })
    const actions = useDeckActions(getDeck, setDecks, deckPitchRef)

    return { actions, deckPitchRef, deckState }
  })

  return { ...result, decks, getDeck }
}

describe('useDeckActions', () => {
  it('updates deck pitch through the audio engine and React state', () => {
    const { result, decks } = renderDeckActions()

    act(() => {
      result.current.actions.setPitch('A', 4)
    })

    expect(decks.A.setPitch).toHaveBeenCalledWith(4)
    expect(decks.A.getEffectiveBpm).toHaveBeenCalled()
    expect(result.current.deckPitchRef.current.A).toBe(4)
    expect(result.current.deckState.A).toMatchObject({
      pitch: 4,
      effectiveBpm: 128
    })
  })

  it('skips engine writes and state churn when pitch is unchanged', () => {
    const { result, decks, getDeck } = renderDeckActions(2)
    const deckState = result.current.deckState

    act(() => {
      result.current.actions.setPitch('A', 2)
    })

    expect(getDeck).not.toHaveBeenCalled()
    expect(decks.A.setPitch).not.toHaveBeenCalled()
    expect(decks.A.getEffectiveBpm).not.toHaveBeenCalled()
    expect(result.current.deckState).toBe(deckState)
  })

  it('sets a cue point at the stopped deck position', () => {
    const { result, decks } = renderDeckActions()
    Object.assign(decks.A, {
      duration: 180,
      isPlaying: false,
      cuePoint: 0,
      getPosition: vi.fn(() => 42),
      setCuePoint: vi.fn(() => {
        decks.A.cuePoint = 42
      })
    })

    act(() => {
      result.current.actions.setCuePoint('A')
    })

    expect(decks.A.setCuePoint).toHaveBeenCalledTimes(1)
    expect(result.current.deckState.A).toMatchObject({ cuePoint: 42, position: 42 })
  })
})
