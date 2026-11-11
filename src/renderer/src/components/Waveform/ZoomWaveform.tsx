import { useCallback, useEffect, useMemo, useRef } from 'react'
import { createFrameMeter } from '../../performance/frameMetrics'
import { subscribeVisualFrame } from '../../performance/visualClock'
import { hasCanvasFrameChanged, type CanvasFrameState } from './canvasFrameState'
import type { WaveformData } from '../../audio/waveformData'
import { getLowPeakAt, getPeakAt } from '../../audio/waveformData'
import { getWaveformKeyboardSeekPosition } from './waveformKeyboard'

interface ZoomWaveformProps {
  accent: string
  bpm: number
  duration: number
  firstBeatOffset: number
  getPosition: () => number
  waveform: WaveformData | null
  onSeek: (seconds: number) => void
}

const DEFAULT_WINDOW_SECONDS = 8
const MAX_VISIBLE_BEATS = 16
const PLAYHEAD_RATIO = 0.38
const LOW_BAND_GAIN = 1.5

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function getWindowStart(position: number, duration: number, windowSeconds: number): number {
  if (duration <= windowSeconds) {
    return 0
  }

  return clamp(position - windowSeconds * PLAYHEAD_RATIO, 0, duration - windowSeconds)
}

function getZoomWindowSeconds(duration: number, bpm: number): number {
  if (duration <= 0) {
    return DEFAULT_WINDOW_SECONDS
  }

  if (bpm > 0) {
    const beatWindow = (60 / bpm) * MAX_VISIBLE_BEATS

    if (Number.isFinite(beatWindow) && beatWindow > 0) {
      return Math.min(duration, beatWindow)
    }
  }

  return Math.min(duration, DEFAULT_WINDOW_SECONDS)
}

function drawBeatGrid(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  dpr: number,
  bpm: number,
  firstBeatOffset: number,
  windowStart: number,
  windowSeconds: number
): void {
  if (bpm <= 0) {
    return
  }

  const beatSeconds = 60 / bpm

  if (!Number.isFinite(beatSeconds) || beatSeconds <= 0) {
    return
  }

  const firstBeat = Math.ceil((windowStart - firstBeatOffset) / beatSeconds)
  const lastBeat = Math.floor((windowStart + windowSeconds - firstBeatOffset) / beatSeconds)

  for (let beat = firstBeat; beat <= lastBeat; beat += 1) {
    const beatTime = firstBeatOffset + beat * beatSeconds
    const x = ((beatTime - windowStart) / windowSeconds) * width
    const isBar = Math.abs(beat % 4) === 0

    context.strokeStyle = isBar ? 'rgba(255,255,255,0.26)' : 'rgba(255,255,255,0.11)'
    context.lineWidth = isBar ? 1.4 * dpr : 1 * dpr
    context.beginPath()
    context.moveTo(x, 0)
    context.lineTo(x, height)
    context.stroke()
  }
}

function drawCanvas(
  canvas: HTMLCanvasElement,
  waveform: WaveformData | null,
  accent: string,
  duration: number,
  position: number,
  bpm: number,
  firstBeatOffset: number
): void {
  const rect = canvas.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  const width = Math.max(1, Math.floor(rect.width * dpr))
  const height = Math.max(1, Math.floor(rect.height * dpr))

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }

  const context = canvas.getContext('2d')

  if (!context) {
    return
  }

  context.clearRect(0, 0, width, height)
  context.fillStyle = '#05080b'
  context.fillRect(0, 0, width, height)

  const windowSeconds = getZoomWindowSeconds(duration, bpm)
  const windowStart = getWindowStart(position, duration, windowSeconds)
  const playheadX = clamp(((position - windowStart) / windowSeconds) * width, 0, width)
  const centerY = height / 2

  context.strokeStyle = 'rgba(255,255,255,0.08)'
  context.lineWidth = 1 * dpr
  context.beginPath()
  context.moveTo(0, centerY)
  context.lineTo(width, centerY)
  context.stroke()

  if (waveform && duration > 0) {
    context.lineWidth = Math.max(1, dpr)
    const highPlayedPath = new Path2D()
    const highPendingPath = new Path2D()
    const lowPlayedPath = new Path2D()
    const lowPendingPath = new Path2D()

    for (let x = 0; x < width; x += dpr) {
      const time = windowStart + (x / width) * windowSeconds

      if (time < 0 || time > duration) {
        continue
      }

      const bucketIndex = (time / duration) * waveform.zoom.bucketCount
      const played = x <= playheadX
      const highPath = played ? highPlayedPath : highPendingPath
      const lowPath = played ? lowPlayedPath : lowPendingPath

      const { min, max } = getPeakAt(waveform.zoom, bucketIndex)
      highPath.moveTo(x, centerY + min * centerY * 0.9)
      highPath.lineTo(x, centerY + max * centerY * 0.9)

      const low = getLowPeakAt(waveform.zoom, bucketIndex)
      const lowMin = clamp(low.min * LOW_BAND_GAIN, -1, 1)
      const lowMax = clamp(low.max * LOW_BAND_GAIN, -1, 1)
      lowPath.moveTo(x, centerY + lowMin * centerY * 0.9)
      lowPath.lineTo(x, centerY + lowMax * centerY * 0.9)
    }

    context.strokeStyle = accent
    context.globalAlpha = 0.16
    context.stroke(highPlayedPath)
    context.globalAlpha = 0.32
    context.stroke(highPendingPath)
    context.globalAlpha = 0.5
    context.stroke(lowPlayedPath)
    context.globalAlpha = 0.95
    context.stroke(lowPendingPath)
  }

  drawBeatGrid(context, width, height, dpr, bpm, firstBeatOffset, windowStart, windowSeconds)

  context.globalAlpha = 1
  context.fillStyle = accent
  context.fillRect(playheadX - dpr, 0, dpr * 2, height)
  context.beginPath()
  context.moveTo(playheadX - 6 * dpr, 0)
  context.lineTo(playheadX + 6 * dpr, 0)
  context.lineTo(playheadX, 8 * dpr)
  context.closePath()
  context.fill()
}

