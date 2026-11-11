import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { RecorderState } from '../../hooks/useRecorder'
import { MixerPanel } from './MixerPanel'

const recorder: RecorderState = {
  phase: 'idle',
  mode: null,
  elapsedMs: 0,
  countdownRemaining: null,
  warning: null,
  error: null,
  filePath: null,
  start: vi.fn(),
  stop: vi.fn(),
  reveal: vi.fn(),
  dismiss: vi.fn()
}

function renderMixer(overrides: Partial<Parameters<typeof MixerPanel>[0]> = {}) {
  return render(
    <MixerPanel
      analyserA={null}
      analyserB={null}
      channelA={{ trim: 0.8, eq: { high: 1, mid: 0, low: -2 }, volume: 0.7, cue: false }}
      channelB={{ trim: 1.1, eq: { high: 0, mid: 2, low: 0 }, volume: 0.5, cue: true }}
      crossfade={0}
      cueMix={0.25}
      masterAccent="#22d3ee"
      masterBeatIndex={2}
      masterBpm={126.4}
      masterVolume={0.9}
      recorder={recorder}
      onChannelVolumeChange={vi.fn()}
      onCrossfadeChange={vi.fn()}
      onCueMixChange={vi.fn()}
      onCueToggle={vi.fn()}
      onEqChange={vi.fn()}
      onMasterVolumeChange={vi.fn()}
      onOpenSettings={vi.fn()}
      onOpenShortcuts={vi.fn()}
      onTrimChange={vi.fn()}
      {...overrides}
    />
  )
}

describe('MixerPanel', () => {
  it('renders session status, meters and utility actions', () => {
    const onOpenSettings = vi.fn()
    const onOpenShortcuts = vi.fn()

    renderMixer({ onOpenSettings, onOpenShortcuts })

    expect(screen.getByRole('heading', { name: 'MIXER' })).toBeInTheDocument()
    expect(screen.queryByText('126.4 BPM')).not.toBeInTheDocument()
    expect(screen.getAllByLabelText('VU meter')).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: 'Show keyboard shortcuts' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open output settings' }))

    expect(onOpenShortcuts).toHaveBeenCalledTimes(1)
    expect(onOpenSettings).toHaveBeenCalledTimes(1)
  })

  it('routes cue, trim, EQ, volume and crossfader changes', () => {
    const onCueToggle = vi.fn()
    const onTrimChange = vi.fn()
    const onEqChange = vi.fn()
    const onChannelVolumeChange = vi.fn()
    const onCrossfadeChange = vi.fn()

    renderMixer({
      crossfade: 0.05,
      onChannelVolumeChange,
      onCrossfadeChange,
      onCueToggle,
      onEqChange,
      onTrimChange
    })

    fireEvent.click(screen.getAllByRole('button', { name: 'CUE' })[0])
    fireEvent.doubleClick(screen.getAllByRole('slider', { name: 'Trim' })[0])
    fireEvent.doubleClick(screen.getAllByRole('slider', { name: 'Hi' })[0])
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Channel A volume' }), { key: 'ArrowDown' })
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Crossfader' }), { key: 'ArrowRight' })

    expect(onCueToggle).toHaveBeenCalledWith('A')
    expect(onTrimChange).toHaveBeenCalledWith('A', 1)
    expect(onEqChange).toHaveBeenCalledWith('A', 'high', 0)
    expect(onChannelVolumeChange).toHaveBeenCalledWith('A', 0.69)
    expect(onCrossfadeChange).toHaveBeenCalledWith(0.06)
  })

  it('does not duplicate the master BPM in the mixer', () => {
    renderMixer({ masterBpm: 0, masterBeatIndex: -1 })

    expect(screen.queryByText('--.- BPM')).not.toBeInTheDocument()
  })
})
