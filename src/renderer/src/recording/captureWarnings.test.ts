import { describe, expect, it } from 'vitest'
import {
  CAMERA_MISSING_WARNING,
  CAMERA_STOPPED_WARNING,
  RECORDER_ERROR_WARNING,
  SCREEN_ENDED_WARNING,
  createCameraUnavailableWarning
} from './captureWarnings'

describe('capture warnings', () => {
  it('keeps stable warning copy for capture interruptions', () => {
    expect(CAMERA_MISSING_WARNING).toContain('recording without PiP')
    expect(CAMERA_STOPPED_WARNING).toContain('recording continues')
    expect(SCREEN_ENDED_WARNING).toContain('recording saved')
    expect(RECORDER_ERROR_WARNING).toContain('recording saved')
  })

  it('distinguishes camera permission denial from other camera failures', () => {
    expect(createCameraUnavailableWarning(new DOMException('denied', 'NotAllowedError'))).toContain(
      'Camera permission denied'
    )
    expect(createCameraUnavailableWarning(new Error('busy'))).toBe('Camera unavailable — recording without PiP.')
  })
})
