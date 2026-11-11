import { mergeUniqueTracks } from './libraryTracks'
import type { LibraryTrack } from './libraryTypes'

export const MAX_LIBRARY_TRACKS = 20_000

export class LibraryCapacityError extends Error {
  constructor(maximum = MAX_LIBRARY_TRACKS) {
    super(`The library cannot contain more than ${maximum.toLocaleString()} tracks.`)
    this.name = 'LibraryCapacityError'
  }
}

export function prepareLibraryUpdate(
  currentTracks: LibraryTrack[],
  nextTracks: LibraryTrack[],
  maximum = MAX_LIBRARY_TRACKS
): LibraryTrack[] {
  const updatedTracks = mergeUniqueTracks(currentTracks, nextTracks)

  if (updatedTracks.length > maximum) {
    throw new LibraryCapacityError(maximum)
  }

  return updatedTracks
}

export class LibraryTransactionQueue {
  private tail: Promise<void> = Promise.resolve()

  run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation)
    this.tail = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }
}
