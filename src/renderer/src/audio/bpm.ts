import { writeMonoSamples } from './monoSamples'

export interface BpmDetectionResult {
  bpm: number
  firstBeatOffset: number
}

const LOWPASS_FREQUENCY = 150
const TEMPO_WINDOW = 1024
const ANCHOR_WINDOW = 512
const FOLD_BINS = 256
const MIN_TEMPO = 70
const MAX_TEMPO = 180
const MIN_PEAK_DISTANCE_SECONDS = 0.22
const MAX_ANALYSIS_SECONDS = 240

function normalizeTempo(bpm: number): number {
  let normalized = bpm

  while (normalized < MIN_TEMPO) {
    normalized *= 2
  }

  while (normalized > MAX_TEMPO) {
    normalized /= 2
  }

  return normalized
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0
  }

  const sorted = [...values].sort((a, b) => a - b)
  const midpoint = Math.floor(sorted.length / 2)

  return sorted.length % 2 === 0 ? (sorted[midpoint - 1] + sorted[midpoint]) / 2 : sorted[midpoint]
}

async function renderLowpassed(buffer: AudioBuffer): Promise<AudioBuffer> {
  const frameCount = Math.min(buffer.length, Math.floor(buffer.sampleRate * MAX_ANALYSIS_SECONDS))
  const offline = new OfflineAudioContext(1, frameCount, buffer.sampleRate)
  const sourceBuffer = offline.createBuffer(1, frameCount, buffer.sampleRate)
  const channelData = sourceBuffer.getChannelData(0)

  writeMonoSamples(buffer, channelData, frameCount)

  const source = offline.createBufferSource()
  const filter = offline.createBiquadFilter()

  source.buffer = sourceBuffer
  filter.type = 'lowpass'
  filter.frequency.value = LOWPASS_FREQUENCY
  filter.Q.value = 0.7

  source.connect(filter).connect(offline.destination)
  source.start()

  return offline.startRendering()
}

function buildEnvelope(samples: Float32Array, windowSize: number): Float32Array {
  const bucketCount = Math.max(1, Math.floor(samples.length / windowSize))
  const envelope = new Float32Array(bucketCount)

  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const start = bucket * windowSize
    const end = Math.min(samples.length, start + windowSize)
    let energy = 0

    for (let frame = start; frame < end; frame += 1) {
      energy += Math.abs(samples[frame] ?? 0)
    }

    envelope[bucket] = energy / Math.max(1, end - start)
  }

  return envelope
}

// Parabolic interpolation over the three buckets around a peak recovers
// sub-bucket timing (buckets are ~23 ms wide, too coarse for beat grids).
function refinePeakTime(envelope: Float32Array, index: number, secondsPerBucket: number): number {
  const previous = envelope[index - 1] ?? envelope[index]
  const next = envelope[index + 1] ?? envelope[index]
  const denominator = previous - 2 * envelope[index] + next
  const shift =
    denominator === 0 ? 0 : Math.max(-0.5, Math.min(0.5, (0.5 * (previous - next)) / denominator))

  return (index + shift) * secondsPerBucket
}

function pickPeaks(envelope: Float32Array, secondsPerBucket: number): number[] {
  const values = Array.from(envelope)
  const floor = median(values)
  const upper = median(values.filter((value) => value >= floor))
  const threshold = Math.max(floor * 1.45, upper * 0.85)
  const minDistanceBuckets = Math.max(1, Math.round(MIN_PEAK_DISTANCE_SECONDS / secondsPerBucket))
  const candidates: Array<{ index: number; value: number }> = []

  for (let index = 1; index < envelope.length - 1; index += 1) {
    const value = envelope[index]

    if (value >= threshold && value > envelope[index - 1] && value >= envelope[index + 1]) {
      candidates.push({ index, value })
    }
  }

  candidates.sort((a, b) => b.value - a.value)

  const selected: Array<{ index: number; value: number }> = []

  for (const candidate of candidates) {
    if (selected.every((peak) => Math.abs(peak.index - candidate.index) >= minDistanceBuckets)) {
      selected.push(candidate)
    }
  }

  return selected
    .sort((a, b) => a.index - b.index)
    .map((peak) => refinePeakTime(envelope, peak.index, secondsPerBucket))
}

