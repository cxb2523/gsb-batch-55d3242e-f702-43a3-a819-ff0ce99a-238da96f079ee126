import { createPlaylistFileName } from './libraryFiles'
import type { LibraryTrack, PersistedTrack } from './libraryTypes'

const LIBRARY_STORAGE_KEY = 'nextdj.library.v2'
const LEGACY_LIBRARY_STORAGE_KEY = 'nextdj.library.v1'
const LIBRARY_QUARANTINE_KEY = 'nextdj.library.quarantine.v1'
const LIBRARY_SCHEMA_VERSION = 2
const LIBRARY_DB_NAME = 'nextdj-library'
const LIBRARY_DB_VERSION = 1
const FILE_STORE_NAME = 'files'
const LEGACY_EXTERNAL_SOURCE = 'you' + 'tube'
const LEGACY_EXTERNAL_REF_KEY = 'you' + 'tubeUrl'

interface PersistedLibraryEnvelope {
  version: typeof LIBRARY_SCHEMA_VERSION
  tracks: PersistedTrack[]
}

export interface PersistedLibraryIssue {
  index: number
  reason: string
}

export interface PersistedLibraryReadResult {
  tracks: PersistedTrack[]
  issues: PersistedLibraryIssue[]
  migrated: boolean
}

function requireString(record: Record<string, unknown>, key: string, maximum = 512): string {
  const value = record[key]

  if (typeof value !== 'string' || !value.trim() || value.length > maximum) {
    throw new Error(`${key} is invalid`)
  }

  return value
}

function optionalString(record: Record<string, unknown>, key: string, maximum = 2048): string | undefined {
  const value = record[key]

  if (value === undefined) {
    return undefined
  }

  if (typeof value !== 'string' || value.length > maximum) {
    throw new Error(`${key} is invalid`)
  }

  return value
}

