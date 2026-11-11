import { beforeEach, describe, expect, it } from 'vitest'
import {
  CONTROLS_STORAGE_KEY,
  parsePersistedControls,
  persistControls,
  readPersistedControls
} from './enginePersistence'
import type { ChannelState, DeckId } from '../app/engineTypes'

const channels: Record<DeckId, ChannelState> = {
  A: { trim: 1.2, eq: { high: 1, mid: 2, low: 3 }, volume: 0.8, cue: true },
  B: { trim: 0.9, eq: { high: -1, mid: -2, low: -3 }, volume: 0.7, cue: false }
}

describe('engine persistence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('falls back safely on invalid JSON', () => {
    expect(parsePersistedControls('{oops').mixer.masterVolume).toBe(0.9)
  })

  it('migrates saved mixer controls without a headphones level', () => {
    const parsed = parsePersistedControls(JSON.stringify({ mixer: { cueMix: 0.4, masterVolume: 0.7 } }))

    expect(parsed.mixer).toMatchObject({ cueMix: 0.4, phonesVolume: 1, masterVolume: 0.7 })
  })

  it('clamps persisted controls to supported ranges', () => {
    const parsed = parsePersistedControls(
      JSON.stringify({
        channels: { A: { trim: 10, volume: -2, eq: { high: 99, mid: -99, low: 2 } } },
        mixer: { crossfade: 9, cueMix: -1, phonesVolume: -2, masterVolume: 4 },
        deckPitch: { A: 40, B: -40 }
      })
    )

    expect(parsed.channels.A.trim).toBe(1.5)
    expect(parsed.channels.A.volume).toBe(0)
    expect(parsed.channels.A.eq.high).toBe(6)
    expect(parsed.channels.A.eq.mid).toBe(-26)
    expect(parsed.mixer.crossfade).toBe(1)
    expect(parsed.mixer.cueMix).toBe(0)
    expect(parsed.mixer.phonesVolume).toBe(0)
    expect(parsed.deckPitch.A).toBe(16)
    expect(parsed.deckPitch.B).toBe(-16)
  })

  it('round-trips persisted controls through localStorage', () => {
    persistControls(
      channels,
      { crossfade: 0.25, cueMix: 0.5, phonesVolume: 0.6, masterVolume: 0.75 },
      { A: 1.5, B: -2.5 }
    )

    expect(localStorage.getItem(CONTROLS_STORAGE_KEY)).not.toBeNull()
    expect(readPersistedControls().mixer.phonesVolume).toBe(0.6)
    expect(readPersistedControls().deckPitch).toEqual({ A: 1.5, B: -2.5 })
  })
})
