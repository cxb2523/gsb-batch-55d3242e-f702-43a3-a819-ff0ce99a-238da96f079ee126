import { useCallback, useRef } from 'react'
import { hasReleasedPointerButtons, useCancelDragOnWindowBlur } from './usePointerDragSafety'

interface FaderScale {
  count: number
  majorEvery?: number
}

interface FaderProps {
  value: number
  min: number
  max: number
  label: string
  accent: string
  onChange: (value: number) => void
  orientation?: 'vertical' | 'horizontal'
  step?: number
  centerDetent?: boolean
  disabled?: boolean
  hideLabel?: boolean
  showFill?: boolean
  scale?: FaderScale
  variant?: 'standard' | 'pitch' | 'channel' | 'crossfader'
  valueFormatter?: (value: number) => string
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function Fader({
  value,
  min,
  max,
  label,
  accent,
  onChange,
  orientation = 'vertical',
  step = 0.01,
  centerDetent = false,
  disabled = false,
  hideLabel = false,
  showFill = false,
  scale,
  variant = 'standard',
  valueFormatter = (nextValue) => nextValue.toFixed(2)
}: FaderProps): JSX.Element {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const draggingRef = useRef(false)
  const isVertical = orientation === 'vertical'
  const range = max - min
  const percentage = clamp((value - min) / range, 0, 1)

  const commitValue = useCallback(
    (nextValue: number): void => {
      let stepped = Math.round(nextValue / step) * step

      if (centerDetent && Math.abs(stepped - (min + max) / 2) < range * 0.02) {
        stepped = (min + max) / 2
      }

      const committed = Number(clamp(stepped, min, max).toFixed(4))

      if (committed !== value) {
        onChange(committed)
      }
    },
    [centerDetent, max, min, onChange, range, step, value]
  )

  const valueFromPointer = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): number => {
      const track = trackRef.current

      if (!track) {
        return value
      }

      const rect = track.getBoundingClientRect()
      const ratio = isVertical
        ? 1 - (event.clientY - rect.top) / rect.height
        : (event.clientX - rect.left) / rect.width

      return min + clamp(ratio, 0, 1) * range
    },
    [isVertical, min, range, value]
  )

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => {
      if (disabled) {
        return
      }

      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      draggingRef.current = true
      commitValue(valueFromPointer(event))
    },
    [commitValue, disabled, valueFromPointer]
  )

  const stopDrag = useCallback((): void => {
    draggingRef.current = false
  }, [])

  const clearDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => {
      stopDrag()

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    },
    [stopDrag]
  )

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => {
      if (!draggingRef.current) {
        return
      }

      if (hasReleasedPointerButtons(event.nativeEvent)) {
        clearDrag(event)
        return
      }

      commitValue(valueFromPointer(event))
    },
    [clearDrag, commitValue, valueFromPointer]
  )

  useCancelDragOnWindowBlur(stopDrag)

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>): void => {
      const increase = isVertical ? event.key === 'ArrowUp' : event.key === 'ArrowRight'
      const decrease = isVertical ? event.key === 'ArrowDown' : event.key === 'ArrowLeft'

      if (increase || decrease) {
        event.preventDefault()
        commitValue(value + (increase ? step : -step))
      }
    },
    [commitValue, isVertical, step, value]
  )

  const trackStyle = { '--fader-accent': accent }

  const thumbStyle = isVertical
    ? { bottom: `${percentage * 100}%` }
    : { left: `${percentage * 100}%` }

  return (
    <div
      className={`fader ${isVertical ? 'fader-vertical' : 'fader-horizontal'} fader-variant-${variant} ${disabled ? 'fader-disabled' : ''}`}
    >
      <div
        ref={trackRef}
        aria-label={label}
        aria-orientation={orientation}
        aria-valuemax={max}
        aria-valuemin={min}
        aria-valuenow={value}
        aria-valuetext={valueFormatter(value)}
        className="fader-track"
        role="slider"
        style={trackStyle as React.CSSProperties}
        tabIndex={disabled ? -1 : 0}
        title={`${label}: ${valueFormatter(value)}`}
        onKeyDown={handleKeyDown}
        onLostPointerCapture={stopDrag}
        onPointerCancel={clearDrag}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={clearDrag}
      >
        {scale ? (
          <span aria-hidden="true" className="fader-scale">
            {Array.from({ length: scale.count }, (_, index) => {
              const ratio = index / (scale.count - 1)
              const isMajor = scale.majorEvery ? index % scale.majorEvery === 0 : false
              const isCenter = centerDetent && index * 2 === scale.count - 1

              return (
                <span
                  key={index}
                  className={`fader-tick ${isMajor ? 'fader-tick-major' : ''} ${isCenter ? 'fader-tick-center' : ''}`}
                  style={isVertical ? { bottom: `${ratio * 100}%` } : { left: `${ratio * 100}%` }}
                />
              )
            })}
          </span>
        ) : null}
        {centerDetent && !scale ? <span className="fader-detent" /> : null}
        {showFill ? (
          <span
            className="fader-fill"
            style={isVertical ? { height: `${percentage * 100}%` } : { width: `${percentage * 100}%` }}
          />
        ) : null}
        <span className="fader-thumb" style={thumbStyle}>
          <span className="fader-thumb-backplate" />
          <span className="fader-thumb-face fader-thumb-face-start" />
          <span className="fader-thumb-ridge" />
          <span className="fader-thumb-face fader-thumb-face-end" />
        </span>
      </div>
      {label && !hideLabel ? <span className="fader-label">{label}</span> : null}
    </div>
  )
}
