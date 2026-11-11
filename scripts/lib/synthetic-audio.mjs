import { Buffer } from 'node:buffer'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export function createSyntheticWavBuffer({ durationSeconds = 2, frequencyHz = 440, sampleRate = 44100 } = {}) {
  const channelCount = 1
  const bitsPerSample = 16
  const bytesPerSample = bitsPerSample / 8
  const sampleCount = Math.floor(durationSeconds * sampleRate)
  const dataSize = sampleCount * channelCount * bytesPerSample
  const buffer = Buffer.alloc(44 + dataSize)

  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(channelCount, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * channelCount * bytesPerSample, 28)
  buffer.writeUInt16LE(channelCount * bytesPerSample, 32)
  buffer.writeUInt16LE(bitsPerSample, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)

  for (let index = 0; index < sampleCount; index += 1) {
    const sample = Math.sin((2 * Math.PI * frequencyHz * index) / sampleRate)
    buffer.writeInt16LE(Math.round(sample * 0x4fff), 44 + index * bytesPerSample)
  }

  return buffer
}

export async function createSyntheticAudioFile(options) {
  const directory = await mkdtemp(join(tmpdir(), 'nextdj-perf-'))
  const filePath = join(directory, 'synthetic-track.wav')

  await writeFile(filePath, createSyntheticWavBuffer(options))

  return {
    filePath,
    remove: () => rm(directory, { force: true, recursive: true })
  }
}
