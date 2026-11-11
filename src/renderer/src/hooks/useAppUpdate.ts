import { useCallback, useEffect, useState } from 'react'
import type { AppUpdateInfo } from '../../../shared/nextdj'

interface AppUpdateState {
  update: AppUpdateInfo | null
  openingDownload: boolean
  error: string | null
  dismiss: () => void
  openDownload: () => Promise<void>
}

export function useAppUpdate(): AppUpdateState {
  const [update, setUpdate] = useState<AppUpdateInfo | null>(null)
  const [openingDownload, setOpeningDownload] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const bridge = window.nextdj

    if (!bridge) {
      return
    }

    let active = true

    void bridge
      .checkForUpdate()
      .then((result) => {
        if (active && result.available) {
          setUpdate(result)
        }
      })
      .catch(() => {
        // Update checks are opportunistic and must not disrupt an offline DJ session.
      })

    return () => {
      active = false
    }
  }, [])

  const dismiss = useCallback((): void => {
    setUpdate(null)
    setError(null)
  }, [])

  const openDownload = useCallback(async (): Promise<void> => {
    const bridge = window.nextdj

    if (!bridge || openingDownload) {
      return
    }

    setOpeningDownload(true)
    setError(null)

    try {
      await bridge.openUpdateDownload()
    } catch {
      setError('Could not open the update download. Please try again.')
    } finally {
      setOpeningDownload(false)
    }
  }, [openingDownload])

  return { update, openingDownload, error, dismiss, openDownload }
}
