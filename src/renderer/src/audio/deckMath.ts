export const MIN_PITCH_PERCENT = -16
export const MAX_PITCH_PERCENT = 16
export const MIN_EQ_DB = -26
export const MAX_EQ_DB = 6
export const JOG_CHASE_SECONDS = 0.15
export const JOG_MAX_RATE_BEND = 0.35
export const MIN_JOG_RATE = 0.05

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function clampPitchPercent(percent: number): number {
  return clamp(percent, MIN_PITCH_PERCENT, MAX_PITCH_PERCENT)
}

export function pitchPercentToRate(percent: number): number {
  return 1 + clampPitchPercent(percent) / 100
}

export function clampEqDb(dB: number): number {
  return clamp(dB, MIN_EQ_DB, MAX_EQ_DB)
}

export function clampUnitValue(value: number): number {
  return clamp(value, 0, 1)
}

export function clampPositiveValue(value: number): number {
  return Math.max(0, value)
}

export function calculateJogPlaybackRate(basePlaybackRate: number, pendingSeconds: number): number {
  const bend = clamp(pendingSeconds / JOG_CHASE_SECONDS, -JOG_MAX_RATE_BEND, JOG_MAX_RATE_BEND)

  return Math.max(MIN_JOG_RATE, basePlaybackRate + bend)
}
