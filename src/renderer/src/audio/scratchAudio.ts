const GRAIN_SECONDS = 0.065
const MAX_ACTIVE_GRAINS = 4

export function createScratchGrain(
  context: AudioContext,
  source: AudioBuffer,
  positionSeconds: number,
  direction: -1 | 1
): AudioBuffer {
  const frameCount = Math.max(1, Math.round(source.sampleRate * GRAIN_SECONDS))
  const grain = context.createBuffer(source.numberOfChannels, frameCount, source.sampleRate)
  const positionFrame = Math.round(positionSeconds * source.sampleRate)

  for (let channel = 0; channel < source.numberOfChannels; channel += 1) {
    const sourceData = source.getChannelData(channel)
    const grainData = grain.getChannelData(channel)

    for (let frame = 0; frame < frameCount; frame += 1) {
      const sourceFrame = positionFrame + (direction > 0 ? frame : -frame - 1)
      grainData[frame] = sourceFrame >= 0 && sourceFrame < source.length ? sourceData[sourceFrame] : 0
    }
  }

  return grain
}

export class ScratchAudio {
  private readonly activeGrains: Array<{ envelope: GainNode; source: AudioBufferSourceNode }> = []

  constructor(
    private readonly context: AudioContext,
    private readonly destination: AudioNode
  ) {}

  play(buffer: AudioBuffer, positionSeconds: number, direction: -1 | 1): void {
    if (this.context.state === 'suspended') {
      void this.context.resume()
    }

    while (this.activeGrains.length >= MAX_ACTIVE_GRAINS) {
      this.stopGrain(this.activeGrains[0])
    }

    const source = this.context.createBufferSource()
    const envelope = this.context.createGain()
    const now = this.context.currentTime

    source.buffer = createScratchGrain(this.context, buffer, positionSeconds, direction)
    envelope.gain.setValueAtTime(0, now)
    envelope.gain.linearRampToValueAtTime(1, now + 0.006)
    envelope.gain.setValueAtTime(1, now + GRAIN_SECONDS - 0.012)
    envelope.gain.linearRampToValueAtTime(0, now + GRAIN_SECONDS)
    source.connect(envelope)
    envelope.connect(this.destination)
    source.onended = () => {
      const grain = this.activeGrains.find((active) => active.source === source)

      if (grain) {
        this.removeGrain(grain)
      }
    }
    this.activeGrains.push({ envelope, source })
    source.start(now)
  }

  stop(): void {
    for (const grain of [...this.activeGrains]) {
      this.stopGrain(grain)
    }
  }

  private stopGrain(grain: { envelope: GainNode; source: AudioBufferSourceNode }): void {
    grain.source.onended = null
    grain.source.stop()
    this.removeGrain(grain)
  }

  private removeGrain(grain: { envelope: GainNode; source: AudioBufferSourceNode }): void {
    const index = this.activeGrains.indexOf(grain)

    if (index >= 0) {
      this.activeGrains.splice(index, 1)
    }

    grain.source.disconnect()
    grain.envelope.disconnect()
  }
}
