import { detectBpm } from '../audio/bpm'
import { readCachedFileBuffer } from '../audio/audioFileCache'
import { measureAsync } from '../performance/perfMarks'
import { createEmbeddedArtworkUrl } from './audioArtwork'

export interface AudioMetadata {
  duration: number
  bpm: number
  firstBeatOffset: number
  artworkUrl?: string
}

export class AudioMetadataError extends Error {
  readonly cause: unknown

  constructor(fileName: string, cause?: unknown) {
    super(`Could not analyze "${fileName}".`)
    this.name = 'AudioMetadataError'
    this.cause = cause
  }
}

let analysisContext: AudioContext | null = null
let metadataCache = new WeakMap<File, Promise<AudioMetadata>>()

function getAnalysisContext(): AudioContext {
  if (!analysisContext || analysisContext.state === 'closed') {
    analysisContext = new AudioContext()
  }

  return analysisContext
}

async function analyzeAudioFile(file: File): Promise<AudioMetadata> {
  const context = getAnalysisContext()

  try {
    const arrayBuffer = await measureAsync('library.audioMetadata.readFile', () => readCachedFileBuffer(file))
    const buffer = await measureAsync('library.audioMetadata.decodeAudioData', () =>
      context.decodeAudioData(arrayBuffer.slice(0))
    )
    const bpm = await measureAsync('library.audioMetadata.detectBpm', () => detectBpm(buffer))
    const artworkUrl = createEmbeddedArtworkUrl(arrayBuffer)

    return {
      duration: Number.isFinite(buffer.duration) ? buffer.duration : 0,
      ...(artworkUrl ? { artworkUrl } : {}),
      ...bpm
    }
  } catch (error) {
    throw new AudioMetadataError(file.name, error)
  }
}

export function readAudioMetadata(file: File): Promise<AudioMetadata> {
  const cached = metadataCache.get(file)

  if (cached) {
    return cached
  }

  const analysis = analyzeAudioFile(file).catch((error) => {
    metadataCache.delete(file)
    throw error
  })

  metadataCache.set(file, analysis)
  return analysis
}

export async function readBpm(file: File): Promise<{ bpm: number; firstBeatOffset: number }> {
  const { bpm, firstBeatOffset } = await readAudioMetadata(file)
  return { bpm, firstBeatOffset }
}

export async function closeAudioMetadataContext(): Promise<void> {
  const context = analysisContext
  analysisContext = null
  metadataCache = new WeakMap<File, Promise<AudioMetadata>>()

  if (context && context.state !== 'closed') {
    await context.close()
  }
}
