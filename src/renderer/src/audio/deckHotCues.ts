import { HOT_CUE_COLORS, type HotCue } from './deckTypes'

export interface HotCueTriggerResult {
  hotCues: Array<HotCue | null>
  seekPosition: number | null
  shouldSave: boolean
}

export function isValidHotCueIndex(index: number, hotCueCount: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < hotCueCount
}

export function triggerHotCueState(
  hotCues: Array<HotCue | null>,
  index: number,
  currentPosition: number,
  duration: number
): HotCueTriggerResult {
  if (!isValidHotCueIndex(index, hotCues.length) || duration <= 0) {
    return { hotCues, seekPosition: null, shouldSave: false }
  }

  const existing = hotCues[index]

  if (existing) {
    return { hotCues, seekPosition: existing.position, shouldSave: false }
  }

  return {
    hotCues: hotCues.map((cue, cueIndex) =>
      cueIndex === index ? { position: currentPosition, color: HOT_CUE_COLORS[index] } : cue
    ),
    seekPosition: null,
    shouldSave: true
  }
}

export function clearHotCueState(hotCues: Array<HotCue | null>, index: number): Array<HotCue | null> {
  if (!isValidHotCueIndex(index, hotCues.length)) {
    return hotCues
  }

  return hotCues.map((cue, cueIndex) => (cueIndex === index ? null : cue))
}
