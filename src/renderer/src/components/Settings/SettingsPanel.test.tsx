import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SettingsPanel } from './SettingsPanel'

describe('SettingsPanel', () => {
  it('renders output errors when open', () => {
    render(
      <SettingsPanel
        cue={{ activeDeviceId: 'default', requestedDeviceId: 'default', pending: false, error: null }}
        devices={[]}
        deviceListError="Could not list outputs."
        master={{ activeDeviceId: 'default', requestedDeviceId: 'default', pending: false, error: null }}
        phonesVolume={0.8}
        open
        onClose={vi.fn()}
        onCueDeviceChange={vi.fn()}
        onMasterDeviceChange={vi.fn()}
        onPhonesVolumeChange={vi.fn()}
        onRefreshDevices={vi.fn()}
      />
    )

    expect(screen.getByText('Could not list outputs.')).toBeInTheDocument()
  })

  it('renders nothing when closed', () => {
    render(
      <SettingsPanel
        cue={{ activeDeviceId: 'default', requestedDeviceId: 'default', pending: false, error: null }}
        devices={[]}
        deviceListError={null}
        master={{ activeDeviceId: 'default', requestedDeviceId: 'default', pending: false, error: null }}
        phonesVolume={0.8}
        open={false}
        onClose={vi.fn()}
        onCueDeviceChange={vi.fn()}
        onMasterDeviceChange={vi.fn()}
        onPhonesVolumeChange={vi.fn()}
        onRefreshDevices={vi.fn()}
      />
    )

    expect(screen.queryByText('Output settings')).not.toBeInTheDocument()
  })

  it('exposes modal semantics, moves focus, and closes with Escape', async () => {
    const onClose = vi.fn()

    render(
      <SettingsPanel
        cue={{ activeDeviceId: 'default', requestedDeviceId: 'default', pending: false, error: null }}
        devices={[]}
        deviceListError={null}
        master={{ activeDeviceId: 'default', requestedDeviceId: 'default', pending: false, error: null }}
        phonesVolume={0.8}
        open
        onClose={onClose}
        onCueDeviceChange={vi.fn()}
        onMasterDeviceChange={vi.fn()}
        onPhonesVolumeChange={vi.fn()}
        onRefreshDevices={vi.fn()}
      />
    )

    expect(screen.getByRole('dialog', { name: 'Output settings' })).toHaveAttribute('aria-modal', 'true')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close settings' })).toHaveFocus())

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('adjusts an independent headphones level', () => {
    const onPhonesVolumeChange = vi.fn()

    render(
      <SettingsPanel
        cue={{ activeDeviceId: 'default', requestedDeviceId: 'default', pending: false, error: null }}
        devices={[]}
        deviceListError={null}
        master={{ activeDeviceId: 'default', requestedDeviceId: 'default', pending: false, error: null }}
        phonesVolume={0.65}
        open
        onClose={vi.fn()}
        onCueDeviceChange={vi.fn()}
        onMasterDeviceChange={vi.fn()}
        onPhonesVolumeChange={onPhonesVolumeChange}
        onRefreshDevices={vi.fn()}
      />
    )

    expect(screen.getByText('65%')).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Headphones level' }), { key: 'ArrowLeft' })
    expect(onPhonesVolumeChange).toHaveBeenCalledWith(0.64)
  })
})
