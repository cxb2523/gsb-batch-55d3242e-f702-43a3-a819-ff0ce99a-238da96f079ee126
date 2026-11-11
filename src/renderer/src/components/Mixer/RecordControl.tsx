import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Circle, Video, Webcam, AudioLines } from 'lucide-react'
import type { RecorderState } from '../../hooks/useRecorder'
import type { RecordingMode } from '../../recording/recorderTypes'

const MODE_OPTIONS: Array<{ mode: RecordingMode; label: string; icon: JSX.Element }> = [
  { mode: 'audio', label: 'Audio', icon: <AudioLines size={13} strokeWidth={2.2} /> },
  { mode: 'audio-screen', label: 'Audio + Screen', icon: <Video size={13} strokeWidth={2.2} /> },
  {
    mode: 'audio-screen-camera',
    label: 'Audio + Screen + Cam',
    icon: <Webcam size={13} strokeWidth={2.2} />
  }
]

function formatElapsed(elapsedMs: number): string {
  const totalSeconds = Math.floor(elapsedMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function RecordControl({ recorder }: { recorder: RecorderState }): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!menuOpen) {
      return
    }

    const handlePointerDown = (event: PointerEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.code === 'Escape') {
        setMenuOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen])

  const handleModeSelect = useCallback(
    (mode: RecordingMode): void => {
      setMenuOpen(false)
      recorder.start(mode)
    },
    [recorder]
  )

  if (recorder.phase === 'countdown') {
    return (
      <div className="rec-control">
        <button
          aria-label="Cancel recording countdown"
          className="rec-button rec-button-countdown"
          title="Cancel recording countdown"
          type="button"
          onClick={() => recorder.stop()}
        >
          <span>REC IN</span>
          <span className="rec-countdown-value">{recorder.countdownRemaining ?? 5}</span>
        </button>
      </div>
    )
  }

  if (recorder.phase === 'recording' || recorder.phase === 'stopping' || recorder.phase === 'starting') {
    return (
      <div className="rec-control">
        <button
          aria-label="Stop recording"
          className="rec-button rec-button-live"
          disabled={recorder.phase !== 'recording'}
          title="Stop recording"
          type="button"
          onClick={() => recorder.stop()}
        >
          <span aria-hidden="true" className="rec-dot" />
          <span className="rec-elapsed">
            {recorder.phase === 'recording' ? formatElapsed(recorder.elapsedMs) : '···'}
          </span>
        </button>
        {recorder.warning ? <p className="rec-note">{recorder.warning}</p> : null}
      </div>
    )
  }

  if (recorder.phase === 'saved') {
    return (
      <div className="rec-control">
        <button
          aria-label="Recording saved, show in Finder"
          className="rec-button rec-button-saved"
          title="Show the recording in Finder"
          type="button"
          onClick={() => recorder.reveal()}
        >
          <Check size={13} strokeWidth={2.6} />
          <span>Saved</span>
        </button>
        {recorder.warning ? <p className="rec-note">{recorder.warning}</p> : null}
      </div>
    )
  }

  return (
    <div ref={containerRef} className="rec-control">
      <button
        aria-expanded={menuOpen}
        aria-label="Start recording"
        className="rec-button"
        title="Record the session"
        type="button"
        onClick={() => {
          recorder.dismiss()
          setMenuOpen((current) => !current)
        }}
      >
        <Circle fill="currentColor" size={9} strokeWidth={0} />
        <span>REC</span>
      </button>
      {recorder.phase === 'error' && recorder.error ? (
        <p className="rec-note rec-note-error">{recorder.error}</p>
      ) : null}
      {menuOpen ? (
        <div className="rec-popover" role="menu">
          {MODE_OPTIONS.map(({ mode, label, icon }) => (
            <button
              key={mode}
              className="rec-popover-item"
              role="menuitem"
              type="button"
              onClick={() => handleModeSelect(mode)}
            >
              {icon}
              <span>{label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
