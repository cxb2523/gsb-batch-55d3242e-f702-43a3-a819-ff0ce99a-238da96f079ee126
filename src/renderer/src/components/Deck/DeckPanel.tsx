import { memo, useCallback, useState } from 'react'
import { Pause, Play, X } from 'lucide-react'
import { MAX_PITCH_PERCENT, MIN_PITCH_PERCENT } from '../../audio/deck'
import type { LoopState } from '../../audio/deckTypes'
import { Overview } from '../Waveform/Overview'
import { ZoomWaveform } from '../Waveform/ZoomWaveform'
import type { WaveformData } from '../../audio/waveformData'
import { Fader } from '../controls/Fader'
import { JogWheel } from '../controls/JogWheel'
import { useCueButton } from './useCueButton'

interface DeckPanelProps {
  deckId: 'A' | 'B'
  accent: string
  trackName: string
  artworkUrl?: string
  position: number
  duration: number
  isPlaying: boolean
  isLoading: boolean
  loadingMessage?: string
  errorMessage?: string
  pitch: number
  bpm: number
  firstBeatOffset: number
  effectiveBpm: number
  waveform: WaveformData | null
  loop: LoopState
  masterDeckId: 'A' | 'B' | null
  masterEffectiveBpm: number
  phaseOffset: number
  getPosition: () => number
  onLoad: (file: File) => Promise<void>
  onTrackDrop: (trackId: string) => Promise<void>
  onTogglePlayback: () => Promise<void>
  onCueDown: () => Promise<void>
  onCueSet: () => void
  onCueUp: () => void
  onPitchChange: (percent: number) => void
  onSync: () => void
  onNudge: (direction: -1 | 1) => void
  onJogBend: (degrees: number) => void
  onJogScratchEnd: () => void
  onJogScratchStart: () => number
  onJogScrub: (seconds: number, direction: -1 | 1) => void
  onLoopExit: () => void
  onAutoLoop: (beats: number) => void
  onSeek: (seconds: number) => void
  onDismissError?: () => void
}

const PITCH_SCALE = { count: 17, majorEvery: 2 }

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) {
    return '0:00'
  }

  const wholeSeconds = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(wholeSeconds / 60)
  const remainingSeconds = wholeSeconds % 60
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

function formatBpm(bpm: number): string {
  return bpm > 0 ? bpm.toFixed(1) : '--.-'
}

function formatPhaseOffset(seconds: number): string {
  if (Math.abs(seconds) < 0.01) {
    return 'LOCK'
  }

  return seconds > 0 ? 'EARLY' : 'LATE'
}

