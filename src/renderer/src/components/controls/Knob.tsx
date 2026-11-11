import { useCallback, useRef, useState } from 'react'
import { hasReleasedPointerButtons, useCancelDragOnWindowBlur } from './usePointerDragSafety'

interface KnobProps {
  value: number
  min: number
  max: number
  defaultValue: number
  label: string
  accent: string
  onChange: (value: number) => void
  step?: number
  hideLabel?: boolean
  valueFormatter?: (value: number) => string
}

const SWEEP_DEGREES = 270
const START_DEGREES = -135
const TICK_COUNT = 11

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function Knob({
  value,
  min,
  max,
  defaultValue,
  label,
  accent,
  onChange,
  step = 0.01,
  hideLabel = false,
  valueFormatter = (nextValue) => nextValue.toFixed(1)
}: KnobProps): JSX.Element {
  const dragRef = useRef<{ y: number; value: number } | null>(null)
  const [showValue, setShowValue] = useState(false)
  const percentage = (value - min) / (max - min)
  const angle = START_DEGREES + percentage * SWEEP_DEGREES

  const commitValue = useCallback(
    (nextValue: number): void => {
      const stepped = Math.round(nextValue / step) * step
      const committed = Number(clamp(stepped, min, max).toFixed(4))

      if (committed !== value) {
        onChange(committed)
      }
    },
    [max, min, onChange, step, value]
  )

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>): void => {
      event.currentTarget.setPointerCapture(event.pointerId)
      dragRef.current = { y: event.clientY, value }
      setShowValue(true)
    },
    [value]
  )

  const clearDrag = useCallback((): void => {
    dragRef.current = null
    setShowValue(false)
  }, [])

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>): void => {
      if (!dragRef.current) {
        return
      }

      if (hasReleasedPointerButtons(event.nativeEvent)) {
        clearDrag()
        return
      }

      const delta = dragRef.current.y - event.clientY
      commitValue(dragRef.current.value + (delta / 160) * (max - min))
    },
    [clearDrag, commitValue, max, min]
  )

  useCancelDragOnWindowBlur(clearDrag)

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>): void => {
      const direction = event.key === 'ArrowUp' || event.key === 'ArrowRight' ? 1 : -1

      if (event.key === 'Home') {
        event.preventDefault()
        commitValue(min)
      } else if (event.key === 'End') {
        event.preventDefault()
        commitValue(max)
      } else if (event.key === 'PageUp' || event.key === 'PageDown') {
        event.preventDefault()
        commitValue(value + (event.key === 'PageUp' ? 1 : -1) * step * 10)
      } else if (
        event.key === 'ArrowUp' ||
        event.key === 'ArrowRight' ||
        event.key === 'ArrowDown' ||
        event.key === 'ArrowLeft'
      ) {
        event.preventDefault()
        commitValue(value + direction * step)
      }
    },
    [commitValue, max, min, step, value]
  )

  const ticks = Array.from({ length: TICK_COUNT }, (_, index) => {
    const tickAngle = START_DEGREES + (index / (TICK_COUNT - 1)) * SWEEP_DEGREES
    return (
      <span
        key={index}
        className="knob-tick"
        style={{
          transform: `rotate(${tickAngle}deg) translateY(calc(var(--knob-size, 48px) / -2 - 8px))`
        }}
      />
    )
  })

  return (
    <div className="knob">
      <div className="knob-well">
        {ticks}
        {showValue ? <span className="knob-value-tip">{valueFormatter(value)}</span> : null}
        <button
          aria-label={label}
          aria-orientation="vertical"
          aria-valuemax={max}
          aria-valuemin={min}
          aria-valuenow={value}
          aria-valuetext={valueFormatter(value)}
          className="knob-shell"
          role="slider"
          style={{ '--knob-accent': accent } as React.CSSProperties}
          title={`${label}: ${valueFormatter(value)} (doble click: reset)`}
          type="button"
          onDoubleClick={() => commitValue(defaultValue)}
          onKeyDown={handleKeyDown}
          onLostPointerCapture={clearDrag}
          onPointerCancel={clearDrag}
          onPointerDown={handlePointerDown}
          onPointerEnter={() => setShowValue(true)}
          onPointerLeave={() => {
            if (!dragRef.current) {
              setShowValue(false)
            }
          }}
          onPointerMove={handlePointerMove}
          onPointerUp={clearDrag}
        >
          <span className="knob-face">
            <span className="knob-pointer" style={{ transform: `translateX(-50%) rotate(${angle}deg)` }} />
          </span>
        </button>
      </div>
      {hideLabel ? null : <span className="knob-label">{label}</span>}
    </div>
  )
}
