import { afterEach, describe, expect, it, vi } from 'vitest'
import { detectBpm } from '../audio/bpm'
import {
  AudioMetadataError,
  closeAudioMetadataContext,
  readAudioMetadata,
  readBpm
} from './audioMetadata'

vi.mock('../audio/bpm', () => ({
  detectBpm: vi.fn()
}))

function installAudioContext(decodeAudioData: (buffer: ArrayBuffer) => Promise<AudioBuffer>) {
  const context = {
    state: 'running' as AudioContextState,
    close: vi.fn(async () => {
      context.state = 'closed'
    }),
    decodeAudioData: vi.fn(decodeAudioData)
  }
  const constructor = vi.fn(function AudioContextMock() {
    return context
  })

  Object.defineProperty(globalThis, 'AudioContext', {
    configurable: true,
    value: constructor
  })

  return { constructor, context }
}

describe('audio metadata', () => {
  afterEach(async () => {
    await closeAudioMetadataContext()
    vi.restoreAllMocks()
    Reflect.deleteProperty(globalThis, 'AudioContext')
  })

  it('decodes once, derives duration and shares cached analysis', async () => {
    const decodedBuffer = { duration: 45 } as AudioBuffer
    const { constructor, context } = installAudioContext(async () => decodedBuffer)
    vi.mocked(detectBpm).mockResolvedValue({ bpm: 126, firstBeatOffset: 0.1 })
    const file = new File(['audio'], 'track.mp3')
    const read = vi.spyOn(file, 'arrayBuffer').mockResolvedValue(new ArrayBuffer(8))

    const [first, second] = await Promise.all([readAudioMetadata(file), readAudioMetadata(file)])

    expect(first).toEqual({ duration: 45, bpm: 126, firstBeatOffset: 0.1 })
    expect(second).toBe(first)
    expect(constructor).toHaveBeenCalledTimes(1)
    expect(context.decodeAudioData).toHaveBeenCalledTimes(1)
    expect(read).toHaveBeenCalledTimes(1)
    expect(detectBpm).toHaveBeenCalledTimes(1)
  })

  it('reuses one analysis context across files', async () => {
    const { constructor } = installAudioContext(async () => ({ duration: 10 } as AudioBuffer))
    vi.mocked(detectBpm).mockResolvedValue({ bpm: 120, firstBeatOffset: 0 })

    await readAudioMetadata(new File(['one'], 'one.mp3'))
    await readAudioMetadata(new File(['two'], 'two.mp3'))

    expect(constructor).toHaveBeenCalledTimes(1)
  })

  it('throws a typed error and evicts failed analysis for retry', async () => {
    const decodedBuffer = { duration: 1 } as AudioBuffer
    const { context } = installAudioContext(
      vi.fn().mockRejectedValueOnce(new Error('decode failed')).mockResolvedValueOnce(decodedBuffer)
    )
    vi.mocked(detectBpm).mockResolvedValue({ bpm: 128, firstBeatOffset: 0.25 })
    const file = new File(['audio'], 'track.mp3')

    await expect(readAudioMetadata(file)).rejects.toBeInstanceOf(AudioMetadataError)
    await expect(readAudioMetadata(file)).resolves.toEqual({ duration: 1, bpm: 128, firstBeatOffset: 0.25 })
    expect(context.decodeAudioData).toHaveBeenCalledTimes(2)
  })

  it('returns the BPM view from the shared metadata result', async () => {
    installAudioContext(async () => ({ duration: 30 } as AudioBuffer))
    vi.mocked(detectBpm).mockResolvedValue({ bpm: 132, firstBeatOffset: 0.3 })

    await expect(readBpm(new File(['audio'], 'track.mp3'))).resolves.toEqual({
      bpm: 132,
      firstBeatOffset: 0.3
    })
  })
})
