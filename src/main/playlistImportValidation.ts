import { Buffer } from 'node:buffer'
import type { PlaylistImportResolvedFile, PlaylistImportTrack } from '../shared/nextdj.js'

export const PLAYLIST_IMPORT_LIMITS = {
  inputCharacters: 4096,
  tracks: 5000,
  payloadBytes: 4 * 1024 * 1024,
  idCharacters: 256,
  titleCharacters: 512,
  artistCharacters: 512,
  artworkUrlCharacters: 2048,
  externalRefCharacters: 2048,
  durationSeconds: 24 * 60 * 60,
  resolvedFileBytes: 512 * 1024 * 1024,
  outputDirectoryCharacters: 4096,
  fileNameCharacters: 512,
  mimeTypeCharacters: 128
} as const

function requireBoundedString(value: unknown, field: string, maximum: number): string {
  if (typeof value !== 'string') {
    throw new Error(`Playlist track ${field} must be a string.`)
  }

  const normalized = value.trim()

  if (!normalized || normalized.length > maximum) {
    throw new Error(`Playlist track ${field} is outside the allowed length.`)
  }

  return normalized
}

function optionalBoundedString(value: unknown, field: string, maximum: number): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined
  }

  return requireBoundedString(value, field, maximum)
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(message)
  }

  return value as Record<string, unknown>
}

export function parsePlaylistInput(value: string): string {
  const input = value.trim()

  if (!input || input.length > PLAYLIST_IMPORT_LIMITS.inputCharacters) {
    throw new Error('Paste a valid playlist URL or reference.')
  }

  return input
}

export function normalizePlaylistTracks(value: unknown, providerId: string): PlaylistImportTrack[] {
  if (!Array.isArray(value)) {
    throw new Error('Playlist provider returned an invalid track list.')
  }

  if (value.length > PLAYLIST_IMPORT_LIMITS.tracks) {
    throw new Error(`Playlist provider returned more than ${PLAYLIST_IMPORT_LIMITS.tracks} tracks.`)
  }

  let payloadBytes = 0

  return value.map((rawTrack) => {
    const track = requireRecord(rawTrack, 'Playlist provider returned an invalid track.')
    const id = requireBoundedString(track.id, 'id', PLAYLIST_IMPORT_LIMITS.idCharacters)
    const title = requireBoundedString(track.title, 'title', PLAYLIST_IMPORT_LIMITS.titleCharacters)
    const artist = optionalBoundedString(track.artist, 'artist', PLAYLIST_IMPORT_LIMITS.artistCharacters)
    const artworkUrl = optionalBoundedString(
      track.artworkUrl,
      'artwork URL',
      PLAYLIST_IMPORT_LIMITS.artworkUrlCharacters
    )
    const externalRef = requireBoundedString(
      track.externalRef,
      'externalRef',
      PLAYLIST_IMPORT_LIMITS.externalRefCharacters
    )
    const duration = track.duration

    if (
      typeof duration !== 'number' ||
      !Number.isFinite(duration) ||
      duration < 0 ||
      duration > PLAYLIST_IMPORT_LIMITS.durationSeconds
    ) {
      throw new Error('Playlist track duration is outside the allowed range.')
    }

    payloadBytes += Buffer.byteLength(providerId) + Buffer.byteLength(id) + Buffer.byteLength(title)
    payloadBytes += artist ? Buffer.byteLength(artist) : 0
    payloadBytes += artworkUrl ? Buffer.byteLength(artworkUrl) : 0
    payloadBytes += Buffer.byteLength(externalRef) + 16

    if (payloadBytes > PLAYLIST_IMPORT_LIMITS.payloadBytes) {
      throw new Error('Playlist provider response exceeds the allowed size.')
    }

    if (artworkUrl) {
      let parsedArtworkUrl: URL

      try {
        parsedArtworkUrl = new URL(artworkUrl)
      } catch {
        throw new Error('Playlist track artwork URL is invalid.')
      }

      if (parsedArtworkUrl.protocol !== 'https:') {
        throw new Error('Playlist track artwork URL must use HTTPS.')
      }
    }

    return {
      providerId,
      id,
      title,
      ...(artist ? { artist } : {}),
      ...(artworkUrl ? { artworkUrl } : {}),
      duration,
      externalRef
    }
  })
}

export function normalizeResolvedPlaylistFile(value: unknown): PlaylistImportResolvedFile {
  const result = requireRecord(value, 'Playlist provider returned an invalid resolved track.')
  const outputDirectory = result.outputDirectory

  if (
    typeof outputDirectory !== 'string' ||
    outputDirectory.length > PLAYLIST_IMPORT_LIMITS.outputDirectoryCharacters
  ) {
    throw new Error('Playlist provider returned an invalid output directory.')
  }

  if (result.file === null) {
    return { file: null, outputDirectory }
  }

  const file = requireRecord(result.file, 'Playlist provider returned an invalid file.')
  const name = requireBoundedString(file.name, 'file name', PLAYLIST_IMPORT_LIMITS.fileNameCharacters)
  const data = file.data
  const lastModified = file.lastModified
  const type = file.type

  if (!(data instanceof ArrayBuffer) || data.byteLength > PLAYLIST_IMPORT_LIMITS.resolvedFileBytes) {
    throw new Error('Playlist provider file exceeds the allowed size.')
  }

  if (typeof lastModified !== 'number' || !Number.isFinite(lastModified) || lastModified < 0) {
    throw new Error('Playlist provider returned an invalid file timestamp.')
  }

  if (type !== undefined && (typeof type !== 'string' || type.length > PLAYLIST_IMPORT_LIMITS.mimeTypeCharacters)) {
    throw new Error('Playlist provider returned an invalid file type.')
  }

  return {
    file: {
      data,
      name,
      lastModified,
      ...(type ? { type } : {})
    },
    outputDirectory
  }
}

export async function withProviderTimeout<T>(
  label: string,
  timeoutMs: number,
  operation: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const controller = new AbortController()
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort()
      reject(new Error(`${label} timed out.`))
    }, timeoutMs)
  })

  try {
    return await Promise.race([Promise.resolve().then(() => operation(controller.signal)), timeout])
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId)
    }
  }
}
