import { describe, expect, it } from 'vitest'
import { RecordingSessionRegistry, type RecordingSessionPolicy } from './recordingSessionRegistry.js'

const TEST_POLICY: RecordingSessionPolicy = {
  maxActiveSessions: 2,
  maxSessionsPerWebContents: 1,
  maxChunkBytes: 8,
  maxSessionBytes: 12
}

describe('RecordingSessionRegistry', () => {
  it('reserves capacity before streams are attached', () => {
    const registry = new RecordingSessionRegistry<object>(TEST_POLICY)

    registry.reserve('one', '/recordings/one.m4a', 1, false)

    expect(() => registry.reserve('two', '/recordings/two.m4a', 1, false)).toThrow(
      'A recording is already active for this window.'
    )

    registry.reserve('two', '/recordings/two.m4a', 2, false)
    expect(() => registry.reserve('three', '/recordings/three.m4a', 3, false)).toThrow(
      'Too many recordings are already active.'
    )
    expect(registry.size).toBe(2)
  })

  it('enforces ownership and byte budgets on active sessions', () => {
    const registry = new RecordingSessionRegistry<object>(TEST_POLICY)
    const stream = {}

    registry.reserve('one', '/recordings/one.m4a', 1, false)
    registry.activate('one', stream)

    expect(() => registry.getOwnedActive('one', 2)).toThrow('Recording session not found.')
    expect(registry.reserveBytes('one', 1, 8).bytes).toBe(8)
    expect(() => registry.reserveBytes('one', 1, 9)).toThrow('Recording chunk exceeds the allowed size.')
    expect(() => registry.reserveBytes('one', 1, 5)).toThrow('Recording reached the maximum allowed size.')
    expect(registry.reserveBytes('one', 1, 4).bytes).toBe(12)
  })

  it('releases owned, renderer-scoped, and remaining sessions exactly once', () => {
    const registry = new RecordingSessionRegistry<object>(TEST_POLICY)

    registry.reserve('one', '/recordings/one.m4a', 1, false)
    registry.reserve('two', '/recordings/two.mp4', 2, true)

    expect(registry.takeOwned('one', 2)).toBeNull()
    expect(registry.takeOwned('one', 1)?.id).toBe('one')
    expect(registry.takeOwned('one', 1)).toBeNull()
    expect(registry.takeForWebContents(2).map((session) => session.id)).toEqual(['two'])
    expect(registry.takeAll()).toEqual([])
    expect(registry.size).toBe(0)
  })
})
