import { MAX_PITCH_PERCENT, MIN_PITCH_PERCENT } from '../audio/deck'
import { clamp } from './engineMath'
import type { ChannelState, DeckId, MixerState } from '../app/engineTypes'

export const CONTROLS_STORAGE_KEY = 'nextdj.controls.v1'

export interface PersistedControls {
  channels: Record<DeckId, Pick<ChannelState, 'trim' | 'eq' | 'volume'>>
  mixer: MixerState
  deckPitch: Record<DeckId, number>
}

export const DEFAULT_PITCH: Record<DeckId, number> = { A: 0, B: 0 }

export const createChannelState = (): ChannelState => ({
  trim: 1,
  eq: { high: 0, mid: 0, low: 0 },
  volume: 1,
  cue: false
})

export const createMixerState = (): MixerState => ({
  crossfade: 0,
  cueMix: 0,
  phonesVolume: 1,
  masterVolume: 0.9
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function numberFromRecord(
  value: Record<string, unknown> | undefined,
  key: string,
  fallback: number,
  min: number,
  max: number
): number {
  const nextValue = value?.[key]
  return typeof nextValue === 'number' && Number.isFinite(nextValue)
    ? clamp(nextValue, min, max)
    : fallback
}

export function parsePersistedControls(rawValue: string | null): PersistedControls {
  const fallbackChannels: Record<DeckId, ChannelState> = {
    A: createChannelState(),
    B: createChannelState()
  }
  const fallbackMixer = createMixerState()

  try {
    const parsed = JSON.parse(rawValue ?? '{}') as unknown
    const root = isRecord(parsed) ? parsed : {}
    const channelsRoot = isRecord(root.channels) ? root.channels : {}
    const mixerRoot = isRecord(root.mixer) ? root.mixer : {}
    const pitchRoot = isRecord(root.deckPitch) ? root.deckPitch : {}

    const readChannel = (deckId: DeckId): Pick<ChannelState, 'trim' | 'eq' | 'volume'> => {
      const channelRoot = isRecord(channelsRoot[deckId]) ? channelsRoot[deckId] : {}
      const eqRoot = isRecord(channelRoot.eq) ? channelRoot.eq : {}
      const fallback = fallbackChannels[deckId]

      return {
        trim: numberFromRecord(channelRoot, 'trim', fallback.trim, 0, 1.5),
        volume: numberFromRecord(channelRoot, 'volume', fallback.volume, 0, 1),
        eq: {
          high: numberFromRecord(eqRoot, 'high', fallback.eq.high, -26, 6),
          mid: numberFromRecord(eqRoot, 'mid', fallback.eq.mid, -26, 6),
          low: numberFromRecord(eqRoot, 'low', fallback.eq.low, -26, 6)
        }
      }
    }

    return {
      channels: {
        A: readChannel('A'),
        B: readChannel('B')
      },
      mixer: {
        crossfade: numberFromRecord(mixerRoot, 'crossfade', fallbackMixer.crossfade, -1, 1),
        cueMix: numberFromRecord(mixerRoot, 'cueMix', fallbackMixer.cueMix, 0, 1),
        phonesVolume: numberFromRecord(mixerRoot, 'phonesVolume', fallbackMixer.phonesVolume, 0, 1),
        masterVolume: numberFromRecord(mixerRoot, 'masterVolume', fallbackMixer.masterVolume, 0, 1)
      },
      deckPitch: {
        A: numberFromRecord(pitchRoot, 'A', DEFAULT_PITCH.A, MIN_PITCH_PERCENT, MAX_PITCH_PERCENT),
        B: numberFromRecord(pitchRoot, 'B', DEFAULT_PITCH.B, MIN_PITCH_PERCENT, MAX_PITCH_PERCENT)
      }
    }
  } catch {
    return {
      channels: fallbackChannels,
      mixer: fallbackMixer,
      deckPitch: DEFAULT_PITCH
    }
  }
}

export function readPersistedControls(): PersistedControls {
  return parsePersistedControls(localStorage.getItem(CONTROLS_STORAGE_KEY))
}

export function persistControls(
  channels: Record<DeckId, ChannelState>,
  mixer: MixerState,
  deckPitch: Record<DeckId, number>
): void {
  const payload: PersistedControls = {
    channels: {
      A: { trim: channels.A.trim, eq: channels.A.eq, volume: channels.A.volume },
      B: { trim: channels.B.trim, eq: channels.B.eq, volume: channels.B.volume }
    },
    mixer,
    deckPitch
  }

  localStorage.setItem(CONTROLS_STORAGE_KEY, JSON.stringify(payload))
}
