export interface TrackMetadata {
  name: string
  bpm: number
  firstBeatOffset: number
  artworkUrl?: string
}

export interface HotCue {
  position: number
  color: string
}

export interface LoopState {
  start: number | null
  end: number | null
  active: boolean
}

export const HOT_CUE_COLORS = ['#22d3ee', '#f97316', '#a78bfa', '#22c55e'] as const
export const EMPTY_HOT_CUES: Array<HotCue | null> = [null, null, null, null]
export const EMPTY_LOOP: LoopState = { start: null, end: null, active: false }
