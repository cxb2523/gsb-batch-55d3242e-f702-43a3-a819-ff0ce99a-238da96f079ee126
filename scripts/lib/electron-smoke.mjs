const REQUIRED_MEASURES = [
  'library.audioMetadata.decodeAudioData',
  'deck.loadFile.decodeAudioData',
  'deck.loadFile.computeWaveform'
]

export function validateElectronSmokeSnapshot(snapshot) {
  const failures = []

  for (const measureName of REQUIRED_MEASURES) {
    if (!snapshot.measures?.[measureName]?.count) {
      failures.push(`Required end-to-end measure is missing: ${measureName}`)
    }
  }

  return failures
}