function requireFiniteNumber(
  record: Record<string, unknown>,
  key: string,
  minimum: number,
  maximum: number
): number {
  const value = record[key]

  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${key} is invalid`)
  }

  return value
}

function parsePersistedTrack(value: unknown): PersistedTrack {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('track must be an object')
  }

  const record = value as Record<string, unknown>
  const source = record.source

  if (source !== 'local' && source !== 'external' && source !== LEGACY_EXTERNAL_SOURCE) {
    throw new Error('source is invalid')
  }

  if (typeof record.hasFile !== 'boolean') {
    throw new Error('hasFile is invalid')
  }

  const providerId = optionalString(record, 'providerId', 256)
  const externalRef = optionalString(record, 'externalRef')

  if (source === 'external' && (!providerId || !externalRef)) {
    throw new Error('external provider identity is missing')
  }

  const legacyExternalRef =
    source === LEGACY_EXTERNAL_SOURCE ? optionalString(record, LEGACY_EXTERNAL_REF_KEY) : undefined

  return {
    id: requireString(record, 'id'),
    title: requireString(record, 'title'),
    artist: optionalString(record, 'artist', 512),
    artworkUrl: optionalString(record, 'artworkUrl'),
    duration: requireFiniteNumber(record, 'duration', 0, 24 * 60 * 60),
    bpm: requireFiniteNumber(record, 'bpm', 0, 400),
    firstBeatOffset: requireFiniteNumber(record, 'firstBeatOffset', 0, 24 * 60 * 60),
    source,
    providerId,
    externalRef,
    fileName: optionalString(record, 'fileName', 512),
    fileType: optionalString(record, 'fileType', 128),
    fileLastModified:
      record.fileLastModified === undefined
        ? undefined
        : requireFiniteNumber(record, 'fileLastModified', 0, Number.MAX_SAFE_INTEGER),
    hasFile: record.hasFile,
    ...(legacyExternalRef ? { [LEGACY_EXTERNAL_REF_KEY]: legacyExternalRef } : {})
  }
}

function quarantineIssues(issues: PersistedLibraryIssue[]): void {
  if (issues.length === 0) {
    localStorage.removeItem(LIBRARY_QUARANTINE_KEY)
    return
  }

  try {
    localStorage.setItem(LIBRARY_QUARANTINE_KEY, JSON.stringify({ version: 1, issues }))
  } catch {
    // Recovery metadata must never prevent the valid portion of the library from loading.
  }
}

function serializeTrack(track: LibraryTrack): PersistedTrack {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    artworkUrl: track.artworkUrl?.startsWith('https://') ? track.artworkUrl : undefined,
    duration: track.duration,
    bpm: track.bpm,
    firstBeatOffset: track.firstBeatOffset,
    source: track.source,
    providerId: track.providerId,
    externalRef: track.externalRef,
    fileName: track.file?.name,
    fileType: track.file?.type,
    fileLastModified: track.file?.lastModified,
    hasFile: Boolean(track.file)
  }
}

export function persistTrackMetadata(tracks: LibraryTrack[]): void {
  const envelope: PersistedLibraryEnvelope = {
    version: LIBRARY_SCHEMA_VERSION,
    tracks: tracks.map(serializeTrack)
  }

  localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(envelope))
  localStorage.removeItem(LEGACY_LIBRARY_STORAGE_KEY)
}

export function readPersistedLibrary(): PersistedLibraryReadResult {
  try {
    const currentValue = localStorage.getItem(LIBRARY_STORAGE_KEY)
    const legacyValue = localStorage.getItem(LEGACY_LIBRARY_STORAGE_KEY)
    const migrated = currentValue === null && legacyValue !== null
    const parsed = JSON.parse(currentValue ?? legacyValue ?? '[]') as unknown
    let rawTracks: unknown[]

    if (Array.isArray(parsed)) {
      rawTracks = parsed
    } else if (
      parsed &&
      typeof parsed === 'object' &&
      (parsed as Record<string, unknown>).version === LIBRARY_SCHEMA_VERSION &&
      Array.isArray((parsed as Record<string, unknown>).tracks)
    ) {
      rawTracks = (parsed as { tracks: unknown[] }).tracks
    } else {
      throw new Error('library schema version is unsupported')
    }

    const tracks: PersistedTrack[] = []
    const issues: PersistedLibraryIssue[] = []

    rawTracks.forEach((track, index) => {
      try {
        tracks.push(parsePersistedTrack(track))
      } catch (error) {
        issues.push({ index, reason: error instanceof Error ? error.message : 'track is invalid' })
      }
    })

    if (migrated || issues.length > 0) {
      try {
        const envelope: PersistedLibraryEnvelope = { version: LIBRARY_SCHEMA_VERSION, tracks }
        localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(envelope))
        localStorage.removeItem(LEGACY_LIBRARY_STORAGE_KEY)
      } catch {
        issues.push({ index: -1, reason: 'validated library migration could not be persisted' })
      }
    }

    quarantineIssues(issues)
    return { tracks, issues, migrated }
  } catch (error) {
    const issues = [{ index: -1, reason: error instanceof Error ? error.message : 'library is invalid' }]
    quarantineIssues(issues)
    return { tracks: [], issues, migrated: false }
  }
}

export function readPersistedTracks(): PersistedTrack[] {
  return readPersistedLibrary().tracks
}

function openLibraryDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LIBRARY_DB_NAME, LIBRARY_DB_VERSION)

    request.onupgradeneeded = () => {
      request.result.createObjectStore(FILE_STORE_NAME)
    }
    request.onerror = () => reject(request.error ?? new Error('Could not open library database.'))
    request.onsuccess = () => resolve(request.result)
  })
}

export async function putPersistedFile(trackId: string, file: File): Promise<void> {
  const db = await openLibraryDb()

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(FILE_STORE_NAME, 'readwrite')
    const store = transaction.objectStore(FILE_STORE_NAME)

    store.put(file, trackId)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not save audio file.'))
  })

  db.close()
}

export async function getPersistedFile(trackId: string): Promise<Blob | null> {
  const db = await openLibraryDb()

  const file = await new Promise<Blob | null>((resolve, reject) => {
    const transaction = db.transaction(FILE_STORE_NAME, 'readonly')
    const store = transaction.objectStore(FILE_STORE_NAME)
    const request = store.get(trackId)

    request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null)
    request.onerror = () => reject(request.error ?? new Error('Could not read audio file.'))
  })

  db.close()
  return file
}

export async function deletePersistedFiles(trackIds: string[]): Promise<void> {
  if (trackIds.length === 0) {
    return
  }

  const db = await openLibraryDb()

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(FILE_STORE_NAME, 'readwrite')
    const store = transaction.objectStore(FILE_STORE_NAME)

    trackIds.forEach((trackId) => store.delete(trackId))
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not remove old audio files.'))
  })

  db.close()
}

export function fileFromBlob(blob: Blob, track: PersistedTrack): File {
  const fileName =
    track.source === 'external'
      ? createPlaylistFileName(track.title, track.fileName ?? `${track.title}.mp3`)
      : track.fileName ?? `${track.title}.mp3`

  return new File([blob], fileName, {
    lastModified: track.fileLastModified ?? Date.now(),
    type: track.fileType || blob.type || 'audio/mpeg'
  })
}
