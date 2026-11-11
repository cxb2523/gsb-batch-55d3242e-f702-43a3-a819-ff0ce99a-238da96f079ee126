import { afterEach, describe, expect, it, vi } from 'vitest'
import { pickAudioMime, pickVideoMime } from './mimeTypes'

function mockMediaRecorder(supportedTypes: string[]): void {
  Object.defineProperty(globalThis, 'MediaRecorder', {
    configurable: true,
    value: {
      isTypeSupported: vi.fn((mimeType: string) => supportedTypes.includes(mimeType))
    }
  })
}

describe('recording mime types', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'MediaRecorder')
  })

  it('returns null when MediaRecorder is unavailable', () => {
    Reflect.deleteProperty(globalThis, 'MediaRecorder')

    expect(pickAudioMime()).toBeNull()
    expect(pickVideoMime()).toBeNull()
  })

  it('picks the first supported audio type', () => {
    mockMediaRecorder(['audio/webm;codecs=opus', 'audio/webm'])

    expect(pickAudioMime()).toEqual({ mimeType: 'audio/webm;codecs=opus', extension: 'webm' })
  })

  it('prefers mp4 video when supported', () => {
    mockMediaRecorder(['video/mp4', 'video/webm'])

    expect(pickVideoMime()).toEqual({ mimeType: 'video/mp4', extension: 'mp4' })
  })
})
