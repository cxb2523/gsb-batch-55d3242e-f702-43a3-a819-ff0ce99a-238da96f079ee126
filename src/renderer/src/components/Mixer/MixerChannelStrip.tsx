import { memo } from 'react'
import type { EqBand } from '../../audio/deck'
import type { DeckId } from '../../app/engineTypes'
import { Fader } from '../controls/Fader'
import { Knob } from '../controls/Knob'
import type { ChannelValues } from './MixerPanel'

interface MixerChannelStripProps {
  deckId: DeckId
  accent: string
  values: ChannelValues
  onTrimChange: (deckId: DeckId, value: number) => void
  onEqChange: (deckId: DeckId, band: EqBand, value: number) => void
  onChannelVolumeChange: (deckId: DeckId, value: number) => void
  onCueToggle: (deckId: DeckId) => void
}

const EQ_BANDS: Array<{ band: EqBand; label: string }> = [
  { band: 'high', label: 'Hi' },
  { band: 'mid', label: 'Mid' },
  { band: 'low', label: 'Low' }
]

export const MixerChannelStrip = memo(function MixerChannelStrip({
  deckId,
  accent,
  values,
  onTrimChange,
  onEqChange,
  onChannelVolumeChange,
  onCueToggle
}: MixerChannelStripProps): JSX.Element {
  return (
    <div className="channel-strip">
      <Knob
        accent={accent}
        defaultValue={1}
        label="Trim"
        max={1.5}
        min={0}
        step={0.01}
        value={values.trim}
        valueFormatter={(value) => value.toFixed(2)}
        onChange={(value) => onTrimChange(deckId, value)}
      />

      {EQ_BANDS.map(({ band, label }) => (
        <Knob
          key={band}
          accent={accent}
          defaultValue={0}
          label={label}
          max={6}
          min={-26}
          step={0.5}
          value={values.eq[band]}
          valueFormatter={(value) => `${value > 0 ? '+' : ''}${value.toFixed(1)} dB`}
          onChange={(value) => onEqChange(deckId, band, value)}
        />
      ))}

      <button
        aria-pressed={values.cue}
        className={`cue-button ${values.cue ? 'cue-button-lit' : ''}`}
        style={{ '--cue-accent': accent } as React.CSSProperties}
        title="Listen on headphones"
        type="button"
        onClick={() => onCueToggle(deckId)}
      >
        CUE
      </button>

      <div className="channel-fader-row">
        <Fader
          accent={accent}
          label={`Channel ${deckId} volume`}
          hideLabel
          showFill
          max={1}
          min={0}
          scale={{ count: 17, majorEvery: 2 }}
          variant="channel"
          value={values.volume}
          valueFormatter={(value) => `${Math.round(value * 100)}%`}
          onChange={(value) => onChannelVolumeChange(deckId, value)}
        />
      </div>
    </div>
  )
})
