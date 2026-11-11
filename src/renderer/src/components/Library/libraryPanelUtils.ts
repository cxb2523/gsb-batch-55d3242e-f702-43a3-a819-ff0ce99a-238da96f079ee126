interface IndexedTrack {
  id: string
}

export function createTrackIdIndex(tracks: IndexedTrack[]): Map<string, number> {
  return new Map(tracks.map((track, index) => [track.id, index]))
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    Boolean(target.isContentEditable) ||
    target.getAttribute('contenteditable') === 'true'
  )
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '0:00'
  }

  const wholeSeconds = Math.floor(seconds)
  const minutes = Math.floor(wholeSeconds / 60)
  const remainingSeconds = wholeSeconds % 60

  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

export function formatBpm(bpm: number): string {
  return bpm > 0 ? bpm.toFixed(1) : '--'
}
