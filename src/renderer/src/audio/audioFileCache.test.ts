import { describe, expect, it, vi } from 'vitest'
import { readCachedFileBuffer } from './audioFileCache'

describe('audio file cache', () => {
  it('shares one in-flight file read and evicts failures', async () => {
    const file = new File(['audio'], 'track.mp3')
    const arrayBuffer = vi.spyOn(file, 'arrayBuffer').mockResolvedValue(new ArrayBuffer(8))

    const [first, second] = await Promise.all([readCachedFileBuffer(file), readCachedFileBuffer(file)])

    expect(first).toBe(second)
    expect(arrayBuffer).toHaveBeenCalledTimes(1)

    const failingFile = new File(['broken'], 'broken.mp3')
    const failure = vi
      .spyOn(failingFile, 'arrayBuffer')
      .mockRejectedValueOnce(new Error('read failed'))
      .mockResolvedValueOnce(new ArrayBuffer(4))

    await expect(readCachedFileBuffer(failingFile)).rejects.toThrow('read failed')
    await expect(readCachedFileBuffer(failingFile)).resolves.toHaveProperty('byteLength', 4)
    expect(failure).toHaveBeenCalledTimes(2)
  })
})
