import type { LibraryTrack } from './libraryTypes'

export function mergeUniqueTracks(currentTracks: LibraryTrack[], nextTracks: LibraryTrack[]): LibraryTrack[] {
  if (nextTracks.length === 0) {
    return currentTracks
  }

  const existingIds = new Set(currentTracks.map((track) => track.id))
  const updatedTracks = [...currentTracks]

  for (const track of nextTracks) {
    if (!existingIds.has(track.id)) {
      existingIds.add(track.id)
      updatedTracks.push(track)
    }
  }

  return updatedTracks
}
