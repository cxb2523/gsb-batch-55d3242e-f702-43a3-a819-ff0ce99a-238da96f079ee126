import { EMPTY_HOT_CUES, HOT_CUE_COLORS, type HotCue } from './deckTypes'

const HOT_CUE_STORAGE_KEY = 'nextdj.hotCues'
const CUE_POINT_STORAGE_KEY = 'nextdj.cuePoints'

function copyStoredTrackEntry(storageKey: string, legacyKey: string, stableKey: string): void {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Record<string, unknown>

    if (parsed[stableKey] === undefined && parsed[legacyKey] !== undefined) {
      parsed[stableKey] = parsed[legacyKey]
      localStorage.setItem(storageKey, JSON.stringify(parsed))
    }
  } catch {
    // Corrupt persistence is handled by the defensive readers below.
  }
}

export function migrateDeckPersistenceKey(legacyKey: string, stableKey: string): void {
  if (legacyKey === stableKey) {
    return
  }

  copyStoredTrackEntry(HOT_CUE_STORAGE_KEY, legacyKey, stableKey)
  copyStoredTrackEntry(CUE_POINT_STORAGE_KEY, legacyKey, stableKey)
}

export function loadHotCues(trackName: string, clampPosition: (seconds: number) => number): Array<HotCue | null> {
  try {
    const parsed = JSON.parse(localStorage.getItem(HOT_CUE_STORAGE_KEY) ?? '{}') as Record<
      string,
      Array<HotCue | null>
    >
    const stored = parsed[trackName]

    if (!Array.isArray(stored)) {
      return [...EMPTY_HOT_CUES]
    }

    return HOT_CUE_COLORS.map((color, index) => {
      const cue = stored[index]

      if (!cue || typeof cue.position !== 'number') {
        return null
      }

      return {
        position: clampPosition(cue.position),
        color: typeof cue.color === 'string' ? cue.color : color
      }
    })
  } catch {
    return [...EMPTY_HOT_CUES]
  }
}

export function saveHotCues(trackName: string, hotCues: Array<HotCue | null>): void {
  try {
    const parsed = JSON.parse(localStorage.getItem(HOT_CUE_STORAGE_KEY) ?? '{}') as Record<
      string,
      Array<HotCue | null>
    >

    parsed[trackName] = hotCues
    localStorage.setItem(HOT_CUE_STORAGE_KEY, JSON.stringify(parsed))
  } catch {
    localStorage.setItem(HOT_CUE_STORAGE_KEY, JSON.stringify({ [trackName]: hotCues }))
  }
}

export function loadCuePoint(trackName: string, clampPosition: (seconds: number) => number): number {
  try {
    const parsed = JSON.parse(localStorage.getItem(CUE_POINT_STORAGE_KEY) ?? '{}') as Record<string, number>
    const cuePoint = parsed[trackName]

    return typeof cuePoint === 'number' ? clampPosition(cuePoint) : 0
  } catch {
    return 0
  }
}

export function saveCuePoint(trackName: string, cuePoint: number): void {
  try {
    const parsed = JSON.parse(localStorage.getItem(CUE_POINT_STORAGE_KEY) ?? '{}') as Record<string, number>
    parsed[trackName] = cuePoint
    localStorage.setItem(CUE_POINT_STORAGE_KEY, JSON.stringify(parsed))
  } catch {
    localStorage.setItem(CUE_POINT_STORAGE_KEY, JSON.stringify({ [trackName]: cuePoint }))
  }
}
