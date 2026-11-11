import { describe, expect, it } from 'vitest'
import {
  parseDeleteFileFlag,
  parseRecordingChunk,
  parseRecordingPath,
  parseRecordingSessionId,
  parseRecordingStartOptions
} from './recordingValidation.js'

describe('recording ipc validation', () => {
  it('accepts supported recording start options', () => {
    expect(parseRecordingStartOptions({ extension: 'm4a', video: false })).toEqual({
      extension: 'm4a',
      video: false
    })
  })

  it('rejects malformed recording start options', () => {
    expect(() => parseRecordingStartOptions(null)).toThrow('Invalid recording options.')
    expect(() => parseRecordingStartOptions({ extension: 'exe', video: false })).toThrow(
      'Unsupported recording format.'
    )
    expect(() => parseRecordingStartOptions({ extension: 'mp4', video: 'yes' })).toThrow(
      'Invalid recording options.'
    )
  })

  it('validates session ids and chunks', () => {
    const chunk = new ArrayBuffer(4)

    expect(parseRecordingSessionId('session-1')).toBe('session-1')
    expect(() => parseRecordingSessionId('')).toThrow('Recording session not found.')
    expect(parseRecordingChunk(chunk)).toBe(chunk)
    expect(() => parseRecordingChunk(new Uint8Array(4))).toThrow('Invalid recording chunk.')
  })

  it('validates cancel flags and reveal paths', () => {
    expect(parseDeleteFileFlag(true)).toBe(true)
    expect(() => parseDeleteFileFlag('true')).toThrow('Invalid recording cancel option.')
    expect(parseRecordingPath('/tmp/recording.mp4')).toBe('/tmp/recording.mp4')
    expect(() => parseRecordingPath('')).toThrow('Invalid recording path.')
  })
})
