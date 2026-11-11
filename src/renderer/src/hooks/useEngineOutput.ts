import { useCallback, useEffect, useRef, useState } from 'react'
import type { DJEngine } from '../audio/engine'
import type { OutputRouteState, OutputState } from '../app/engineTypes'

export const MASTER_OUTPUT_STORAGE_KEY = 'nextdj.masterOutputDeviceId'
export const CUE_OUTPUT_STORAGE_KEY = 'nextdj.cueOutputDeviceId'

type RouteName = 'master' | 'cue'

function createOutputRoute(): OutputRouteState {
  return {
    activeDeviceId: 'default',
    requestedDeviceId: 'default',
    pending: false,
    error: null
  }
}

function describeOutputError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export function useEngineOutput(engine: DJEngine): {
  output: OutputState
  setMasterDevice: (deviceId: string) => void
  setCueDevice: (deviceId: string) => void
  refreshOutputDevices: () => Promise<void>
} {
  const [output, setOutput] = useState<OutputState>({
    devices: [],
    master: createOutputRoute(),
    cue: createOutputRoute(),
    deviceListError: null
  })
  const operationIdsRef = useRef<Record<RouteName, number>>({ master: 0, cue: 0 })
  const activeDevicesRef = useRef<Record<RouteName, string>>({ master: 'default', cue: 'default' })

  const refreshOutputDevices = useCallback(async (): Promise<void> => {
    try {
      const devices = await engine.outputRouter.listOutputDevices()
      setOutput((current) => ({ ...current, devices, deviceListError: null }))
    } catch (error) {
      setOutput((current) => ({
        ...current,
        deviceListError: describeOutputError(error, 'Could not list audio outputs.')
      }))
    }
  }, [engine])

  const applyDevice = useCallback(
    (route: RouteName, deviceId: string): void => {
      operationIdsRef.current[route] += 1
      const operationId = operationIdsRef.current[route]
      const storageKey = route === 'master' ? MASTER_OUTPUT_STORAGE_KEY : CUE_OUTPUT_STORAGE_KEY
      const apply = route === 'master' ? engine.outputRouter.setMasterDevice.bind(engine.outputRouter) : engine.outputRouter.setCueDevice.bind(engine.outputRouter)

      setOutput((current) => ({
        ...current,
        [route]: {
          ...current[route],
          requestedDeviceId: deviceId,
          pending: true,
          error: null
        }
      }))

      void apply(deviceId)
        .then(() => {
          if (operationIdsRef.current[route] !== operationId) {
            return
          }

          activeDevicesRef.current[route] = deviceId
          localStorage.setItem(storageKey, deviceId)
          setOutput((current) => ({
            ...current,
            [route]: {
              activeDeviceId: deviceId,
              requestedDeviceId: deviceId,
              pending: false,
              error: null
            }
          }))
        })
        .catch((error: unknown) => {
          if (operationIdsRef.current[route] !== operationId) {
            return
          }

          const activeDeviceId = activeDevicesRef.current[route]
          localStorage.setItem(storageKey, activeDeviceId)
          setOutput((current) => ({
            ...current,
            [route]: {
              activeDeviceId,
              requestedDeviceId: activeDeviceId,
              pending: false,
              error: describeOutputError(
                error,
                route === 'master' ? 'Could not set master output.' : 'Could not set headphones output.'
              )
            }
          }))
        })
    },
    [engine]
  )

  useEffect(() => {
    applyDevice('master', localStorage.getItem(MASTER_OUTPUT_STORAGE_KEY) ?? 'default')
    applyDevice('cue', localStorage.getItem(CUE_OUTPUT_STORAGE_KEY) ?? 'default')
    void refreshOutputDevices()

    const mediaDevices = navigator.mediaDevices
    const handleDeviceChange = (): void => {
      void refreshOutputDevices()
    }

    mediaDevices?.addEventListener?.('devicechange', handleDeviceChange)
    return () => mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange)
  }, [applyDevice, refreshOutputDevices])

  const setMasterDevice = useCallback((deviceId: string): void => applyDevice('master', deviceId), [applyDevice])
  const setCueDevice = useCallback((deviceId: string): void => applyDevice('cue', deviceId), [applyDevice])

  return { output, setMasterDevice, setCueDevice, refreshOutputDevices }
}
