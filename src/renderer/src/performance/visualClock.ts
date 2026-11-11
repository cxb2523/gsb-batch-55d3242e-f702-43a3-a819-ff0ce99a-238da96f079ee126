export type VisualFrameListener = (timestamp: number) => void

const listeners = new Set<VisualFrameListener>()
let frameId: number | null = null

function scheduleFrame(): void {
  if (frameId === null && listeners.size > 0) {
    frameId = window.requestAnimationFrame(runFrame)
  }
}

function runFrame(timestamp: number): void {
  frameId = null

  for (const listener of [...listeners]) {
    listener(timestamp)
  }

  scheduleFrame()
}

export function subscribeVisualFrame(listener: VisualFrameListener): () => void {
  listeners.add(listener)
  scheduleFrame()

  return () => {
    listeners.delete(listener)

    if (listeners.size === 0 && frameId !== null) {
      window.cancelAnimationFrame(frameId)
      frameId = null
    }
  }
}
