import { useEffect } from 'react'

export function hasReleasedPointerButtons(event: Pick<PointerEvent, 'buttons'>): boolean {
  return event.buttons === 0
}

export function useCancelDragOnWindowBlur(cancelDrag: () => void): void {
  useEffect(() => {
    window.addEventListener('blur', cancelDrag)

    return () => {
      window.removeEventListener('blur', cancelDrag)
    }
  }, [cancelDrag])
}
