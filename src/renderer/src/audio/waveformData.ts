import { buildMonoSamples } from './monoSamples'

export interface PeakBuckets {
  bucketCount: number
  peaks: Float32Array
  lows: Float32Array
}

export interface WaveformData {
  overview: PeakBuckets
  zoom: PeakBuckets
}

const OVERVIEW_BUCKETS = 2000
const ZOOM_BUCKETS_PER_SECOND = 120
const MIN_ZOOM_BUCKETS = 3000
const MAX_ZOOM_BUCKETS = 24000
const LOW_BAND_CUTOFF_HZ = 180

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

// Exported for use as the reference implementation in waveformData.test.ts, which asserts
// the single-pass merge in buildPeakBucketsMerged is bit-exact against this two-pass
// implementation for realistic buffer lengths.
export function buildPeakBuckets(samples: Float32Array, sampleRate: number, bucketCount: number): PeakBuckets {
  const frameCount = samples.length
  const peaks = new Float32Array(bucketCount * 2)
  const lows = new Float32Array(bucketCount * 2)
  const alpha = 1 - Math.exp((-2 * Math.PI * LOW_BAND_CUTOFF_HZ) / sampleRate)
  let lp1 = 0
  let lp2 = 0

  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const start = Math.floor((bucket / bucketCount) * frameCount)
    const end = Math.max(start + 1, Math.floor(((bucket + 1) / bucketCount) * frameCount))
    let min = 1
    let max = -1
    let lowMin = 1
    let lowMax = -1

    for (let frame = start; frame < end; frame += 1) {
      const sample = samples[frame] ?? 0
      min = Math.min(min, sample)
      max = Math.max(max, sample)
      lp1 += alpha * (sample - lp1)
      lp2 += alpha * (lp1 - lp2)
      lowMin = Math.min(lowMin, lp2)
      lowMax = Math.max(lowMax, lp2)
    }

    peaks[bucket * 2] = min
    peaks[bucket * 2 + 1] = max
    lows[bucket * 2] = lowMin
    lows[bucket * 2 + 1] = lowMax
  }

  return { bucketCount, peaks, lows }
}

interface BucketAccumulator {
  bucketCount: number
  peaks: Float32Array
  lows: Float32Array
  bucketEnds: Int32Array
  bucket: number
  min: number
  max: number
  lowMin: number
  lowMax: number
}

// Precompute each bucket's exclusive end frame using the exact same formula as
// buildPeakBuckets, including its overlap-prone clamp (`start + 1`) for very short
// buffers. Replicating this formula (rather than deriving ends incrementally) is what
// guarantees bit-exact equivalence with the two-pass reference in the realistic regime.
function computeBucketEnds(bucketCount: number, frameCount: number): Int32Array {
  const ends = new Int32Array(bucketCount)

  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const start = Math.floor((bucket / bucketCount) * frameCount)
    const end = Math.max(start + 1, Math.floor(((bucket + 1) / bucketCount) * frameCount))
    ends[bucket] = end
  }

  return ends
}

function createAccumulator(bucketCount: number, frameCount: number): BucketAccumulator {
  return {
    bucketCount,
    peaks: new Float32Array(bucketCount * 2),
    lows: new Float32Array(bucketCount * 2),
    bucketEnds: computeBucketEnds(bucketCount, frameCount),
    bucket: 0,
    min: 1,
    max: -1,
    lowMin: 1,
    lowMax: -1
  }
}

function flushBucket(acc: BucketAccumulator): void {
  acc.peaks[acc.bucket * 2] = acc.min
  acc.peaks[acc.bucket * 2 + 1] = acc.max
  acc.lows[acc.bucket * 2] = acc.lowMin
  acc.lows[acc.bucket * 2 + 1] = acc.lowMax
  acc.min = 1
  acc.max = -1
  acc.lowMin = 1
  acc.lowMax = -1
}

function accumulateFrame(acc: BucketAccumulator, sample: number, lp2: number, frame: number): void {
  if (acc.bucket >= acc.bucketCount) {
    return
  }

  acc.min = Math.min(acc.min, sample)
  acc.max = Math.max(acc.max, sample)
  acc.lowMin = Math.min(acc.lowMin, lp2)
  acc.lowMax = Math.max(acc.lowMax, lp2)

  // A bucket's range can (rarely, for very short buffers) span more than one frame's
  // worth of "current" position, or even end at/before the frame that just filled it if
  // ranges overlap — mirror buildPeakBuckets exactly by flushing every bucket whose end
  // has been reached, in order, before moving on.
  while (acc.bucket < acc.bucketCount && frame + 1 >= acc.bucketEnds[acc.bucket]) {
    flushBucket(acc)
    acc.bucket += 1
  }
}

function toPeakBuckets(acc: BucketAccumulator): PeakBuckets {
  return { bucketCount: acc.bucketCount, peaks: acc.peaks, lows: acc.lows }
}

