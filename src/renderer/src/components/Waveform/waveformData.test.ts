import { describe, expect, it, vi } from 'vitest'
import {
  buildPeakBuckets,
  computeWaveformData,
  computeWaveformDataAsync,
  computeWaveformFromSamples,
  getLowPeakAt,
  getPeakAt
} from '../../audio/waveformData'

// Deterministic pseudo-random generator (mulberry32) so fixtures are reproducible.
function mulberry32(seed: number): () => number {
  let a = seed

  return function random() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function generateSamples(length: number, seed: number): Float32Array {
  const random = mulberry32(seed)
  const samples = new Float32Array(length)

  for (let i = 0; i < length; i += 1) {
    samples[i] = Math.sin(i * 0.01) * 0.5 + (random() - 0.5) * 0.5
  }

  return samples
}

const SAMPLE_RATE = 44100
const OVERVIEW_BUCKETS = 2000
const ZOOM_BUCKETS_PER_SECOND = 120
const MIN_ZOOM_BUCKETS = 3000
const MAX_ZOOM_BUCKETS = 24000

function referenceBucketCounts(frameCount: number, duration: number): { overview: number; zoom: number } {
  const overview = Math.min(OVERVIEW_BUCKETS, Math.max(1, frameCount))
  const zoom = Math.min(
    Math.max(MIN_ZOOM_BUCKETS, Math.ceil(duration * ZOOM_BUCKETS_PER_SECOND)),
    Math.min(MAX_ZOOM_BUCKETS, Math.max(1, frameCount))
  )

  return { overview, zoom }
}

function createAudioBuffer(channels: number[][], sampleRate = 1): AudioBuffer {
  const length = Math.max(...channels.map((channel) => channel.length))

  return {
    duration: length / sampleRate,
    length,
    numberOfChannels: channels.length,
    sampleRate,
    getChannelData: (index: number) => Float32Array.from(channels[index] ?? [])
  } as AudioBuffer
}

describe('waveform data', () => {
  it('builds min/max peak buckets from mono samples', () => {
    const waveform = computeWaveformData(createAudioBuffer([[-1, -0.5, 0.25, 0.75]], 4))

    expect(waveform.overview.bucketCount).toBe(4)
    expect(getPeakAt(waveform.overview, 0)).toEqual({ min: -1, max: -1 })
    expect(getPeakAt(waveform.overview, 3)).toEqual({ min: 0.75, max: 0.75 })
  })

  it('mixes channels before calculating peaks', () => {
    const waveform = computeWaveformData(
      createAudioBuffer([
        [1, -1],
        [-0.5, 0.25]
      ])
    )

    expect(getPeakAt(waveform.overview, 0)).toEqual({ min: 0.25, max: 0.25 })
    expect(getPeakAt(waveform.overview, 1)).toEqual({ min: -0.375, max: -0.375 })
  })

  it('clamps peak lookup indexes', () => {
    const waveform = computeWaveformData(createAudioBuffer([[0.2, 0.8]]))

    expect(getPeakAt(waveform.overview, -10).min).toBeCloseTo(0.2)
    expect(getPeakAt(waveform.overview, -10).max).toBeCloseTo(0.2)
    expect(getPeakAt(waveform.overview, 100).min).toBeCloseTo(0.8)
    expect(getPeakAt(waveform.overview, 100).max).toBeCloseTo(0.8)
  })

  it('keeps a low-band peak track alongside full-range peaks', () => {
    const waveform = computeWaveformData(createAudioBuffer([Array.from({ length: 4000 }, () => 1)], 48_000))
    const low = getLowPeakAt(waveform.overview, 10)

    expect(low.max).toBeGreaterThan(low.min)
    expect(low.max).toBeLessThan(1)
  })

  it('mixes channel data once before building overview and zoom buckets', () => {
    const getChannelData = vi.fn((index: number) => Float32Array.from(index === 0 ? [1, 0] : [0, 1]))
    const buffer = {
      duration: 2,
      length: 2,
      numberOfChannels: 2,
      sampleRate: 1,
      getChannelData
    } as unknown as AudioBuffer

    computeWaveformData(buffer)

    expect(getChannelData).toHaveBeenCalledTimes(2)
    expect(getChannelData).toHaveBeenNthCalledWith(1, 0)
    expect(getChannelData).toHaveBeenNthCalledWith(2, 1)
  })
})

describe('computeWaveformFromSamples single-pass equivalence (realistic buffer lengths)', () => {
  // Both lengths are chosen so frames do not divide evenly by bucket counts, and both are
  // comfortably above MIN_ZOOM_BUCKETS (3000) so buildPeakBuckets's per-bucket frame ranges
  // never overlap in this regime — the merged single pass must match it bit-for-bit.
  const REALISTIC_LENGTHS = [44101, 123457]
  const SEEDS = [1, 2, 3]

  for (const length of REALISTIC_LENGTHS) {
    for (const seed of SEEDS) {
      it(`matches the two-pass reference for length=${length} seed=${seed}`, () => {
        const samples = generateSamples(length, length + seed)
        const duration = length / SAMPLE_RATE
        const { overview: overviewBucketCount, zoom: zoomBucketCount } = referenceBucketCounts(length, duration)

        const refOverview = buildPeakBuckets(samples, SAMPLE_RATE, overviewBucketCount)
        const refZoom = buildPeakBuckets(samples, SAMPLE_RATE, zoomBucketCount)
        const merged = computeWaveformFromSamples(samples, SAMPLE_RATE, length, duration)

        expect(merged.overview.bucketCount).toBe(overviewBucketCount)
        expect(merged.zoom.bucketCount).toBe(zoomBucketCount)
        expect(Array.from(merged.overview.peaks)).toEqual(Array.from(refOverview.peaks))
        expect(Array.from(merged.overview.lows)).toEqual(Array.from(refOverview.lows))
        expect(Array.from(merged.zoom.peaks)).toEqual(Array.from(refZoom.peaks))
        expect(Array.from(merged.zoom.lows)).toEqual(Array.from(refZoom.lows))
      })
    }
  }

  // Short-buffer sanity test (NOT an equivalence test). Below ~3000 samples,
  // buildPeakBuckets's per-bucket range clamp (`end = Math.max(start + 1, ...)`) can make
  // bucket ranges overlap. Because the IIR low-band filter runs continuously across the
  // whole scan, an overlapped frame gets fed through the filter more than once in the
  // two-pass reference. The merged single pass computes the filter exactly once per frame,
  // so it cannot (and should not) reproduce that double-application here — this is expected
  // divergence, not a bug, so we only assert the merged output is well-formed, not equal to
  // buildPeakBuckets's output.
  it('produces well-formed (but not necessarily equal) output for a short buffer', () => {
    const length = 733
    const samples = generateSamples(length, 99)
    const duration = length / SAMPLE_RATE
    const { overview: overviewBucketCount, zoom: zoomBucketCount } = referenceBucketCounts(length, duration)

    const merged = computeWaveformFromSamples(samples, SAMPLE_RATE, length, duration)

    expect(merged.overview.bucketCount).toBe(overviewBucketCount)
    expect(merged.zoom.bucketCount).toBe(zoomBucketCount)

    for (const buckets of [merged.overview, merged.zoom]) {
      for (let i = 0; i < buckets.bucketCount; i += 1) {
        const min = buckets.peaks[i * 2]
        const max = buckets.peaks[i * 2 + 1]

        expect(Number.isFinite(min)).toBe(true)
        expect(Number.isFinite(max)).toBe(true)
        expect(min).toBeLessThanOrEqual(max)
      }
    }
  })
})

describe('computeWaveformFromSamples bucket-count clamps', () => {
  it('clamps to MIN_ZOOM_BUCKETS and full overview range for a short (1s) input', () => {
    const length = SAMPLE_RATE // 1 second at 44.1kHz
    const samples = generateSamples(length, 11)
    const duration = length / SAMPLE_RATE

    const waveform = computeWaveformFromSamples(samples, SAMPLE_RATE, length, duration)

    expect(waveform.overview.bucketCount).toBe(OVERVIEW_BUCKETS)
    expect(waveform.zoom.bucketCount).toBe(MIN_ZOOM_BUCKETS)
  })

  it('clamps to MAX_ZOOM_BUCKETS for a long (>200s) input', () => {
    const durationSeconds = 210
    const length = durationSeconds * SAMPLE_RATE
    const samples = generateSamples(1000, 22) // representative sample data; length param drives bucket math
    const paddedSamples = new Float32Array(length)
    paddedSamples.set(samples.subarray(0, Math.min(samples.length, length)))

    const waveform = computeWaveformFromSamples(paddedSamples, SAMPLE_RATE, length, durationSeconds)

    expect(waveform.overview.bucketCount).toBe(OVERVIEW_BUCKETS)
    // durationSeconds * ZOOM_BUCKETS_PER_SECOND = 210 * 120 = 25200, clamped to MAX_ZOOM_BUCKETS
    expect(waveform.zoom.bucketCount).toBe(MAX_ZOOM_BUCKETS)
  })
})

describe('computeWaveformDataAsync', () => {
  it('falls back to the sync path and resolves with correct data when Worker is undefined (jsdom default)', async () => {
    expect(typeof Worker).toBe('undefined')

    const buffer = createAudioBuffer([[-1, -0.5, 0.25, 0.75]], 4)
    const [syncResult, asyncResult] = await Promise.all([
      Promise.resolve(computeWaveformData(buffer)),
      computeWaveformDataAsync(buffer)
    ])

    expect(asyncResult.overview.bucketCount).toBe(syncResult.overview.bucketCount)
    expect(Array.from(asyncResult.overview.peaks)).toEqual(Array.from(syncResult.overview.peaks))
    expect(Array.from(asyncResult.overview.lows)).toEqual(Array.from(syncResult.overview.lows))
    expect(Array.from(asyncResult.zoom.peaks)).toEqual(Array.from(syncResult.zoom.peaks))
    expect(getPeakAt(asyncResult.overview, 0)).toEqual({ min: -1, max: -1 })
    expect(getPeakAt(asyncResult.overview, 3)).toEqual({ min: 0.75, max: 0.75 })
  })

  it('discards a failed worker so the next request can create a fresh one', async () => {
    const instances: Array<{
      onerror: ((event: ErrorEvent) => void) | null
      postMessage: ReturnType<typeof vi.fn>
      terminate: ReturnType<typeof vi.fn>
    }> = []

    class FakeWorker {
      onmessage: ((event: MessageEvent) => void) | null = null
      onerror: ((event: ErrorEvent) => void) | null = null
      postMessage = vi.fn()
      terminate = vi.fn()

      constructor() {
        instances.push(this)
      }
    }

    vi.stubGlobal('Worker', FakeWorker)
    const buffer = createAudioBuffer([[-1, 0, 1]], 3)
    const firstRequest = computeWaveformDataAsync(buffer)
    const firstWorker = instances[0]

    firstWorker.onerror?.({ message: 'worker crashed', error: new Error('worker crashed') } as ErrorEvent)

    await expect(firstRequest).rejects.toThrow('worker crashed')
    expect(firstWorker.terminate).toHaveBeenCalledOnce()

    const secondRequest = computeWaveformDataAsync(buffer)
    expect(instances).toHaveLength(2)
    instances[1].onerror?.({ message: 'cleanup', error: new Error('cleanup') } as ErrorEvent)
    await expect(secondRequest).rejects.toThrow('cleanup')

    vi.unstubAllGlobals()
  })
})
