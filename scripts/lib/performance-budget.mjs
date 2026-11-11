export const PERFORMANCE_BUDGETS = Object.freeze({
  'deck-load': {
    maxLongTaskCount: 0,
    maxSlowFrameCount: 0,
    measures: {
      'library.audioMetadata.readFile': 100,
      'library.audioMetadata.decodeAudioData': 100,
      'library.audioMetadata.detectBpm': 250,
      'deck.loadFile.readFile': 100,
      'deck.loadFile.decodeAudioData': 100,
      'deck.loadFile.computeWaveform': 100
    }
  },
  'deck-play': {
    maxLongTaskCount: 0,
    maxSlowFrameCount: 0,
    measures: {
      'deck.loadFile.decodeAudioData': 100,
      'deck.loadFile.computeWaveform': 100
    }
  },
  'deck-record': {
    maxLongTaskCount: 0,
    maxSlowFrameCount: 0,
    measures: {
      'deck.loadFile.decodeAudioData': 100,
      'deck.loadFile.computeWaveform': 100,
      'recording.startRecording': 250,
      'recording.chunk.arrayBuffer': 100,
      'recording.appendRecordingChunk': 100,
      'recording.pendingWrites': 500,
      'recording.stopRecording': 500
    }
  }
})

function countEntries(entries) {
  return Object.values(entries ?? {}).reduce((total, entry) => total + entry.count, 0)
}

export function evaluatePerformanceSnapshots(scenario, snapshots) {
  const budget = PERFORMANCE_BUDGETS[scenario]

  if (!budget) {
    throw new Error(`No performance budget is defined for scenario: ${scenario}`)
  }

  const violations = []

  snapshots.forEach((snapshot, index) => {
    const label = `run ${index + 1}`
    const longTaskCount = countEntries(snapshot.longTasks)
    const slowFrameCount = countEntries(snapshot.slowFrames)

    if (longTaskCount > budget.maxLongTaskCount) {
      violations.push(`${label}: ${longTaskCount} long tasks exceeds ${budget.maxLongTaskCount}`)
    }

    if (slowFrameCount > budget.maxSlowFrameCount) {
      violations.push(`${label}: ${slowFrameCount} slow frames exceeds ${budget.maxSlowFrameCount}`)
    }

    for (const [measureName, maxMs] of Object.entries(budget.measures)) {
      const measure = snapshot.measures?.[measureName]

      if (!measure) {
        violations.push(`${label}: required measure ${measureName} is missing`)
      } else if (measure.maxMs > maxMs) {
        violations.push(`${label}: ${measureName} max ${measure.maxMs.toFixed(1)}ms exceeds ${maxMs}ms`)
      }
    }
  })

  return violations
}