export function ZoomWaveform({
  accent,
  bpm,
  duration,
  firstBeatOffset,
  getPosition,
  waveform,
  onSeek
}: ZoomWaveformProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const draggingRef = useRef(false)
  const dragWindowStartRef = useRef(0)
  const windowSeconds = useMemo(() => getZoomWindowSeconds(duration, bpm), [bpm, duration])

  useEffect(() => {
    const frameMeter = createFrameMeter('waveform.zoom')
    let previousFrame: CanvasFrameState | null = null

    const tick = (): void => {
      const canvas = canvasRef.current

      if (canvas) {
        const rect = canvas.getBoundingClientRect()
        const dpr = window.devicePixelRatio || 1
        const nextFrame = {
          dpr,
          height: Math.max(1, Math.floor(rect.height * dpr)),
          position: getPosition(),
          width: Math.max(1, Math.floor(rect.width * dpr))
        }

        if (hasCanvasFrameChanged(previousFrame, nextFrame)) {
          previousFrame = nextFrame
          frameMeter.measure(() => {
            drawCanvas(canvas, waveform, accent, duration, nextFrame.position, bpm, firstBeatOffset)
          })
        }
      }

    }

    return subscribeVisualFrame(tick)
  }, [accent, bpm, duration, firstBeatOffset, getPosition, waveform])

  const seekFromPointer = useCallback(
    (clientX: number, windowStart: number): void => {
      const canvas = canvasRef.current

      if (!canvas || duration <= 0) {
        return
      }

      const rect = canvas.getBoundingClientRect()
      const ratio = clamp((clientX - rect.left) / rect.width, 0, 1)

      onSeek(clamp(windowStart + ratio * windowSeconds, 0, duration))
    },
    [duration, onSeek, windowSeconds]
  )

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>): void => {
      dragWindowStartRef.current = getWindowStart(getPosition(), duration, windowSeconds)
      draggingRef.current = true
      event.currentTarget.setPointerCapture(event.pointerId)
      seekFromPointer(event.clientX, dragWindowStartRef.current)
    },
    [duration, getPosition, seekFromPointer, windowSeconds]
  )

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>): void => {
      if (draggingRef.current) {
        seekFromPointer(event.clientX, dragWindowStartRef.current)
      }
    },
    [seekFromPointer]
  )

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLCanvasElement>): void => {
    draggingRef.current = false
    event.currentTarget.releasePointerCapture(event.pointerId)
  }, [])

  const handlePointerCancel = useCallback((event: React.PointerEvent<HTMLCanvasElement>): void => {
    draggingRef.current = false
    event.currentTarget.releasePointerCapture(event.pointerId)
  }, [])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLCanvasElement>): void => {
      const beatSeconds = bpm > 0 ? 60 / bpm : 1
      const nextPosition = getWaveformKeyboardSeekPosition(
        event.key,
        getPosition(),
        duration,
        beatSeconds,
        beatSeconds * 4
      )

      if (nextPosition !== null) {
        event.preventDefault()
        onSeek(nextPosition)
      }
    },
    [bpm, duration, getPosition, onSeek]
  )

  const currentPosition = clamp(getPosition(), 0, duration)

  return (
    <canvas
      ref={canvasRef}
      aria-label="Zoomed deck waveform"
      aria-valuemax={duration}
      aria-valuemin={0}
      aria-valuenow={currentPosition}
      className="waveform-canvas waveform-zoom"
      role="slider"
      tabIndex={duration > 0 ? 0 : -1}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerCancel={handlePointerCancel}
      onPointerUp={handlePointerUp}
    />
  )
}
