export function getWaveformKeyboardSeekPosition(
  key: string,
  position: number,
  duration: number,
  smallStep: number,
  largeStep: number
): number | null {
  let nextPosition: number

  if (key === 'Home') {
    nextPosition = 0
  } else if (key === 'End') {
    nextPosition = duration
  } else if (key === 'ArrowLeft' || key === 'ArrowDown') {
    nextPosition = position - smallStep
  } else if (key === 'ArrowRight' || key === 'ArrowUp') {
    nextPosition = position + smallStep
  } else if (key === 'PageDown') {
    nextPosition = position - largeStep
  } else if (key === 'PageUp') {
    nextPosition = position + largeStep
  } else {
    return null
  }

  return Math.min(Math.max(nextPosition, 0), duration)
}
