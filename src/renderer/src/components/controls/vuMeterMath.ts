export function calculateMeterLevel(data: Uint8Array): number {
  let sum = 0

  for (const sample of data) {
    const centered = (sample - 128) / 128
    sum += centered * centered
  }

  return Math.min(1, Math.sqrt(sum / data.length) * 3.2)
}

export function getPeakSegment(peak: number, segments: number): number {
  return peak > 0.01 ? Math.min(segments - 1, Math.floor(peak * segments)) : -1
}

export function getLitSegmentCount(level: number, segments: number): number {
  if (level <= 0 || segments <= 0) {
    return 0
  }

  return Math.min(segments, Math.floor(level * segments))
}

export function getVuSegmentColor(segment: number, segments: number): 'green' | 'yellow' | 'red' {
  return segment > segments * 0.82 ? 'red' : segment > segments * 0.62 ? 'yellow' : 'green'
}
