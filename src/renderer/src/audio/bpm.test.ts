import { describe, expect, it } from 'vitest'
import { detectBpm, detectBpmFromLowBand } from './bpm'

const SAMPLE_RATE = 44100

interface FixtureOptions {
  bpm: number
  firstBeatOffset: number
  durationSeconds: number
  offbeat?: number
}

/**
 * Synthesizes what `renderLowpassed` would produce for a kick-drum track:
 * a mono Float32Array containing one decaying low-frequency burst per beat,
 * optionally with a smaller off-beat stab at +0.5 beat (the hardhouse case).
 */
function makeLowBandFixture({
  bpm,
  firstBeatOffset,
  durationSeconds,
  offbeat = 0
}: FixtureOptions): Float32Array {
  const length = Math.floor(durationSeconds * SAMPLE_RATE)
  const samples = new Float32Array(length)
  const beatPeriod = 60 / bpm
  const burstDuration = 0.09

  const addBurst = (startTime: number, amplitude: number): void => {
    const startFrame = Math.max(0, Math.floor(startTime * SAMPLE_RATE))
    const endFrame = Math.min(length, Math.floor((startTime + burstDuration) * SAMPLE_RATE))

    for (let frame = startFrame; frame < endFrame; frame += 1) {
      const t = (frame - startFrame) / SAMPLE_RATE
      const value = Math.sin(2 * Math.PI * 55 * t) * Math.exp(-t / 0.03) * amplitude

      samples[frame] += value
    }
  }

  let beatIndex = 0

  while (firstBeatOffset + beatIndex * beatPeriod < durationSeconds) {
    const beatTime = firstBeatOffset + beatIndex * beatPeriod

    addBurst(beatTime, 1)

    if (offbeat > 0) {
      addBurst(beatTime + 0.5 * beatPeriod, offbeat)
    }

    beatIndex += 1
  }

  return samples
}

describe('detectBpmFromLowBand', () => {
  it('detects exact production tempos (145.000)', () => {
    const fixture = makeLowBandFixture({ bpm: 145.0, firstBeatOffset: 0.18, durationSeconds: 40 })
    const result = detectBpmFromLowBand(fixture, SAMPLE_RATE)

    expect(Math.abs(result.bpm - 145.0)).toBeLessThanOrEqual(0.01)
  })

  it('detects exact production tempos (148.000)', () => {
    const fixture = makeLowBandFixture({ bpm: 148.0, firstBeatOffset: 0.32, durationSeconds: 40 })
    const result = detectBpmFromLowBand(fixture, SAMPLE_RATE)

    expect(Math.abs(result.bpm - 148.0)).toBeLessThanOrEqual(0.01)
  })

  it('anchors the grid accurately at 145.000 BPM', () => {
    const bpm = 145.0
    const firstBeatOffset = 0.18
    const fixture = makeLowBandFixture({ bpm, firstBeatOffset, durationSeconds: 40 })
    const result = detectBpmFromLowBand(fixture, SAMPLE_RATE)
    const beatPeriod = 60 / bpm
    const rawDelta = Math.abs(result.firstBeatOffset - (firstBeatOffset % beatPeriod))
    const delta = Math.min(rawDelta, beatPeriod - rawDelta)

    expect(delta).toBeLessThanOrEqual(0.025)
  })

  it('anchors the grid accurately at 148.000 BPM', () => {
    const bpm = 148.0
    const firstBeatOffset = 0.32
    const fixture = makeLowBandFixture({ bpm, firstBeatOffset, durationSeconds: 40 })
    const result = detectBpmFromLowBand(fixture, SAMPLE_RATE)
    const beatPeriod = 60 / bpm
    const rawDelta = Math.abs(result.firstBeatOffset - (firstBeatOffset % beatPeriod))
    const delta = Math.min(rawDelta, beatPeriod - rawDelta)

    expect(delta).toBeLessThanOrEqual(0.025)
  })

  it('stays anchored on the main beat despite off-beat bass stabs (hardhouse case)', () => {
    const bpm = 145.0
    const firstBeatOffset = 0.18
    const fixture = makeLowBandFixture({
      bpm,
      firstBeatOffset,
      durationSeconds: 40,
      offbeat: 0.5
    })
    const result = detectBpmFromLowBand(fixture, SAMPLE_RATE)
    const beatPeriod = 60 / bpm
    const rawDelta = Math.abs(result.firstBeatOffset - (firstBeatOffset % beatPeriod))
    const delta = Math.min(rawDelta, beatPeriod - rawDelta)

    expect(delta).toBeLessThanOrEqual(0.025)

    // The off-beat stab sits half a beat after each main beat, so relative
    // to the grid anchor's own phase reference it lands at
    // (firstBeatOffset + 0.5 * beatPeriod) mod beatPeriod.
    const offbeatPosition = (firstBeatOffset + 0.5 * beatPeriod) % beatPeriod
    const rawOffbeatDelta = Math.abs(result.firstBeatOffset - offbeatPosition)
    const distanceFromOffbeat = Math.min(rawOffbeatDelta, beatPeriod - rawOffbeatDelta)

    expect(distanceFromOffbeat).toBeGreaterThanOrEqual(0.15 * beatPeriod)
  })

  it('octave-normalizes a 90 BPM fixture instead of detecting 180', () => {
    const fixture = makeLowBandFixture({ bpm: 90, firstBeatOffset: 0.2, durationSeconds: 40 })
    const result = detectBpmFromLowBand(fixture, SAMPLE_RATE)

    expect(Math.abs(result.bpm - 90)).toBeLessThanOrEqual(0.05)
  })

  it('returns zeroed result for silence', () => {
    const fixture = new Float32Array(Math.floor(40 * SAMPLE_RATE))
    const result = detectBpmFromLowBand(fixture, SAMPLE_RATE)

    expect(result).toEqual({ bpm: 0, firstBeatOffset: 0 })
  })

  it('returns zeroed result for empty input without throwing', () => {
    const fixture = new Float32Array(0)

    expect(() => detectBpmFromLowBand(fixture, SAMPLE_RATE)).not.toThrow()

    const result = detectBpmFromLowBand(fixture, SAMPLE_RATE)

    expect(result).toEqual({ bpm: 0, firstBeatOffset: 0 })
  })
})

describe('detectBpm', () => {
  it('resolves to a zeroed result for zero-duration buffers without touching OfflineAudioContext', async () => {
    const fakeBuffer = { duration: 0 } as AudioBuffer
    const result = await detectBpm(fakeBuffer)

    expect(result).toEqual({ bpm: 0, firstBeatOffset: 0 })
  })
})
