import { describe, expect, it, vi } from 'vitest'
import { buildMonoSamples, writeMonoSamples } from './monoSamples'

function createAudioBuffer(channels: number[][]): AudioBuffer {
  const length = Math.max(0, ...channels.map((channel) => channel.length))

  return {
    duration: length,
    length,
    numberOfChannels: channels.length,
    sampleRate: 1,
    getChannelData: (index: number) => Float32Array.from(channels[index] ?? [])
  } as AudioBuffer
}

describe('mono samples', () => {
  it('returns silence when a buffer has no channels', () => {
    expect(Array.from(buildMonoSamples(createAudioBuffer([]), 3))).toEqual([])
  })

  it('copies mono data up to the requested frame count', () => {
    expect(Array.from(buildMonoSamples(createAudioBuffer([[1, -1, 0.5]]), 2))).toEqual([1, -1])
  })

  it('averages multichannel samples', () => {
    expect(
      Array.from(
        buildMonoSamples(
          createAudioBuffer([
            [1, -1],
            [-0.5, 0.25]
          ])
        )
      )
    ).toEqual([0.25, -0.375])
  })

  it('reads each channel once even when many frames are requested', () => {
    const getChannelData = vi.fn((index: number) => Float32Array.from(index === 0 ? [1, 0, 1] : [0, 1, 0]))
    const buffer = {
      duration: 3,
      length: 3,
      numberOfChannels: 2,
      sampleRate: 1,
      getChannelData
    } as unknown as AudioBuffer

    buildMonoSamples(buffer)

    expect(getChannelData).toHaveBeenCalledTimes(2)
    expect(getChannelData).toHaveBeenNthCalledWith(1, 0)
    expect(getChannelData).toHaveBeenNthCalledWith(2, 1)
  })

  it('writes mono samples into an existing target without resizing it', () => {
    const target = new Float32Array([9, 9, 9, 9])

    writeMonoSamples(
      createAudioBuffer([
        [1, -1, 0.5],
        [0, 1, 0.5]
      ]),
      target,
      2
    )

    expect(Array.from(target)).toEqual([0.5, 0, 9, 9])
  })
})