interface TempoBin {
  score: number
  weightedTempoSum: number
}

function scoreIntervals(peaks: number[]): { bpm: number; score: number } | null {
  const histogram = new Map<number, TempoBin>()

  for (let index = 0; index < peaks.length; index += 1) {
    for (let offset = 1; offset <= 8 && index + offset < peaks.length; offset += 1) {
      const interval = peaks[index + offset] - peaks[index]

      if (interval <= 0) {
        continue
      }

      const tempo = normalizeTempo(60 / (interval / offset))

      if (tempo < MIN_TEMPO || tempo > MAX_TEMPO) {
        continue
      }

      const rounded = Math.round(tempo)
      const closeness = 1 / offset
      const bin = histogram.get(rounded) ?? { score: 0, weightedTempoSum: 0 }

      bin.score += closeness
      bin.weightedTempoSum += tempo * closeness
      histogram.set(rounded, bin)
    }
  }

  let best: { bin: number; score: number } | null = null

  for (const [bpm, { score }] of histogram) {
    const neighborScore =
      score +
      (histogram.get(bpm - 1)?.score ?? 0) * 0.45 +
      (histogram.get(bpm + 1)?.score ?? 0) * 0.45

    if (!best || neighborScore > best.score) {
      best = { bin: bpm, score: neighborScore }
    }
  }

  if (!best) {
    return null
  }

  let totalWeight = 0
  let weightedTempoSum = 0

  for (let bin = best.bin - 1; bin <= best.bin + 1; bin += 1) {
    const entry = histogram.get(bin)

    if (entry) {
      totalWeight += entry.score
      weightedTempoSum += entry.weightedTempoSum
    }
  }

  return {
    bpm: totalWeight > 0 ? weightedTempoSum / totalWeight : best.bin,
    score: best.score
  }
}

// Beat-locked energy: |DFT| of the envelope at the beat frequency and its
// first harmonics, evaluated with a rotation recurrence instead of per-sample
// trig. Smooth in tempo and free of the artifacts that binned folds show.
function beatEnergy(envelope: Float32Array, secondsPerBucket: number, bpm: number): number {
  let total = 0

  for (let harmonic = 1; harmonic <= 4; harmonic += 1) {
    const angleStep = 2 * Math.PI * harmonic * (bpm / 60) * secondsPerBucket
    const stepCos = Math.cos(angleStep)
    const stepSin = Math.sin(angleStep)
    let rotatingCos = Math.cos(angleStep * 0.5)
    let rotatingSin = Math.sin(angleStep * 0.5)
    let x = 0
    let y = 0

    for (let index = 0; index < envelope.length; index += 1) {
      x += envelope[index] * rotatingCos
      y += envelope[index] * rotatingSin
      const nextCos = rotatingCos * stepCos - rotatingSin * stepSin
      rotatingSin = rotatingCos * stepSin + rotatingSin * stepCos
      rotatingCos = nextCos
    }

    total += Math.sqrt(x * x + y * y) / harmonic
  }

  return total
}

// The interval histogram gets within ~0.1 BPM of the truth; scanning the
// beat-locked energy around it finds the exact production tempo (electronic
// tracks sit on grid values like 145.000, and a 0.08 BPM error alone drifts
// the grid ~50 ms over a 4-minute track).
function refineBpm(envelope: Float32Array, secondsPerBucket: number, initialBpm: number): number {
  let best = initialBpm
  let bestEnergy = -Infinity

  for (const [range, step] of [
    [1.0, 0.01],
    [0.02, 0.001]
  ] as const) {
    const center = best

    for (let bpm = center - range; bpm <= center + range; bpm += step) {
      const energy = beatEnergy(envelope, secondsPerBucket, bpm)

      if (energy > bestEnergy) {
        bestEnergy = energy
        best = bpm
      }
    }
  }

  return best
}

