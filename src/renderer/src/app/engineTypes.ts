import type { EqBand } from '../audio/deck'
import type { OutputDeviceInfo } from '../audio/output'

export type DeckId = 'A' | 'B'

export interface ChannelState {
  trim: number
  eq: Record<EqBand, number>
  volume: number
  cue: boolean
}

export interface MixerState {
  crossfade: number
  cueMix: number
  phonesVolume: number
  masterVolume: number
}

export interface OutputRouteState {
  activeDeviceId: string
  requestedDeviceId: string
  pending: boolean
  error: string | null
}

export interface OutputState {
  devices: OutputDeviceInfo[]
  master: OutputRouteState
  cue: OutputRouteState
  deviceListError: string | null
}
