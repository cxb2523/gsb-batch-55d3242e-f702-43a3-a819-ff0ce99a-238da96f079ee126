import { useCallback, useEffect, useRef, useState } from 'react'

const CUE_PREVIEW_HOLD_MS = 200

type PointerCuePhase = 'idle' | 'pending' | 'previewing' | 'returned'

interface UseCueButtonOptions {
  isPlaying: boolean
  onCueDown: () => Promise<void>
  onCueSet: () => void
  onCueUp: () => void
}

interface CueButtonHandlers {
  cueSetFlashing: boolean
  onBlur: () => void
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void
  onKeyUp: (event: React.KeyboardEvent<HTMLButtonElement>) => void
  onLostPointerCapture: (event: React.PointerEvent<HTMLButtonElement>) => void
  onPointerCancel: (event: React.PointerEvent<HTMLButtonElement>) => void
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void
  onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => void
}

export function useCueButton({ isPlaying, onCueDown, onCueSet, onCueUp }: UseCueButtonOptions): CueButtonHandlers {
  const keyboardHeldRef = useRef(false)
  const pointerPhaseRef = useRef<PointerCuePhase>('idle')
  const holdTimerRef = useRef<number | null>(null)
  const feedbackTimerRef = useRef<number | null>(null)
  const [cueSetFlashing, setCueSetFlashing] = useState(false)

  const clearHoldTimer = useCallback((): void => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current)
      holdTimerRef.current = null
    }
  }, [])

  const cancelPointerGesture = useCallback((): void => {
    const phase = pointerPhaseRef.current
    clearHoldTimer()
    pointerPhaseRef.current = 'idle'

    if (phase === 'previewing') {
      onCueUp()
    }
  }, [clearHoldTimer, onCueUp])

  const releaseKeyboardCue = useCallback((): void => {
    if (keyboardHeldRef.current) {
      keyboardHeldRef.current = false
      onCueUp()
    }
  }, [onCueUp])

  const markCue = useCallback((): void => {
    onCueSet()
    setCueSetFlashing(true)

    if (feedbackTimerRef.current !== null) {
      window.clearTimeout(feedbackTimerRef.current)
    }

    feedbackTimerRef.current = window.setTimeout(() => {
      feedbackTimerRef.current = null
      setCueSetFlashing(false)
    }, 280)
  }, [onCueSet])

  const handleBlur = useCallback((): void => {
    cancelPointerGesture()
    releaseKeyboardCue()
  }, [cancelPointerGesture, releaseKeyboardCue])

  useEffect(() => {
    window.addEventListener('blur', handleBlur)

    return () => {
      window.removeEventListener('blur', handleBlur)
      if (feedbackTimerRef.current !== null) {
        window.clearTimeout(feedbackTimerRef.current)
      }
      handleBlur()
    }
  }, [handleBlur])

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>): void => {
      if (event.pointerType === 'mouse' && event.button !== 0) {
        return
      }

      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)

      if (isPlaying) {
        pointerPhaseRef.current = 'returned'
        void onCueDown()
        return
      }

      pointerPhaseRef.current = 'pending'
      holdTimerRef.current = window.setTimeout(() => {
        holdTimerRef.current = null

        if (pointerPhaseRef.current !== 'pending') {
          return
        }

        pointerPhaseRef.current = 'previewing'
        markCue()
        void onCueDown()
      }, CUE_PREVIEW_HOLD_MS)
    },
    [isPlaying, markCue, onCueDown]
  )

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>): void => {
      const phase = pointerPhaseRef.current
      clearHoldTimer()
      pointerPhaseRef.current = 'idle'

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }

      if (phase === 'pending') {
        markCue()
      } else if (phase === 'previewing') {
        onCueUp()
      }
    },
    [clearHoldTimer, markCue, onCueUp]
  )

  const handlePointerCancel = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>): void => {
      cancelPointerGesture()

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    },
    [cancelPointerGesture]
  )

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>): void => {
      if ((event.key !== ' ' && event.key !== 'Enter') || event.repeat || keyboardHeldRef.current) {
        return
      }

      event.preventDefault()
      keyboardHeldRef.current = true
      void onCueDown()
    },
    [onCueDown]
  )

  const handleKeyUp = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>): void => {
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault()
        releaseKeyboardCue()
      }
    },
    [releaseKeyboardCue]
  )

  return {
    cueSetFlashing,
    onBlur: handleBlur,
    onKeyDown: handleKeyDown,
    onKeyUp: handleKeyUp,
    onLostPointerCapture: handlePointerCancel,
    onPointerCancel: handlePointerCancel,
    onPointerDown: handlePointerDown,
    onPointerUp: handlePointerUp
  }
}
