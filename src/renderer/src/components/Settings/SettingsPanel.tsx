import { memo, useRef, type ReactNode } from 'react'
import { Check, Headphones, RefreshCw, SlidersHorizontal, Volume2, X } from 'lucide-react'
import type { OutputDeviceInfo } from '../../audio/output'
import type { OutputRouteState } from '../../app/engineTypes'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { Fader } from '../controls/Fader'

interface SettingsPanelProps {
  open: boolean
  devices: OutputDeviceInfo[]
  master: OutputRouteState
  cue: OutputRouteState
  phonesVolume: number
  deviceListError: string | null
  onClose: () => void
  onMasterDeviceChange: (deviceId: string) => void
  onCueDeviceChange: (deviceId: string) => void
  onPhonesVolumeChange: (value: number) => void
  onRefreshDevices: () => Promise<void>
}

interface OutputRouteCardProps {
  accent: 'master' | 'phones'
  devices: OutputDeviceInfo[]
  icon: ReactNode
  label: string
  route: OutputRouteState
  children?: ReactNode
  onDeviceChange: (deviceId: string) => void
}

function getDeviceLabel(deviceId: string, devices: OutputDeviceInfo[]): string {
  const deviceLabel = devices.find((device) => device.deviceId === deviceId)?.label

  return deviceLabel ?? (deviceId === 'default' ? 'System default' : deviceId)
}

function OutputRouteCard({
  accent,
  devices,
  icon,
  label,
  route,
  children,
  onDeviceChange
}: OutputRouteCardProps): JSX.Element {
  const activeLabel = getDeviceLabel(route.activeDeviceId, devices)
  const requestedDeviceIsListed = devices.some((device) => device.deviceId === route.requestedDeviceId)

  return (
    <section className={`settings-route-card settings-route-card-${accent}`}>
      <div className="settings-route-heading">
        <span className="settings-route-icon">{icon}</span>
        <div>
          <h3>{label}</h3>
          <p>{accent === 'master' ? 'Main room output' : 'Cue and preview output'}</p>
        </div>
        <span className={`settings-status-pill ${route.pending ? 'settings-status-pending' : ''}`}>
          {route.pending ? (
            'Applying…'
          ) : (
            <>
              <Check aria-hidden="true" size={11} strokeWidth={2.8} /> Active
            </>
          )}
        </span>
      </div>

      <label className="settings-device-field">
        <span>Device</span>
        <select
          className="device-select"
          disabled={route.pending}
          value={route.requestedDeviceId}
          onChange={(event) => onDeviceChange(event.currentTarget.value)}
        >
          {!requestedDeviceIsListed ? (
            <option value={route.requestedDeviceId}>{getDeviceLabel(route.requestedDeviceId, devices)}</option>
          ) : null}
          {devices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label}
            </option>
          ))}
        </select>
      </label>

      <p className="settings-active-route" title={activeLabel}>
        Active route <strong>{activeLabel}</strong>
      </p>
      {route.error ? <p className="settings-route-error">{route.error}</p> : null}
      {children}
    </section>
  )
}

export const SettingsPanel = memo(function SettingsPanel({
  open,
  devices,
  master,
  cue,
  phonesVolume,
  deviceListError,
  onClose,
  onMasterDeviceChange,
  onCueDeviceChange,
  onPhonesVolumeChange,
  onRefreshDevices
}: SettingsPanelProps): JSX.Element | null {
  const panelRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useDialogFocus({
    open,
    containerRef: panelRef,
    initialFocusRef: closeButtonRef,
    onClose
  })

  if (!open) {
    return null
  }

  return (
    <div className="settings-overlay" onClick={onClose}>
      <aside
        ref={panelRef}
        aria-labelledby="settings-title"
        aria-modal="true"
        className="settings-panel"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        tabIndex={-1}
      >
        <header className="settings-header">
          <div className="settings-header-mark" aria-hidden="true">
            <SlidersHorizontal size={18} strokeWidth={2.2} />
          </div>
          <div className="settings-header-copy">
            <h2 id="settings-title">Output settings</h2>
            <span>Choose where the master and headphone signals play.</span>
          </div>
          <button
            ref={closeButtonRef}
            aria-label="Close settings"
            className="icon-button settings-close"
            title="Close"
            type="button"
            onClick={onClose}
          >
            <X size={15} strokeWidth={2.4} />
          </button>
        </header>

        <div className="settings-content">
          <OutputRouteCard
            accent="master"
            devices={devices}
            icon={<Volume2 size={16} strokeWidth={2.2} />}
            label="Master output"
            route={master}
            onDeviceChange={onMasterDeviceChange}
          />

          <OutputRouteCard
            accent="phones"
            devices={devices}
            icon={<Headphones size={16} strokeWidth={2.2} />}
            label="Headphones"
            route={cue}
            onDeviceChange={onCueDeviceChange}
          >
            <div className="settings-phones-level">
              <div className="settings-level-heading">
                <span>Phones level</span>
                <strong>{Math.round(phonesVolume * 100)}%</strong>
              </div>
              <Fader
                accent="#22d3ee"
                hideLabel
                label="Headphones level"
                max={1}
                min={0}
                orientation="horizontal"
                step={0.01}
                value={phonesVolume}
                valueFormatter={(value) => `${Math.round(value * 100)}%`}
                onChange={onPhonesVolumeChange}
              />
              <p>Independent from Master and Phones Mix.</p>
            </div>
          </OutputRouteCard>

          {deviceListError ? (
            <div className="settings-device-error" role="alert">
              {deviceListError}
            </div>
          ) : null}
        </div>

        <footer className="settings-footer">
          <p>Reconnect a device, then refresh the list.</p>
          <button
            className="settings-refresh-button"
            type="button"
            onClick={() => {
              void onRefreshDevices()
            }}
          >
            <RefreshCw size={13} strokeWidth={2.4} />
            Refresh devices
          </button>
        </footer>
      </aside>
    </div>
  )
})
