import type { Deck } from '../audio/deck'
import type { HotCue, LoopState } from '../audio/deckTypes'
import type { WaveformData } from '../audio/waveformData'

export interface DeckState {
  trackName: string
  duration: number
  position: number
  isPlaying: boolean
  pitch: number
  bpm: number
  firstBeatOffset: number
  artworkUrl?: string
  effectiveBpm: number
  waveform: WaveformData | null
  hotCues: Array<HotCue | null>
  cuePoint: number
  loop: LoopState
}

export const createDeckState = (): DeckState => ({
  trackName: 'No track loaded',
  duration: 0,
  position: 0,
  isPlaying: false,
  pitch: 0,
  bpm: 0,
  firstBeatOffset: 0,
  artworkUrl: undefined,
  effectiveBpm: 0,
  waveform: null,
  hotCues: [null, null, null, null],
  cuePoint: 0,
  loop: { start: null, end: null, active: false }
})

export function getDeckSnapshot(deck: Deck, pitch: number): DeckState {
  return {
    trackName: deck.metadata.name,
    duration: deck.duration,
    position: deck.getPosition(),
    isPlaying: deck.isPlaying,
    pitch,
    bpm: deck.metadata.bpm,
    firstBeatOffset: deck.metadata.firstBeatOffset,
    artworkUrl: deck.metadata.artworkUrl,
    effectiveBpm: deck.getEffectiveBpm(),
    waveform: deck.waveform,
    hotCues: deck.hotCues,
    cuePoint: deck.cuePoint,
    loop: deck.loop
  }
}