function buildPeakBucketsMerged(
  samples: Float32Array,
  sampleRate: number,
  overviewBucketCount: number,
  zoomBucketCount: number
): { overview: PeakBuckets; zoom: PeakBuckets } {
  const frameCount = samples.length
  const alpha = 1 - Math.exp((-2 * Math.PI * LOW_BAND_CUTOFF_HZ) / sampleRate)
  let lp1 = 0
  let lp2 = 0

  const overviewAcc = createAccumulator(overviewBucketCount, frameCount)
  const zoomAcc = createAccumulator(zoomBucketCount, frameCount)

  for (let frame = 0; frame < frameCount; frame += 1) {
    const sample = samples[frame] ?? 0
    lp1 += alpha * (sample - lp1)
    lp2 += alpha * (lp1 - lp2)

    accumulateFrame(overviewAcc, sample, lp2, frame)
    accumulateFrame(zoomAcc, sample, lp2, frame)
  }

  return { overview: toPeakBuckets(overviewAcc), zoom: toPeakBuckets(zoomAcc) }
}

function resolveBucketCounts(frameCount: number, duration: number): { overview: number; zoom: number } {
  const overviewBucketCount = Math.min(OVERVIEW_BUCKETS, Math.max(1, frameCount))
  const zoomBucketCount = Math.min(
    Math.max(MIN_ZOOM_BUCKETS, Math.ceil(duration * ZOOM_BUCKETS_PER_SECOND)),
    Math.min(MAX_ZOOM_BUCKETS, Math.max(1, frameCount))
  )

  return { overview: overviewBucketCount, zoom: zoomBucketCount }
}

export function computeWaveformFromSamples(
  samples: Float32Array,
  sampleRate: number,
  frameCount: number,
  duration: number
): WaveformData {
  const { overview: overviewBucketCount, zoom: zoomBucketCount } = resolveBucketCounts(frameCount, duration)

  return buildPeakBucketsMerged(samples, sampleRate, overviewBucketCount, zoomBucketCount)
}

export function computeWaveformData(buffer: AudioBuffer): WaveformData {
  const samples = buildMonoSamples(buffer)

  return computeWaveformFromSamples(samples, buffer.sampleRate, buffer.length, buffer.duration)
}

interface WaveformWorkerRequest {
  requestId: number
  samples: Float32Array
  sampleRate: number
  frameCount: number
  duration: number
}

interface WaveformWorkerSuccessResponse {
  requestId: number
  ok: true
  overviewPeaks: Float32Array
  overviewLows: Float32Array
  overviewBucketCount: number
  zoomPeaks: Float32Array
  zoomLows: Float32Array
  zoomBucketCount: number
}

interface WaveformWorkerErrorResponse {
  requestId: number
  ok: false
  message: string
}

type WaveformWorkerResponse = WaveformWorkerSuccessResponse | WaveformWorkerErrorResponse

let worker: Worker | null = null
let nextRequestId = 0
const pendingRequests = new Map<
  number,
  { resolve: (value: WaveformData) => void; reject: (reason: unknown) => void }
>()

function getWorker(): Worker {
  if (worker) {
    return worker
  }

  const instance = new Worker(new URL('./waveformWorker.ts', import.meta.url), { type: 'module' })

  instance.onmessage = (event: MessageEvent<WaveformWorkerResponse>) => {
    const data = event.data
    const pending = pendingRequests.get(data.requestId)

    if (!pending) {
      return
    }

    pendingRequests.delete(data.requestId)

    if (data.ok) {
      pending.resolve({
        overview: { bucketCount: data.overviewBucketCount, peaks: data.overviewPeaks, lows: data.overviewLows },
        zoom: { bucketCount: data.zoomBucketCount, peaks: data.zoomPeaks, lows: data.zoomLows }
      })
    } else {
      pending.reject(new Error(data.message))
    }
  }

  instance.onerror = (event: ErrorEvent) => {
    for (const [requestId, pending] of pendingRequests) {
      pending.reject(event.error ?? new Error(event.message || 'Waveform worker error'))
      pendingRequests.delete(requestId)
    }

    instance.terminate()
    if (worker === instance) {
      worker = null
    }
  }

  worker = instance
  return instance
}

function hasWorkerSupport(): boolean {
  return typeof Worker !== 'undefined'
}

export async function computeWaveformDataAsync(buffer: AudioBuffer): Promise<WaveformData> {
  if (!hasWorkerSupport()) {
    return computeWaveformData(buffer)
  }

  const samples = buildMonoSamples(buffer)
  const instance = getWorker()
  const requestId = nextRequestId
  nextRequestId += 1

  const request: WaveformWorkerRequest = {
    requestId,
    samples,
    sampleRate: buffer.sampleRate,
    frameCount: buffer.length,
    duration: buffer.duration
  }

  return new Promise<WaveformData>((resolve, reject) => {
    pendingRequests.set(requestId, { resolve, reject })
    instance.postMessage(request, [samples.buffer])
  })
}

export function getPeakAt(buckets: PeakBuckets, index: number): { min: number; max: number } {
  const clampedIndex = clamp(Math.floor(index), 0, buckets.bucketCount - 1)

  return {
    min: buckets.peaks[clampedIndex * 2] ?? 0,
    max: buckets.peaks[clampedIndex * 2 + 1] ?? 0
  }
}

export function getLowPeakAt(buckets: PeakBuckets, index: number): { min: number; max: number } {
  const clampedIndex = clamp(Math.floor(index), 0, buckets.bucketCount - 1)

  return {
    min: buckets.lows[clampedIndex * 2] ?? 0,
    max: buckets.lows[clampedIndex * 2 + 1] ?? 0
  }
}
