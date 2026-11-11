import { describe, expect, it, vi } from 'vitest'
import { DeckTrackLoader } from './deckTrackLoader'

vi.mock('./bpm', () => ({
  detectBpm: vi.fn(async () => ({ bpm: 128, firstBeatOffset: 0.125 }))
}))

function createBufferFromData(channels: Float32Array[], sampleRate: number): AudioBuffer {
  return {
    duration: channels[0].length / sampleRate,
    length: channels[0].length,
    numberOfChannels: channels.length,
    sampleRate,
    getChannelData: (channel: number) => channels[channel]
  } as unknown as AudioBuffer
}

function createBuffer(duration: number): AudioBuffer {
  return createBufferFromData([new Float32Array(duration * 100)], 100)
}

function createDeferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolvePromise = (_value: T): void => undefined
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve
  })

  return { promise, resolve: resolvePromise }
}

class FakeAudioContext {
  decodeAudioData = vi.fn(async () => createBuffer(10))
}

function createLoader(): { context: FakeAudioContext; loader: DeckTrackLoader } {
  const context = new FakeAudioContext()
  const loader = new DeckTrackLoader(context as unknown as AudioContext)

  return { context, loader }
}

describe('DeckTrackLoader', () => {
  it('resolves with prepared track data on a normal load', async () => {
    const { loader } = createLoader()

    const result = await loader.prepare(new ArrayBuffer(8), { bpm: 120, firstBeatOffset: 0.25 })

    expect(result).not.toBeNull()
    expect(result?.metadata.bpm).toBe(120)
    expect(result?.waveform.overview.bucketCount).toBeGreaterThan(0)
    expect(result?.waveform.zoom.bucketCount).toBeGreaterThan(0)
  })

  it('returns null for a stale prepare() call started before a newer one resolves', async () => {
    const { context, loader } = createLoader()
    const deferred = createDeferred<AudioBuffer>()

    context.decodeAudioData.mockReturnValueOnce(deferred.promise)

    const stalePromise = loader.prepare(new ArrayBuffer(8), { bpm: 120, firstBeatOffset: 0.25 })

    // Second prepare() call starts (and completes) while the first is still awaiting decode.
    context.decodeAudioData.mockResolvedValueOnce(createBuffer(5))
    const freshResult = await loader.prepare(new ArrayBuffer(8), { bpm: 140, firstBeatOffset: 0.5 })

    deferred.resolve(createBuffer(10))
    const staleResult = await stalePromise

    expect(staleResult).toBeNull()
    expect(freshResult).not.toBeNull()
    expect(freshResult?.metadata.bpm).toBe(140)
  })
})
