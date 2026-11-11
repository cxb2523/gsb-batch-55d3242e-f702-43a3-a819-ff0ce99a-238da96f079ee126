import { memo } from 'react'
import { Activity, Settings } from 'lucide-react'
import type { EqBand } from '../../audio/deck'
import type { DeckId } from '../../app/engineTypes'
import type { RecorderState } from '../../hooks/useRecorder'
import { Fader } from '../controls/Fader'
import { Knob } from '../controls/Knob'
import { VUMeter } from '../controls/VUMeter'
import { MixerChannelStrip } from './MixerChannelStrip'
import { RecordControl } from './RecordControl'

export interface ChannelValues {
  trim: number
  eq: Record<EqBand, number>
  volume: number
  cue: boolean
}

interface MixerPanelProps {
  channelA: ChannelValues
  channelB: ChannelValues
  crossfade: number
  cueMix: number
  masterAccent: string
  masterBeatIndex: number
  masterBpm: number
  masterVolume: number
  recorder: RecorderState
  analyserA: AnalyserNode | null
  analyserB: AnalyserNode | null
  onTrimChange: (deckId: DeckId, value: number) => void
  onEqChange: (deckId: DeckId, band: EqBand, value: number) => void
  onChannelVolumeChange: (deckId: DeckId, value: number) => void
  onCueToggle: (deckId: DeckId) => void
  onCrossfadeChange: (value: number) => void
  onCueMixChange: (value: number) => void
  onMasterVolumeChange: (value: number) => void
  onOpenSettings: () => void
  onOpenShortcuts: () => void
}

const BEAT_DOTS = [0, 1, 2, 3]

export const MixerPanel = memo(function MixerPanel({
  channelA,
  channelB,
  crossfade,
  cueMix,
  masterAccent,
  masterBeatIndex,
  masterVolume,
  recorder,
  analyserA,
  analyserB,
  onTrimChange,
  onEqChange,
  onChannelVolumeChange,
  onCueToggle,
  onCrossfadeChange,
  onCueMixChange,
  onMasterVolumeChange,
  onOpenSettings,
  onOpenShortcuts
}: MixerPanelProps): JSX.Element {
  return (
    <section className="console-panel mixer-panel">
      <div className="mixer-header">
        <h1 className="mixer-brand">MIXER</h1>
      </div>

      <div className="mixer-body">
        <MixerChannelStrip
          accent="var(--accent-a)"
          deckId="A"
          values={channelA}
          onChannelVolumeChange={onChannelVolumeChange}
          onCueToggle={onCueToggle}
          onEqChange={onEqChange}
          onTrimChange={onTrimChange}
        />

        <div className="master-strip">
          <div className="master-meter-bank">
            <VUMeter analyser={analyserA} segments={32} />
            <div className="master-meter-scale" aria-hidden="true">
              <span>+6</span>
              <span>+3</span>
              <span>0</span>
              <span>-3</span>
              <span>-6</span>
              <span>-10</span>
              <span>-15</span>
              <span>-20</span>
              <span>-30</span>
            </div>
            <VUMeter analyser={analyserB} segments={32} />
          </div>
          <div className="mixer-session">
            <span aria-hidden="true" className="mixer-session-dots">
              {BEAT_DOTS.map((beat) => (
                <span
                  key={beat}
                  className={`status-dot ${beat === masterBeatIndex ? 'status-dot-lit' : ''}`}
                  style={{ '--status-accent': masterAccent } as React.CSSProperties}
                />
              ))}
            </span>
            <RecordControl recorder={recorder} />
            <div className="mixer-session-actions">
              <button
                aria-label="Show keyboard shortcuts"
                className="icon-button"
                title="Keyboard shortcuts (?)"
                type="button"
                onClick={onOpenShortcuts}
              >
                <Activity size={15} strokeWidth={2.2} />
              </button>
              <button
                aria-label="Open output settings"
                className="icon-button"
                title="Output devices"
                type="button"
                onClick={onOpenSettings}
              >
                <Settings size={15} strokeWidth={2.2} />
              </button>
            </div>
          </div>
          <div className="master-knob">
            <span className="vu-label">Master</span>
            <Knob
              accent="#f8fafc"
              defaultValue={0.9}
              hideLabel
              label="Master"
              max={1}
              min={0}
              value={masterVolume}
              valueFormatter={(value) => `${Math.round(value * 100)}%`}
              onChange={onMasterVolumeChange}
            />
          </div>
          <div className="phones-mix">
            <span className="vu-label">Phones Mix</span>
            <Knob
              accent="#94a3b8"
              defaultValue={0}
              hideLabel
              label="Phones Mix"
              max={1}
              min={0}
              value={cueMix}
              valueFormatter={(value) => `${Math.round(value * 100)}%`}
              onChange={onCueMixChange}
            />
            <div className="phones-mix-scale">
              <span>CUE</span>
              <span>MIX</span>
            </div>
          </div>
        </div>

        <MixerChannelStrip
          accent="var(--accent-b)"
          deckId="B"
          values={channelB}
          onChannelVolumeChange={onChannelVolumeChange}
          onCueToggle={onCueToggle}
          onEqChange={onEqChange}
          onTrimChange={onTrimChange}
        />
      </div>

      <div className="crossfader-well">
        <span className="crossfader-side crossfader-side-a">A</span>
        <Fader
          accent="#e5e7eb"
          centerDetent
          hideLabel
          label="Crossfader"
          max={1}
          min={-1}
          orientation="horizontal"
          step={0.01}
          variant="crossfader"
          value={crossfade}
          valueFormatter={(value) => value.toFixed(2)}
          onChange={onCrossfadeChange}
        />
        <span className="crossfader-side crossfader-side-b">B</span>
      </div>
    </section>
  )
})
