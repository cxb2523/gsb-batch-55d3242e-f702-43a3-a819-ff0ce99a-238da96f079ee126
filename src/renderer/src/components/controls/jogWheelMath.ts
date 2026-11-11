export function getJogAngleDelta(previous: number, next: number): number {
  let delta = next - previous

  if (delta > 180) {
    delta -= 360
  } else if (delta < -180) {
    delta += 360
  }

  return delta
}

export function getJogSeekPosition(startPosition: number, deltaDegrees: number, duration: number): number {
  return Math.min(duration, Math.max(0, startPosition + (deltaDegrees / 360) * 4))
}

export function getJogScrubPosition(startPosition: number, deltaDegrees: number, duration: number): number {
  return Math.min(duration, Math.max(0, startPosition + (deltaDegrees / 360) * 1.8))
}

export type JogInteractionMode = 'platter' | 'rim'

export function getJogInteractionMode(
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, 'height' | 'left' | 'top' | 'width'>
): JogInteractionMode {
  const radius = Math.min(rect.width, rect.height) / 2
  const x = clientX - rect.left - rect.width / 2
  const y = clientY - rect.top - rect.height / 2
  return Math.hypot(x, y) <= radius * 0.78 ? 'platter' : 'rim'
}

export function getJogProgressDegrees(position: number, duration: number): number {
  return (duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0) * 360
}
