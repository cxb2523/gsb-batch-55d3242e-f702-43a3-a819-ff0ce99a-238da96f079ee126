import type { Session } from 'electron'

const ALLOWED_MEDIA_PERMISSIONS = new Set(['media', 'display-capture'])

export function isAllowedSessionPermission(permission: string): boolean {
  return ALLOWED_MEDIA_PERMISSIONS.has(permission)
}

export function configureSessionSecurity(session: Session): void {
  session.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(isAllowedSessionPermission(permission))
  })

  // Recording captures the app's own window content (WebFrameMain), which
  // needs no macOS Screen Recording permission and never picks up
  // overlapping windows.
  session.setDisplayMediaRequestHandler((request, callback) => {
    if (request.frame) {
      callback({ video: request.frame })
    } else {
      callback({})
    }
  })
}
