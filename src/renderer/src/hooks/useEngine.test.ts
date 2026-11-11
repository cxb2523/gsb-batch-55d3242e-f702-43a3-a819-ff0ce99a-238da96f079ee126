import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PersistedControls } from './enginePersistence'

const persistenceMock = vi.hoisted(() => ({
  readPersistedControls: vi.fn<() => PersistedControls | null>(),
  persistControls: vi.fn()
}))

vi.mock('./enginePersistence', async () => {
  const actual = await vi.importActual<typeof import('./enginePersistence')>('./enginePersistence')

  return {
    ...actual,
    readPersistedControls: persistenceMock.readPersistedControls,
    persistControls: persistenceMock.persistControls
  }
})

function createFakeDeck(): Record<string, unknown> {
  return {
    setPitch: vi.fn((value: number) => value),
    setTrim: vi.fn(),
    setEq: vi.fn(),
    setChannelFader: vi.fn(),
    getPosition: vi.fn(() => 0),
    getEffectiveBpm: vi.fn(() => 0),
    isPlaying: false,
    hotCues: [null, null, null, null],
    loop: { start: null, end: null, active: false },
    onEnded: null as (() => void) | null
  }
}

function createFakeMixer(): Record<string, unknown> {
  return {
    setCrossfade: vi.fn(),
    setCueMix: vi.fn(),
    setPhonesGain: vi.fn(),
    setMasterGain: vi.fn(),
    setCue: vi.fn()
  }
}

const engineMock = vi.hoisted(() => ({
  getEngine: vi.fn()
}))

vi.mock('../audio/engine', () => ({
  getEngine: engineMock.getEngine
}))

vi.mock('./useEngineOutput', () => ({
  useEngineOutput: () => ({
    output: {
      devices: [],
      master: { activeDeviceId: 'default', requestedDeviceId: 'default', pending: false, error: null },
      cue: { activeDeviceId: 'default', requestedDeviceId: 'default', pending: false, error: null },
      deviceListError: null
    },
    setMasterDevice: vi.fn(),
    setCueDevice: vi.fn(),
    refreshOutputDevices: vi.fn(async () => undefined)
  })
}))

async function loadUseEngine(): Promise<typeof import('./useEngine').useEngine> {
  const module = await import('./useEngine')
  return module.useEngine
}

describe('useEngine', () => {
  let fakeDeckA: Record<string, unknown>
  let fakeDeckB: Record<string, unknown>
  let fakeMixer: Record<string, unknown>
  let fakeEngine: Record<string, unknown>

  beforeEach(() => {
    vi.resetModules()
    persistenceMock.readPersistedControls.mockReset()
    persistenceMock.persistControls.mockReset()

    fakeDeckA = createFakeDeck()
    fakeDeckB = createFakeDeck()
    fakeMixer = createFakeMixer()
    fakeEngine = {
      deckA: fakeDeckA,
      deckB: fakeDeckB,
      mixer: fakeMixer,
      outputRouter: {
        listOutputDevices: vi.fn(async () => []),
        setMasterDevice: vi.fn(async () => undefined),
        setCueDevice: vi.fn(async () => undefined)
      }
    }

    engineMock.getEngine.mockReset()
    engineMock.getEngine.mockReturnValue(fakeEngine)
  })

  it('restores persisted controls into the engine and mixer on mount', async () => {
    const persisted: PersistedControls = {
      channels: {
        A: { trim: 0.6, eq: { high: 1, mid: -2, low: 3 }, volume: 0.7 },
        B: { trim: 0.5, eq: { high: -1, mid: 2, low: -3 }, volume: 0.4 }
      },
      mixer: { crossfade: 0.25, cueMix: 0.5, phonesVolume: 0.8, masterVolume: 0.6 },
      deckPitch: { A: 2, B: -3 }
    }
    persistenceMock.readPersistedControls.mockReturnValue(persisted)

    const useEngine = await loadUseEngine()
    renderHook(() => useEngine())

    expect(fakeDeckA.setPitch).toHaveBeenCalledWith(2)
    expect(fakeDeckA.setTrim).toHaveBeenCalledWith(0.6)
    expect(fakeDeckA.setEq).toHaveBeenCalledWith('high', 1)
    expect(fakeDeckA.setEq).toHaveBeenCalledWith('mid', -2)
    expect(fakeDeckA.setEq).toHaveBeenCalledWith('low', 3)
    expect(fakeDeckA.setChannelFader).toHaveBeenCalledWith(0.7)

    expect(fakeDeckB.setPitch).toHaveBeenCalledWith(-3)
    expect(fakeDeckB.setTrim).toHaveBeenCalledWith(0.5)
    expect(fakeDeckB.setEq).toHaveBeenCalledWith('high', -1)
    expect(fakeDeckB.setEq).toHaveBeenCalledWith('mid', 2)
    expect(fakeDeckB.setEq).toHaveBeenCalledWith('low', -3)
    expect(fakeDeckB.setChannelFader).toHaveBeenCalledWith(0.4)

    expect(fakeMixer.setCrossfade).toHaveBeenCalledWith(0.25)
    expect(fakeMixer.setCueMix).toHaveBeenCalledWith(0.5)
    expect(fakeMixer.setPhonesGain).toHaveBeenCalledWith(0.8)
    expect(fakeMixer.setMasterGain).toHaveBeenCalledWith(0.6)
  })

  it('does not restore controls when nothing was persisted', async () => {
    persistenceMock.readPersistedControls.mockReturnValue(null)

    const useEngine = await loadUseEngine()
    const { result } = renderHook(() => useEngine())

    expect(fakeDeckA.setPitch).not.toHaveBeenCalled()
    expect(fakeDeckA.setTrim).not.toHaveBeenCalled()
    expect(fakeMixer.setCrossfade).not.toHaveBeenCalled()
    expect(result.current.decks.A.pitch).toBe(0)
  })

  it('wires deck.onEnded to mark the deck stopped and clears it on unmount', async () => {
    persistenceMock.readPersistedControls.mockReturnValue(null)

    const useEngine = await loadUseEngine()
    const { result, unmount } = renderHook(() => useEngine())

    expect(typeof fakeDeckA.onEnded).toBe('function')
    expect(typeof fakeDeckB.onEnded).toBe('function')
    expect(result.current.decks.A.isPlaying).toBe(false)

    act(() => {
      ;(fakeDeckA.onEnded as () => void)()
    })

    expect(result.current.decks.A.isPlaying).toBe(false)

    unmount()

    expect(fakeDeckA.onEnded).toBeNull()
    expect(fakeDeckB.onEnded).toBeNull()
  })

  it('persists controls when a channel value changes', async () => {
    persistenceMock.readPersistedControls.mockReturnValue(null)
    persistenceMock.persistControls.mockClear()

    const useEngine = await loadUseEngine()
    const { result } = renderHook(() => useEngine())

    persistenceMock.persistControls.mockClear()

    act(() => {
      result.current.setTrim('A', 0.5)
    })

    expect(persistenceMock.persistControls).toHaveBeenCalled()
    const calls = persistenceMock.persistControls.mock.calls
    const lastCallArgs = calls[calls.length - 1]
    expect(lastCallArgs?.[0].A.trim).toBe(0.5)
  })
})
