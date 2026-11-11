import { describe, expect, it, vi } from 'vitest'
import type { Session } from 'electron'
import { configureSessionSecurity, isAllowedSessionPermission } from './appSecurity.js'

describe('app security policy', () => {
  it('allows only the permissions required by recording and audio devices', () => {
    expect(isAllowedSessionPermission('media')).toBe(true)
    expect(isAllowedSessionPermission('display-capture')).toBe(true)
    expect(isAllowedSessionPermission('geolocation')).toBe(false)
    expect(isAllowedSessionPermission('notifications')).toBe(false)
  })
})

describe('configureSessionSecurity', () => {
  function createFakeSession(): {
    session: Session
    permissionHandler: () => (webContents: unknown, permission: string, callback: (allowed: boolean) => void) => void
    displayMediaHandler: () => (
      request: { frame?: unknown },
      callback: (result: Record<string, unknown>) => void
    ) => void
  } {
    const setPermissionRequestHandler = vi.fn()
    const setDisplayMediaRequestHandler = vi.fn()
    const session = {
      setPermissionRequestHandler,
      setDisplayMediaRequestHandler
    } as unknown as Session

    return {
      session,
      permissionHandler: () => setPermissionRequestHandler.mock.calls[0][0],
      displayMediaHandler: () => setDisplayMediaRequestHandler.mock.calls[0][0]
    }
  }

  it('installs a permission handler that only allows media and display-capture', () => {
    const { session, permissionHandler } = createFakeSession()
    configureSessionSecurity(session)

    const handler = permissionHandler()
    const mediaCallback = vi.fn()
    handler({}, 'media', mediaCallback)
    expect(mediaCallback).toHaveBeenCalledWith(true)

    const geoCallback = vi.fn()
    handler({}, 'geolocation', geoCallback)
    expect(geoCallback).toHaveBeenCalledWith(false)
  })

  it('installs a display-media handler that returns the requesting frame, or nothing', () => {
    const { session, displayMediaHandler } = createFakeSession()
    configureSessionSecurity(session)

    const handler = displayMediaHandler()
    const fakeFrame = { id: 'frame-1' }

    const withFrameCallback = vi.fn()
    handler({ frame: fakeFrame }, withFrameCallback)
    expect(withFrameCallback).toHaveBeenCalledWith({ video: fakeFrame })

    const withoutFrameCallback = vi.fn()
    handler({ frame: undefined }, withoutFrameCallback)
    expect(withoutFrameCallback).toHaveBeenCalledWith({})
  })
})