// Average low-band beat shape: envelope values folded over one beat period.
// Each bucket is split fractionally between the two nearest bins to avoid
// comb artifacts when bucket and bin rates are nearly commensurate.
function foldBeatShape(
  envelope: Float32Array,
  secondsPerBucket: number,
  beatPeriod: number
): Float64Array {
  const sums = new Float64Array(FOLD_BINS)
  const counts = new Float64Array(FOLD_BINS)

  for (let index = 0; index < envelope.length; index += 1) {
    const time = (index + 0.5) * secondsPerBucket
    const fraction = (((time / beatPeriod) % 1) + 1) % 1
    const position = fraction * FOLD_BINS - 0.5
    const lowBin = (Math.floor(position) + FOLD_BINS) % FOLD_BINS
    const highBin = (lowBin + 1) % FOLD_BINS
    const t = position - Math.floor(position)

    sums[lowBin] += envelope[index] * (1 - t)
    counts[lowBin] += 1 - t
    sums[highBin] += envelope[index] * t
    counts[highBin] += t
  }

  const shape = new Float64Array(FOLD_BINS)

  for (let bin = 0; bin < FOLD_BINS; bin += 1) {
    shape[bin] = counts[bin] > 0 ? sums[bin] / counts[bin] : 0
  }

  return shape
}

function circularSmooth(values: Float64Array, radius: number): Float64Array {
  const length = values.length
  const smoothed = new Float64Array(length)

  for (let index = 0; index < length; index += 1) {
    let sum = 0
    let weight = 0

    for (let delta = -radius; delta <= radius; delta += 1) {
      const binWeight = radius + 1 - Math.abs(delta)
      sum += values[(index + delta + length) % length] * binWeight
      weight += binWeight
    }

    smoothed[index] = sum / weight
  }

  return smoothed
}

// The grid anchors where the folded shape crosses half of its rise, walking
// back from its maximum: the base of the main kick's attack. This tracks the
// audible hit far better than energy peaks (which lag by a kick-shape-
// dependent amount) or onset histograms (which off-beat bass stabs pollute).
function estimateFirstBeatOffset(
  envelope: Float32Array,
  secondsPerBucket: number,
  bpm: number
): number {
  if (bpm <= 0 || envelope.length < 2) {
    return 0
  }

  const beatPeriod = 60 / bpm
  const shape = circularSmooth(foldBeatShape(envelope, secondsPerBucket, beatPeriod), 3)
  let maxBin = 0
  let minValue = Infinity

  for (let bin = 0; bin < FOLD_BINS; bin += 1) {
    if (shape[bin] > shape[maxBin]) {
      maxBin = bin
    }

    minValue = Math.min(minValue, shape[bin])
  }

  if (shape[maxBin] <= minValue) {
    return 0
  }

  const target = (shape[maxBin] + minValue) / 2
  let bin = maxBin

  for (let step = 0; step < FOLD_BINS; step += 1) {
    const previous = (bin - 1 + FOLD_BINS) % FOLD_BINS

    if (shape[previous] < target && shape[bin] >= target) {
      const t = (target - shape[previous]) / (shape[bin] - shape[previous])
      const fraction = ((((previous + t) / FOLD_BINS) % 1) + 1) % 1

      return fraction * beatPeriod
    }

    bin = previous
  }

  return (maxBin / FOLD_BINS) * beatPeriod
}

export function detectBpmFromLowBand(lowSamples: Float32Array, sampleRate: number): BpmDetectionResult {
  const tempoEnvelope = buildEnvelope(lowSamples, TEMPO_WINDOW)
  const peaks = pickPeaks(tempoEnvelope, TEMPO_WINDOW / sampleRate)
  const best = scoreIntervals(peaks)

  if (!best) {
    return { bpm: 0, firstBeatOffset: 0 }
  }

  const anchorEnvelope = buildEnvelope(lowSamples, ANCHOR_WINDOW)
  const secondsPerBucket = ANCHOR_WINDOW / sampleRate
  const bpm = refineBpm(anchorEnvelope, secondsPerBucket, best.bpm)
  const firstBeatOffset = estimateFirstBeatOffset(anchorEnvelope, secondsPerBucket, bpm)

  return { bpm, firstBeatOffset }
}

export async function detectBpm(buffer: AudioBuffer): Promise<BpmDetectionResult> {
  if (buffer.duration <= 0) {
    return { bpm: 0, firstBeatOffset: 0 }
  }

  const rendered = await renderLowpassed(buffer)
  return detectBpmFromLowBand(rendered.getChannelData(0), rendered.sampleRate)
}
