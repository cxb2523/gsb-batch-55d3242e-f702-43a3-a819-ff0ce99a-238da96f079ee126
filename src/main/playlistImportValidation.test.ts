import { describe, expect, it, vi } from 'vitest'
import {
  PLAYLIST_IMPORT_LIMITS,
  normalizePlaylistTracks,
  normalizeResolvedPlaylistFile,
  parsePlaylistInput,
  withProviderTimeout
} from './playlistImportValidation.js'

describe('playlist import validation', () => {
  it('normalizes bounded provider tracks into canonical records', () => {
    expect(
      normalizePlaylistTracks(
        [{ id: ' one ', title: ' Track ', artist: ' Artist ', artworkUrl: ' https://example.com/cover.jpg ', duration: 90, externalRef: ' remote:one ' }],
        'provider'
      )
    ).toEqual([
      { providerId: 'provider', id: 'one', title: 'Track', artist: 'Artist', artworkUrl: 'https://example.com/cover.jpg', duration: 90, externalRef: 'remote:one' }
    ])
  })

  it('rejects malformed metadata, oversized lists and oversized fields', () => {
    expect(() => normalizePlaylistTracks([{ id: 'one', title: {}, duration: 1, externalRef: 'one' }], 'p')).toThrow(
      'title must be a string'
    )
    expect(() =>
      normalizePlaylistTracks([{ id: 'one', title: 'Track', artist: {}, duration: 1, externalRef: 'one' }], 'p')
    ).toThrow('artist must be a string')
    expect(() =>
      normalizePlaylistTracks(
        [{ id: 'one', title: 'Track', artworkUrl: 'http://example.com/cover.jpg', duration: 1, externalRef: 'one' }],
        'p'
      )
    ).toThrow('must use HTTPS')
    expect(() =>
      normalizePlaylistTracks(
        Array.from({ length: PLAYLIST_IMPORT_LIMITS.tracks + 1 }, (_, index) => ({
          id: String(index),
          title: 'Track',
          duration: 1,
          externalRef: String(index)
        })),
        'p'
      )
    ).toThrow(`more than ${PLAYLIST_IMPORT_LIMITS.tracks} tracks`)
    expect(() =>
      normalizePlaylistTracks(
        [{ id: 'one', title: 'x'.repeat(PLAYLIST_IMPORT_LIMITS.titleCharacters + 1), duration: 1, externalRef: 'one' }],
        'p'
      )
    ).toThrow('title is outside the allowed length')
  })

  it('validates resolved files before they cross IPC', () => {
    expect(
      normalizeResolvedPlaylistFile({
        file: { data: new ArrayBuffer(8), name: 'track.mp3', lastModified: 1, type: 'audio/mpeg' },
        outputDirectory: '/tmp'
      })
    ).toMatchObject({ file: { name: 'track.mp3' }, outputDirectory: '/tmp' })

    expect(() => normalizeResolvedPlaylistFile({ file: { data: {}, name: 'track.mp3', lastModified: 1 }, outputDirectory: '' })).toThrow(
      'file exceeds the allowed size'
    )
  })

  it('bounds playlist references', () => {
    expect(parsePlaylistInput(' demo:playlist ')).toBe('demo:playlist')
    expect(() => parsePlaylistInput('x'.repeat(PLAYLIST_IMPORT_LIMITS.inputCharacters + 1))).toThrow(
      'valid playlist URL'
    )
  })

  it('aborts and rejects provider operations at the configured timeout', async () => {
    vi.useFakeTimers()
    let receivedSignal: AbortSignal = new AbortController().signal
    const operation = withProviderTimeout('Provider operation', 100, async (signal) => {
      receivedSignal = signal
      return await new Promise<string>(() => undefined)
    })
    const rejection = expect(operation).rejects.toThrow('Provider operation timed out.')

    await vi.advanceTimersByTimeAsync(100)
    await rejection
    expect(receivedSignal.aborted).toBe(true)
    vi.useRealTimers()
  })
})
