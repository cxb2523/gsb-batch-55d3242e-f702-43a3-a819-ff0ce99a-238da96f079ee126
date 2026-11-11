import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DJEngine } from '../audio/engine'
import { Recorder } from '../recording/recorder'
import { createIdleRecorderSnapshot } from '../recording/recorderState'
import type { RecorderPhase, RecordingMode, RecorderSnapshot } from '../recording/recorderTypes'

export interface RecorderState {
  phase: RecorderPhase
  mode: RecordingMode | null
  elapsedMs: number
  countdownRemaining: number | null
  warning: string | null
  error: string | null
  filePath: string | null
  start: (mode: RecordingMode) => void
  stop: () => void
  reveal: () => void
  dismiss: () => void
}

const SAVED_AUTO_DISMISS_MS = 8000

export function useRecorder(engine: DJEngine): RecorderState {
  const recorderRef = useRef<Recorder | null>(null)
  const [snapshot, setSnapshot] = useState<RecorderSnapshot>(() => createIdleRecorderSnapshot())
  const [elapsedMs, setElapsedMs] = useState(0)

  if (!recorderRef.current) {
    recorderRef.current = new Recorder(() => engine.mixer.recordStream)
  }

  useEffect(() => {
    const recorder = recorderRef.current

    if (!recorder) {
      return
    }

    recorder.onChange = setSnapshot
    return () => {
      recorder.onChange = null
      void recorder.dispose()
    }
  }, [])

  useEffect(() => {
    if (snapshot.phase !== 'recording' || snapshot.startedAtMs === null) {
      setElapsedMs(0)
      return
    }

    const startedAt = snapshot.startedAtMs
    setElapsedMs(Date.now() - startedAt)
    const intervalId = window.setInterval(() => setElapsedMs(Date.now() - startedAt), 500)
    return () => window.clearInterval(intervalId)
  }, [snapshot.phase, snapshot.startedAtMs])

  useEffect(() => {
    if (snapshot.phase !== 'saved') {
      return
    }

    const timeoutId = window.setTimeout(() => recorderRef.current?.dismiss(), SAVED_AUTO_DISMISS_MS)
    return () => window.clearTimeout(timeoutId)
  }, [snapshot.phase])

  const start = useCallback(
    (mode: RecordingMode): void => {
      if (engine.mixer.context.state === 'suspended') {
        void engine.mixer.context.resume()
      }

      void recorderRef.current?.start(mode)
    },
    [engine]
  )

  const stop = useCallback((): void => {
    void recorderRef.current?.stop()
  }, [])

  const reveal = useCallback((): void => {
    if (snapshot.filePath) {
      void window.nextdj?.revealRecording(snapshot.filePath)
    }
  }, [snapshot.filePath])

  const dismiss = useCallback((): void => {
    recorderRef.current?.dismiss()
  }, [])

  return useMemo(
    () => ({
      phase: snapshot.phase,
      mode: snapshot.mode,
      elapsedMs,
      countdownRemaining: snapshot.countdownRemaining,
      warning: snapshot.warning,
      error: snapshot.error,
      filePath: snapshot.filePath,
      start,
      stop,
      reveal,
      dismiss
    }),
    [
      dismiss,
      elapsedMs,
      reveal,
      snapshot.countdownRemaining,
      snapshot.error,
      snapshot.filePath,
      snapshot.mode,
      snapshot.phase,
      snapshot.warning,
      start,
      stop
    ]
  )
}
