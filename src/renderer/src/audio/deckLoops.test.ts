import { describe, expect, it } from 'vitest'
import {
  createAutoLoopState,
  createEmptyLoop,
  createLoopInState,
  createLoopOutState,
  deactivateLoop,
  getLoopRestartPosition
} from './deckLoops'

describe('deck loops', () => {
  it('creates loop-in state using an existing later loop-out point', () => {
    expect(createLoopInState({ start: null, end: 12, active: false }, 8)).toEqual({
      start: 8,
      end: 12,
      active: true
    })
  })

  it('creates loop-out state only when it has an earlier loop-in point', () => {
    expect(createLoopOutState({ start: 8, end: null, active: false }, 12)).toEqual({
      start: 8,
      end: 12,
      active: true
    })
    expect(createLoopOutState({ start: 14, end: null, active: false }, 12)).toEqual({
      start: 14,
      end: 12,
      active: false
    })
  })

  it('creates auto loops from bpm and beat count', () => {
    expect(createAutoLoopState(120, 4, 60, 10, (seconds) => seconds)).toEqual({
      start: 10,
      end: 12,
      active: true
    })
    expect(createAutoLoopState(0, 4, 60, 10, (seconds) => seconds)).toBeNull()
    expect(createAutoLoopState(120, 4, 0, 10, (seconds) => seconds)).toBeNull()
  })

  it('rejects auto loops that clamp back to the start', () => {
    expect(createAutoLoopState(120, 4, 60, 10, () => 10)).toBeNull()
  })

  it('deactivates loops without dropping their boundaries', () => {
    expect(deactivateLoop({ start: 8, end: 12, active: true })).toEqual({ start: 8, end: 12, active: false })
  })

  it('calculates restart positions with overshoot preserved', () => {
    const loop = { start: 8, end: 12, active: true }

    expect(getLoopRestartPosition(loop, 11.5)).toBeNull()
    expect(getLoopRestartPosition(loop, 12.25)).toBe(8.25)
    expect(getLoopRestartPosition({ ...loop, active: false }, 12.25)).toBeNull()
  })

  it('creates fresh empty loop objects', () => {
    expect(createEmptyLoop()).toEqual({ start: null, end: null, active: false })
    expect(createEmptyLoop()).not.toBe(createEmptyLoop())
  })
})
