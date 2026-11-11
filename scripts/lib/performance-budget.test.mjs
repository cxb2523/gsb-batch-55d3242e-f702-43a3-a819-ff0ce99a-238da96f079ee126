import { describe, expect, it } from 'vitest'
import { evaluatePerformanceSnapshots } from './performance-budget.mjs'

function createSnapshot(overrides = {}) {
  return {
    longTasks: {},
    slowFrames: {},
    measures: {
      'deck.loadFile.decodeAudioData': { count: 1, maxMs: 10 },
      'deck.loadFile.computeWaveform': { count: 1, maxMs: 10 }
    },
    ...overrides
  }
}

describe('performance budgets', () => {
  it('accepts a snapshot inside the deck-play budget', () => {
    expect(evaluatePerformanceSnapshots('deck-play', [createSnapshot()])).toEqual([])
  })

  it('reports missing measures, slow frames, long tasks, and duration breaches', () => {
    const violations = evaluatePerformanceSnapshots('deck-play', [
      createSnapshot({
        longTasks: { renderer: { count: 1 } },
        slowFrames: { waveform: { count: 2 } },
        measures: {
          'deck.loadFile.decodeAudioData': { count: 1, maxMs: 101 }
        }
      })
    ])

    expect(violations).toEqual([
      'run 1: 1 long tasks exceeds 0',
      'run 1: 2 slow frames exceeds 0',
      'run 1: deck.loadFile.decodeAudioData max 101.0ms exceeds 100ms',
      'run 1: required measure deck.loadFile.computeWaveform is missing'
    ])
  })
})
