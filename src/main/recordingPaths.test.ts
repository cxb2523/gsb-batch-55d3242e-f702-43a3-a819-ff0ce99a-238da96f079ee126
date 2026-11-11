import { describe, expect, it } from 'vitest'
import { win32 } from 'node:path'
import {
  isAllowedRecordingExtension,
  isPathInsideDirectory,
  timestampedRecordingFileName
} from './recordingPaths.js'

describe('recording path helpers', () => {
  it('validates recording extensions', () => {
    expect(isAllowedRecordingExtension('m4a')).toBe(true)
    expect(isAllowedRecordingExtension('exe')).toBe(false)
  })

  it('creates deterministic recording file names from dates', () => {
    const date = new Date(2026, 6, 9, 8, 7, 6)
    expect(timestampedRecordingFileName('mp4', date)).toBe('NextDJ 2026-07-09 08-07-06.mp4')
    expect(timestampedRecordingFileName('mp4', date, 'session-123')).toBe(
      'NextDJ 2026-07-09 08-07-06 session-123.mp4'
    )
  })

  it('guards reveal paths against sibling prefixes', () => {
    expect(isPathInsideDirectory('/Music/NextDJ Recordings/set.mp4', '/Music/NextDJ Recordings')).toBe(true)
    expect(isPathInsideDirectory('/Music/NextDJ Recordings Evil/set.mp4', '/Music/NextDJ Recordings')).toBe(false)
  })

  it('accepts Windows child paths without accepting sibling prefixes', () => {
    expect(isPathInsideDirectory('C:\\Music\\NextDJ Recordings\\set.mp4', 'C:\\Music\\NextDJ Recordings', win32)).toBe(
      true
    )
    expect(
      isPathInsideDirectory('C:\\Music\\NextDJ Recordings Evil\\set.mp4', 'C:\\Music\\NextDJ Recordings', win32)
    ).toBe(false)
  })
})
