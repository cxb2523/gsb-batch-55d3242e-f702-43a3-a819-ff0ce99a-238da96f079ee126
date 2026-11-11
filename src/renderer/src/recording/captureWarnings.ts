export const CAMERA_MISSING_WARNING = 'Camera gave no video — recording without PiP.'
export const CAMERA_STOPPED_WARNING = 'Camera stopped — recording continues without PiP.'
export const SCREEN_ENDED_WARNING = 'Screen capture ended — recording saved up to that point.'
export const RECORDER_ERROR_WARNING = 'Recorder error — recording saved up to that point.'

export function createCameraUnavailableWarning(error: unknown): string {
  const denied = error instanceof DOMException && error.name === 'NotAllowedError'

  return denied
    ? 'Camera permission denied (check System Settings → Privacy → Camera) — recording without PiP.'
    : 'Camera unavailable — recording without PiP.'
}
