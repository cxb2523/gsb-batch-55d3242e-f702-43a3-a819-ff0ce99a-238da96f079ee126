import { EMPTY_LOOP, type LoopState } from './deckTypes'

export function createLoopInState(loop: LoopState, position: number): LoopState {
  const end = loop.end !== null && loop.end > position ? loop.end : null

  return {
    start: position,
    end,
    active: end !== null
  }
}

export function createLoopOutState(loop: LoopState, position: number): LoopState {
  const start = loop.start !== null && loop.start < position ? loop.start : null

  return {
    start: start ?? loop.start,
    end: position,
    active: start !== null
  }
}

export function createAutoLoopState(
  bpm: number,
  beats: number,
  duration: number,
  position: number,
  clampPosition: (seconds: number) => number
): LoopState | null {
  if (bpm <= 0 || beats <= 0 || duration <= 0) {
    return null
  }

  const seconds = (60 / bpm) * beats
  const end = clampPosition(position + seconds)

  return end > position ? { start: position, end, active: true } : null
}

export function deactivateLoop(loop: LoopState): LoopState {
  return { ...loop, active: false }
}

export function getLoopRestartPosition(loop: LoopState, position: number): number | null {
  if (!loop.active || loop.start === null || loop.end === null || loop.end <= loop.start) {
    return null
  }

  if (position < loop.end) {
    return null
  }

  const loopLength = loop.end - loop.start
  return loop.start + ((position - loop.end) % loopLength)
}

export function createEmptyLoop(): LoopState {
  return { ...EMPTY_LOOP }
}
