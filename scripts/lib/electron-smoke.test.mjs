import { describe, expect, it } from 'vitest'
import { validateElectronSmokeSnapshot } from './electron-smoke.mjs'

describe('Electron smoke validation', () => {
  it('requires evidence that the library and deck decoded the deterministic track', () => {
    expect(validateElectronSmokeSnapshot({ measures: {} })).toEqual([
      'Required end-to-end measure is missing: library.audioMetadata.decodeAudioData',
      'Required end-to-end measure is missing: deck.loadFile.decodeAudioData',
      'Required end-to-end measure is missing: deck.loadFile.computeWaveform'
    ])
  })

  it('accepts a complete deck-play capture', () => {
    const entry = { count: 1 }
    expect(
      validateElectronSmokeSnapshot({
        measures: {
          'library.audioMetadata.decodeAudioData': entry,
          'deck.loadFile.decodeAudioData': entry,
          'deck.loadFile.computeWaveform': entry
        }
      })
    ).toEqual([])
  })
})
