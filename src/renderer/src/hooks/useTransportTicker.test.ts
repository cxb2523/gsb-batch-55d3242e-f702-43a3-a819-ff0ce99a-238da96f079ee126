import { act, renderHook } from '@testing-library/react'
import { useRef, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DJEngine } from '../audio/engine'
import { createDeckState } from '../app/deckState'
import type { DeckId } from '../app/engineTypes'
import { useTransportTicker } from './useTransportTicker'

function installAnimationFrameMock() {
  let nextFrameId = 1
  const callbacks = new Map<number, FrameRequestCallback>()
  const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    const frameId = nextFrameId
    nextFrameId += 1
    callbacks.set(frameId, callback)
    return frameId
  })
  const cancelAnimationFrame = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((frameId) => {
    callbacks.delete(frameId)
  })

  return {
    callbacks,
    requestAnimationFrame,
    cancelAnimationFrame,
    runFrame: (frameId: number): void => {
      const callback = callbacks.get(frameId)
      if (!callback) {
        throw new Error(`Frame ${frameId} was not scheduled.`)
      }
      callbacks.delete(frameId)
      callback(16)
    }
  }
}

function createEngine(options: {
  deckAPlaying: boolean
  deckBPlaying: boolean
  deckAPosition?: number
  deckBPosition?: number
}): DJEngine {
  return {
    deckA: {
      getPosition: vi.fn(() => options.deckAPosition ?? 12),
      getEffectiveBpm: vi.fn(() => 124),
      get isPlaying() {
        return options.deckAPlaying
      },
      hotCues: [{ position: 4, label: 'Intro' }, null, null, null],
      loop: { start: 8, end: 16, active: true }
    },
    deckB: {
      getPosition: vi.fn(() => options.deckBPosition ?? 24),
      getEffectiveBpm: vi.fn(() => 118),
      get isPlaying() {
        return options.deckBPlaying
      },
      hotCues: [null, { position: 32, label: 'Drop' }, null, null],
      loop: { start: null, end: null, active: false }
    }
  } as unknown as DJEngine
}

function renderTicker(engine: DJEngine, initialMasterDeck: DeckId | null) {
  const updateMasterDeck = vi.fn()
  const hook = renderHook(() => {
    const masterDeckIdRef = useRef<DeckId | null>(initialMasterDeck)
    const [decks, setDecks] = useState({
      A: createDeckState(),
      B: createDeckState()
    })

    useTransportTicker(engine, masterDeckIdRef, updateMasterDeck, setDecks)

    return decks
  })

  return { ...hook, updateMasterDeck }
}

describe('useTransportTicker', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('refreshes deck snapshots on each animation frame', () => {
    const raf = installAnimationFrameMock()
    const engine = createEngine({ deckAPlaying: true, deckBPlaying: false })
    const { result, updateMasterDeck } = renderTicker(engine, null)

    act(() => {
      raf.runFrame(1)
    })

    expect(updateMasterDeck).toHaveBeenCalledWith('A')
    expect(result.current.A).toMatchObject({
      position: 12,
      isPlaying: true,
      effectiveBpm: 124,
      hotCues: [{ position: 4, label: 'Intro' }, null, null, null],
      loop: { start: 8, end: 16, active: true }
    })
    expect(result.current.B).toMatchObject({
      position: 24,
      isPlaying: false,
      effectiveBpm: 118
    })
    expect(raf.requestAnimationFrame).toHaveBeenCalledTimes(2)
  })

  it('keeps the current deck state object when transport snapshots are unchanged', () => {
    const raf = installAnimationFrameMock()
    const engine = createEngine({
      deckAPlaying: false,
      deckBPlaying: false,
      deckAPosition: 0,
      deckBPosition: 0
    })
    const updateMasterDeck = vi.fn()
    const initialDecks = {
      A: {
        ...createDeckState(),
        effectiveBpm: 124,
        hotCues: engine.deckA.hotCues,
        loop: engine.deckA.loop
      },
      B: {
        ...createDeckState(),
        effectiveBpm: 118,
        hotCues: engine.deckB.hotCues,
        loop: engine.deckB.loop
      }
    }
    let renderCount = 0

    const { result } = renderHook(() => {
      renderCount += 1
      const masterDeckIdRef = useRef<DeckId | null>(null)
      const [decks, setDecks] = useState(initialDecks)

      useTransportTicker(engine, masterDeckIdRef, updateMasterDeck, setDecks)

      return decks
    })

    act(() => {
      raf.runFrame(1)
    })

    expect(updateMasterDeck).toHaveBeenCalledWith(null)
    expect(result.current).toBe(initialDecks)
    expect(renderCount).toBe(1)
  })

  it.each([
    { currentMaster: 'A' as DeckId, deckAPlaying: true, deckBPlaying: true, expected: 'A' },
    { currentMaster: 'B' as DeckId, deckAPlaying: true, deckBPlaying: true, expected: 'B' },
    { currentMaster: 'A' as DeckId, deckAPlaying: false, deckBPlaying: true, expected: 'B' },
    { currentMaster: null, deckAPlaying: false, deckBPlaying: false, expected: null }
  ])('selects $expected as master for current master $currentMaster', (scenario) => {
    const raf = installAnimationFrameMock()
    const engine = createEngine(scenario)
    const { updateMasterDeck } = renderTicker(engine, scenario.currentMaster)

    act(() => {
      raf.runFrame(1)
    })

    expect(updateMasterDeck).toHaveBeenCalledWith(scenario.expected)
  })

  it('cancels the scheduled animation frame on unmount', () => {
    const raf = installAnimationFrameMock()
    const engine = createEngine({ deckAPlaying: false, deckBPlaying: false })
    const { unmount } = renderTicker(engine, null)

    expect(raf.callbacks.has(1)).toBe(true)

    unmount()

    expect(raf.cancelAnimationFrame).toHaveBeenCalledWith(1)
    expect(raf.callbacks.has(1)).toBe(false)
  })
})
