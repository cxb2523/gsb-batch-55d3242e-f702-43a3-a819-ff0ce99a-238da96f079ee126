export interface CanvasFrameState {
  dpr: number
  height: number
  position: number
  width: number
}

export function hasCanvasFrameChanged(previous: CanvasFrameState | null, next: CanvasFrameState): boolean {
  return (
    !previous ||
    previous.dpr !== next.dpr ||
    previous.height !== next.height ||
    previous.position !== next.position ||
    previous.width !== next.width
  )
}
