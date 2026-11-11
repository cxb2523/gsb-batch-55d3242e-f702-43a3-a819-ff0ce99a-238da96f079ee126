import { describe, expect, it } from 'vitest'
import { createPlaylistFileName, createTrackId, isAudioFile } from './libraryFiles'

describe('library file helpers', () => {
  it('accepts audio files by mime type or common extension', () => {
    expect(isAudioFile(new File(['x'], 'track.mp3', { type: '' }))).toBe(true)
    expect(isAudioFile(new File(['x'], 'track.bin', { type: 'audio/wav' }))).toBe(true)
    expect(isAudioFile(new File(['x'], 'notes.txt', { type: 'text/plain' }))).toBe(false)
  })

  it('creates stable local track ids', () => {
    const file = new File(['abc'], 'track.wav', { lastModified: 123 })
    expect(createTrackId(file)).toBe('track.wav-3-123')
  })

  it('sanitizes playlist file names while keeping the downloaded extension', () => {
    expect(createPlaylistFileName('A/B:*? Track', 'download.webm')).toBe('A B Track.webm')
  })
})
