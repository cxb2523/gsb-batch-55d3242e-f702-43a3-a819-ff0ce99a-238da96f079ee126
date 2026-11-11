import { measureAsync } from '../performance/perfMarks'
import { readCachedFileBuffer } from './audioFileCache'
import { detectBpm } from './bpm'
import type { TrackMetadata } from './deckTypes'
import { computeWaveformDataAsync, type WaveformData } from './waveformData'

export interface DeckLoadAnalysis {
  bpm: number
  firstBeatOffset: number
  artworkUrl?: string
}

export interface PreparedDeckTrack {
  buffer: AudioBuffer
  duration: number
  metadata: TrackMetadata
  persistenceKey: string
  waveform: WaveformData
}

export class DeckTrackLoader {
  private intent = 0

  constructor(private readonly context: AudioContext) {}

  async prepare(
    file: File | ArrayBuffer,
    analysis?: DeckLoadAnalysis,
    persistenceKey?: string
  ): Promise<PreparedDeckTrack | null> {
    const intent = ++this.intent
    const arrayBuffer =
      file instanceof File ? await measureAsync('deck.loadFile.readFile', () => readCachedFileBuffer(file)) : file
    const decoded = await measureAsync('deck.loadFile.decodeAudioData', () =>
      this.context.decodeAudioData(arrayBuffer.slice(0))
    )

    if (intent !== this.intent) {
      return null
    }

    const waveform = await measureAsync('deck.loadFile.computeWaveform', () => computeWaveformDataAsync(decoded))

    if (intent !== this.intent) {
      return null
    }

    const detected =
      analysis && analysis.bpm > 0 && Number.isFinite(analysis.bpm) && Number.isFinite(analysis.firstBeatOffset)
        ? analysis
        : await measureAsync('deck.loadFile.detectBpm', () => detectBpm(decoded))

    if (intent !== this.intent) {
      return null
    }

    const name = file instanceof File ? file.name : 'Loaded audio'

    return {
      buffer: decoded,
      duration: decoded.duration,
      metadata: { name, ...detected, artworkUrl: analysis?.artworkUrl },
      persistenceKey: persistenceKey ?? name,
      waveform
    }
  }
}
