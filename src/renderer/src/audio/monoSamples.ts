export function writeMonoSamples(buffer: AudioBuffer, target: Float32Array, frameCount = target.length): void {
  const sampleCount = Math.max(0, Math.min(frameCount, buffer.length, target.length))
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index))

  if (channels.length === 0) {
    target.fill(0, 0, sampleCount)
    return
  }

  if (channels.length === 1) {
    target.set(channels[0].subarray(0, sampleCount), 0)
    return
  }

  for (let frame = 0; frame < sampleCount; frame += 1) {
    let sample = 0

    for (const channel of channels) {
      sample += channel[frame] ?? 0
    }

    target[frame] = sample / channels.length
  }
}

export function buildMonoSamples(buffer: AudioBuffer, frameCount = buffer.length): Float32Array {
  const sampleCount = Math.max(0, Math.min(frameCount, buffer.length))
  const samples = new Float32Array(sampleCount)

  writeMonoSamples(buffer, samples, sampleCount)
  return samples
}
