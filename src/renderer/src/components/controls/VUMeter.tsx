import { useEffect, useMemo, useRef, useState } from 'react'
import { createFrameMeter } from '../../performance/frameMetrics'
import { subscribeVisualFrame } from '../../performance/visualClock'
import { calculateMeterLevel, getLitSegmentCount, getPeakSegment, getVuSegmentColor } from './vuMeterMath'

interface VUMeterProps {
  analyser: AnalyserNode | null
  label?: string
  segments?: number
}

const PEAK_HOLD_MS = 800

interface MeterViewState {
  litSegments: number
  peakSegment: number
}

const EMPTY_METER: MeterViewState = {
  litSegments: 0,
  peakSegment: -1
}

export function VUMeter({ analyser, label, segments = 18 }: VUMeterProps): JSX.Element {
  const [meter, setMeter] = useState<MeterViewState>(EMPTY_METER)
  const dataRef = useRef<Uint8Array<ArrayBuffer> | null>(null)
  const levelRef = useRef(0)
  const peakRef = useRef({ value: 0, at: 0 })
  const meterRef = useRef<MeterViewState>(EMPTY_METER)
  const segmentItems = useMemo(
    () => Array.from({ length: segments }, (_, index) => index),
    [segments]
  )

  useEffect(() => {
    if (!analyser) {
      levelRef.current = 0
      peakRef.current = { value: 0, at: 0 }
      meterRef.current = EMPTY_METER
      setMeter(EMPTY_METER)
      return
    }

    dataRef.current = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>
    const frameMeter = createFrameMeter('vu.meter')

    const tick = (): void => {
      const data = dataRef.current

      if (data) {
        frameMeter.measure(() => {
          analyser.getByteTimeDomainData(data)
          const targetLevel = calculateMeterLevel(data)
          const nextLevel =
            targetLevel > levelRef.current
              ? targetLevel
              : levelRef.current * 0.88 + targetLevel * 0.12

          levelRef.current = nextLevel < 0.01 ? 0 : nextLevel

          const now = performance.now()

          if (levelRef.current >= peakRef.current.value || now - peakRef.current.at > PEAK_HOLD_MS) {
            peakRef.current = { value: levelRef.current, at: now }
          }

          const nextMeter = {
            litSegments: getLitSegmentCount(levelRef.current, segments),
            peakSegment: getPeakSegment(peakRef.current.value, segments)
          }

          if (
            nextMeter.litSegments !== meterRef.current.litSegments ||
            nextMeter.peakSegment !== meterRef.current.peakSegment
          ) {
            meterRef.current = nextMeter
            setMeter(nextMeter)
          }
        })
      }

    }

    return subscribeVisualFrame(tick)
  }, [analyser, segments])

  return (
    <div className="vu">
      <div aria-label={label ?? 'VU meter'} className="vu-meter">
        {segmentItems.map((segment) => {
          const lit = segment < meter.litSegments || segment === meter.peakSegment
          const color = getVuSegmentColor(segment, segments)

          return <span key={segment} className={`vu-segment vu-${color} ${lit ? 'vu-lit' : ''}`} />
        })}
      </div>
      {label ? <span className="vu-label">{label}</span> : null}
    </div>
  )
}