export const DeckPanel = memo(function DeckPanel({
  deckId,
  accent,
  trackName,
  artworkUrl,
  position,
  duration,
  isPlaying,
  isLoading,
  loadingMessage,
  errorMessage,
  pitch,
  bpm,
  firstBeatOffset,
  effectiveBpm,
  waveform,
  loop,
  masterDeckId,
  masterEffectiveBpm,
  phaseOffset,
  getPosition,
  onLoad,
  onTrackDrop,
  onTogglePlayback,
  onCueDown,
  onCueSet,
  onCueUp,
  onPitchChange,
  onSync,
  onNudge,
  onJogBend,
  onJogScratchEnd,
  onJogScratchStart,
  onJogScrub,
  onLoopExit,
  onAutoLoop,
  onSeek,
  onDismissError
}: DeckPanelProps): JSX.Element {
  const remaining = Math.max(0, duration - position)
  const hasTrack = duration > 0
  const [syncFlashing, setSyncFlashing] = useState(false)
  const [loopBeats, setLoopBeats] = useState<4 | 8>(8)
  const isMaster = masterDeckId === deckId
  const hasMaster = masterDeckId !== null
  const deckRole = !hasTrack ? 'EMPTY' : isMaster ? 'MASTER' : hasMaster ? 'FOLLOW' : 'READY'
  const canSync = hasTrack && bpm > 0 && masterEffectiveBpm > 0 && masterDeckId !== null && !isMaster
  const requiredSyncPitch = bpm > 0 && masterEffectiveBpm > 0 ? (masterEffectiveBpm / bpm - 1) * 100 : 0
  const syncOutOfRange = canSync && Math.abs(requiredSyncPitch) > MAX_PITCH_PERCENT
  const phaseMeterOffset = Math.max(-1, Math.min(1, phaseOffset / 0.18))
  const showPhase = hasTrack && hasMaster && !isMaster && isPlaying

  const handlePlaybackClick = useCallback((): void => {
    void onTogglePlayback()
  }, [onTogglePlayback])

  const cueButtonHandlers = useCueButton({ isPlaying, onCueDown, onCueSet, onCueUp })

  const handleSyncClick = useCallback((): void => {
    onSync()
    setSyncFlashing(true)
    window.setTimeout(() => setSyncFlashing(false), 280)
  }, [onSync])

  const handleDragOver = useCallback((event: React.DragEvent<HTMLElement>): void => {
    if (isLoading) {
      return
    }

    if (event.dataTransfer.types.includes('Files') || event.dataTransfer.types.includes('text/plain')) {
      event.preventDefault()
      event.currentTarget.classList.add('deck-panel-drop-target')
    }
  }, [isLoading])

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLElement>): void => {
    event.currentTarget.classList.remove('deck-panel-drop-target')
  }, [])

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLElement>): void => {
      event.preventDefault()
      event.currentTarget.classList.remove('deck-panel-drop-target')

      if (isLoading) {
        return
      }

      const file = Array.from(event.dataTransfer.files).find((item) =>
        item.type.startsWith('audio/')
      )
      const trackId = event.dataTransfer.getData('text/plain')

      if (file) {
        void onLoad(file)
      } else if (trackId) {
        void onTrackDrop(trackId)
      }
    },
    [isLoading, onLoad, onTrackDrop]
  )

  return (
    <section
      className={`console-panel deck-panel ${hasTrack ? '' : 'deck-panel-empty'} ${isLoading ? 'deck-panel-loading' : ''}`}
      style={{ '--deck-accent': accent } as React.CSSProperties}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {isLoading ? (
        <div className="deck-loading-overlay" role="status" aria-live="polite">
          <span className="deck-loading-spinner" aria-hidden="true" />
          <span>{loadingMessage ?? 'Loading track...'}</span>
        </div>
      ) : null}

      {errorMessage ? (
        <div className="deck-error" role="alert">
          <span>{errorMessage}</span>
          <button aria-label={`Dismiss deck ${deckId} error`} type="button" onClick={onDismissError}>
            <X aria-hidden="true" size={13} />
          </button>
        </div>
      ) : null}

      <div className="deck-waveforms">
        <ZoomWaveform
          accent={accent}
          bpm={bpm}
          duration={duration}
          firstBeatOffset={firstBeatOffset}
          getPosition={getPosition}
          waveform={waveform}
          onSeek={onSeek}
        />
        <Overview
          accent={accent}
          duration={duration}
          getPosition={getPosition}
          waveform={waveform}
          onSeek={onSeek}
        />
      </div>

      <div className="led-display">
        {hasTrack ? (
          artworkUrl ? (
            <img alt="" className="deck-artwork deck-artwork-image" src={artworkUrl} />
          ) : (
            <span className="deck-artwork" aria-hidden="true" />
          )
        ) : null}
        <div className="led-content">
          <p className="led-title" title={trackName}>
            {hasTrack ? trackName : 'No track loaded'}
          </p>
          <div className={`led-row ${hasTrack ? '' : 'led-row-empty'}`}>
            <span>{formatTime(position)}</span>
            <span className="led-bpm">{formatBpm(effectiveBpm)} BPM</span>
            <span className="led-remaining">-{formatTime(remaining)}</span>
          </div>
        </div>
      </div>

      <div className="deck-center">
        <div className="deck-jog-area">
          {hasTrack ? (
            <JogWheel
              accent={accent}
              duration={duration}
              isPlaying={isPlaying}
              label={`Deck ${deckId} jog wheel`}
              position={position}
              onBend={onJogBend}
              onScratchEnd={onJogScratchEnd}
              onScratchStart={onJogScratchStart}
              onScrub={onJogScrub}
              onSeek={onSeek}
            />
          ) : (
            <div className="deck-drop-hint">
              <p>Drop a track here</p>
              <p className="deck-drop-sub">or use the folder button</p>
            </div>
          )}
        </div>
        <div className="deck-pitch">
          <span className="fader-label">Pitch</span>
          <Fader
            centerDetent
            accent={accent}
            disabled={!hasTrack}
            hideLabel
            label="Pitch"
            max={MAX_PITCH_PERCENT}
            min={MIN_PITCH_PERCENT}
            scale={PITCH_SCALE}
            step={0.1}
            variant="pitch"
            value={pitch}
            valueFormatter={(value) => `${value > 0 ? '+' : ''}${value.toFixed(1)}%`}
            onChange={onPitchChange}
          />
          <button
            className={`led-button ${syncFlashing ? 'led-button-flash' : ''} ${syncOutOfRange ? 'led-button-warn' : ''}`}
            disabled={isLoading || !canSync}
            title={
              !canSync
                ? 'Load two analyzed tracks to sync'
                : syncOutOfRange
                  ? `Master tempo needs ${requiredSyncPitch.toFixed(1)}% pitch (range is ±${MAX_PITCH_PERCENT}%) — sync will only get close`
                  : 'Match BPM and beat with the master deck (starts playback if stopped)'
            }
            type="button"
            onClick={handleSyncClick}
          >
            SYNC
          </button>
          <span aria-hidden="true" className="deck-pitch-dots">
            <span className="deck-pitch-dot deck-pitch-dot-lit" />
            <span className="deck-pitch-dot" />
          </span>
        </div>
      </div>

      <div className="phase-strip">
        <span className={`master-pill ${isMaster ? 'master-pill-lit' : ''}`}>{deckRole}</span>
        <div className="phase-meter" aria-label={showPhase ? `Beat phase ${formatPhaseOffset(phaseOffset)}` : 'No active master deck'}>
          <span className="phase-meter-center" />
          <span
            className="phase-meter-dot"
            style={{ left: showPhase ? `${50 + phaseMeterOffset * 45}%` : '50%' }}
          />
        </div>
        <span className="phase-label">{showPhase ? formatPhaseOffset(phaseOffset) : '--'}</span>
      </div>

      <div className="deck-control-row">
        <button
          aria-label={isPlaying ? 'Pause' : 'Play'}
          className={`transport-button transport-primary ${isPlaying ? 'transport-button-lit transport-button-pulse' : ''}`}
          disabled={isLoading || !hasTrack}
          title={isPlaying ? 'Pause' : 'Play'}
          type="button"
          onClick={handlePlaybackClick}
        >
          {isPlaying ? <Pause size={18} strokeWidth={2.4} /> : <Play size={18} strokeWidth={2.4} />}
        </button>
        <button
          aria-label="Cue"
          className={`transport-button ${cueButtonHandlers.cueSetFlashing ? 'led-button-flash' : ''}`}
          disabled={isLoading || !hasTrack}
          title="CUE: click to set, hold to preview, or return while playing"
          type="button"
          onBlur={cueButtonHandlers.onBlur}
          onKeyDown={cueButtonHandlers.onKeyDown}
          onKeyUp={cueButtonHandlers.onKeyUp}
          onLostPointerCapture={cueButtonHandlers.onLostPointerCapture}
          onPointerCancel={cueButtonHandlers.onPointerCancel}
          onPointerDown={cueButtonHandlers.onPointerDown}
          onPointerUp={cueButtonHandlers.onPointerUp}
        >
          CUE
        </button>
        <button
          aria-label="Nudge backward"
          className="transport-button"
          disabled={isLoading || !hasTrack}
          title="Nudge beat later"
          type="button"
          onClick={() => onNudge(-1)}
        >
          -
        </button>
        <button
          aria-label="Nudge forward"
          className="transport-button"
          disabled={isLoading || !hasTrack}
          title="Nudge beat earlier"
          type="button"
          onClick={() => onNudge(1)}
        >
          +
        </button>
        <button
          aria-label={loop.active ? 'Exit loop' : `Start ${loopBeats}-beat loop`}
          className={`loop-button ${loop.active ? 'loop-button-lit' : ''}`}
          disabled={isLoading || !hasTrack || bpm <= 0}
          title={loop.active ? 'Exit active loop' : `Start a ${loopBeats}-beat loop`}
          type="button"
          onClick={() => (loop.active ? onLoopExit() : onAutoLoop(loopBeats))}
        >
          <span className="control-button-label">Loop</span>
          <span>{loopBeats}B</span>
        </button>
        <button
          aria-label="Toggle loop length"
          className="transport-button"
          disabled={isLoading || !hasTrack || bpm <= 0}
          title="Toggle loop length between 4 and 8 beats"
          type="button"
          onClick={() => setLoopBeats((current) => (current === 4 ? 8 : 4))}
        >
          4/8
        </button>
      </div>
    </section>
  )
})
