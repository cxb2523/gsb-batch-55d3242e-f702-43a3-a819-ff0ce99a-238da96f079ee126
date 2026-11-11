import { useCallback, useRef, useState } from 'react'
import { NextDjMark } from './NextDjMark'
import {
  getJogAngleDelta,
  getJogInteractionMode,
  getJogProgressDegrees,
  getJogScrubPosition,
  getJogSeekPosition,
  type JogInteractionMode
} from './jogWheelMath'
import { hasReleasedPointerButtons, useCancelDragOnWindowBlur } from './usePointerDragSafety'

interface JogWheelProps {
  position: number
  duration: number
  isPlaying: boolean
  accent: string
  label: string
  onBend: (degrees: number) => void
  onScratchEnd: () => void
  onScratchStart: () => number
  onScrub: (seconds: number, direction: -1 | 1) => void
  onSeek: (seconds: number) => void
}

function pointerAngle(event: React.PointerEvent<HTMLButtonElement>): number {
  const rect = event.currentTarget.getBoundingClientRect()
  const x = event.clientX - rect.left - rect.width / 2
  const y = event.clientY - rect.top - rect.height / 2
  return Math.atan2(y, x) * (180 / Math.PI)
}

export function JogWheel({
  position,
  duration,
  isPlaying,
  accent,
  label,
  onBend,
  onScratchEnd,
  onScratchStart,
  onScrub,
  onSeek
}: JogWheelProps): JSX.Element {
  const dragRef = useRef<{ angle: number; mode: JogInteractionMode; position: number } | null>(null)
  const [dragMode, setDragMode] = useState<JogInteractionMode | null>(null)
  const [dragRotation, setDragRotation] = useState(0)
  const rotation = dragRef.current ? dragRotation : position * 150
  const progressDegrees = getJogProgressDegrees(position, duration)

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>): void => {
      event.currentTarget.setPointerCapture(event.pointerId)
      const mode = getJogInteractionMode(
        event.clientX,
        event.clientY,
        event.currentTarget.getBoundingClientRect()
      )
      const startPosition = mode === 'platter' ? onScratchStart() : position
      dragRef.current = { angle: pointerAngle(event), mode, position: startPosition }
      setDragMode(mode)
      setDragRotation(startPosition * 150)
    },
    [onScratchStart, position]
  )

  const clearDrag = useCallback((): void => {
    if (dragRef.current?.mode === 'platter') {
      onScratchEnd()
    }

    dragRef.current = null
    setDragMode(null)
  }, [onScratchEnd])

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>): void => {
      if (!dragRef.current || duration <= 0) {
        return
      }

      if (hasReleasedPointerButtons(event.nativeEvent)) {
        clearDrag()
        return
      }

      const nextAngle = pointerAngle(event)
      const delta = getJogAngleDelta(dragRef.current.angle, nextAngle)

      if (dragRef.current.mode === 'rim' && isPlaying) {
        dragRef.current = { angle: nextAngle, mode: dragRef.current.mode, position: dragRef.current.position }
        setDragRotation((current: number) => current + delta)
        onBend(delta)
        return
      }

      const isPlatter = dragRef.current.mode === 'platter'
      const nextPosition = isPlatter
        ? getJogScrubPosition(dragRef.current.position, delta, duration)
        : getJogSeekPosition(dragRef.current.position, delta, duration)

      dragRef.current = { angle: nextAngle, mode: dragRef.current.mode, position: nextPosition }
      setDragRotation((current: number) => current + delta)
      if (isPlatter && delta !== 0) {
        onScrub(nextPosition, delta > 0 ? 1 : -1)
      } else {
        onSeek(nextPosition)
      }
    },
    [clearDrag, duration, isPlaying, onBend, onScrub, onSeek]
  )

  useCancelDragOnWindowBlur(clearDrag)

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>): void => {
      if (duration <= 0) {
        return
      }

      if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault()
        onSeek(event.key === 'Home' ? 0 : duration)
        return
      }

      const direction = event.key === 'ArrowUp' || event.key === 'ArrowRight' || event.key === 'PageUp' ? 1 : -1

      if (event.key === 'PageUp' || event.key === 'PageDown') {
        event.preventDefault()
        onSeek(Math.min(Math.max(position + direction * 10, 0), duration))
      } else if (
        event.key === 'ArrowUp' ||
        event.key === 'ArrowRight' ||
        event.key === 'ArrowDown' ||
        event.key === 'ArrowLeft'
      ) {
        event.preventDefault()

        if (isPlaying) {
          onBend(direction * 3)
        } else {
          onSeek(Math.min(Math.max(position + direction, 0), duration))
        }
      }
    },
    [duration, isPlaying, onBend, onSeek, position]
  )

  return (
    <button
      aria-label={label}
      aria-valuemax={duration}
      aria-valuemin={0}
      aria-valuenow={position}
      aria-valuetext={`${Math.floor(position / 60)}:${Math.floor(position % 60)
        .toString()
        .padStart(2, '0')}`}
      className={`jog-wheel ${isPlaying && !dragRef.current ? 'jog-wheel-playing' : ''} ${dragMode ? `jog-wheel-${dragMode}-dragging` : ''}`}
      disabled={duration <= 0}
      role="slider"
      style={
        {
          '--jog-accent': accent,
          '--jog-progress': `${progressDegrees}deg`
        } as React.CSSProperties
      }
      type="button"
      onKeyDown={handleKeyDown}
      onLostPointerCapture={clearDrag}
      onPointerCancel={clearDrag}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={clearDrag}
    >
      <span aria-hidden="true" className="jog-arc" />
      <span aria-hidden="true" className="jog-ticks" />
      <span className="jog-rotor" style={{ transform: `rotate(${rotation}deg)` }}>
        <span aria-hidden="true" className="jog-position-marker" />
        <span className="jog-platter" />
        <span className="jog-cap">
          <NextDjMark className="jog-logo" />
        </span>
      </span>
    </button>
  )
}
