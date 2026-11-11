import { readFile, stat } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PlaylistImportProvider } from './playlistImportTypes.js'

const PROVIDER_ID = 'm3u-local'
const PROVIDER_DISPLAY_NAME = 'Local M3U playlist'
const EXTINF_PREFIX = '#EXTINF:'

const MIME_TYPES_BY_EXTENSION: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.opus': 'audio/opus',
  '.wma': 'audio/x-ms-wma'
}
const PLAYLIST_EXTENSION_PATTERN = /\.m3u8?$/i

export interface M3uPlaylistEntry {
  path: string
  title: string
  artist?: string
  duration: number
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

function isFileUrl(value: string): boolean {
  return /^file:\/\//i.test(value)
}

function parseExtinf(line: string): { duration: number; title: string; artist?: string } {
  const rest = line.slice(EXTINF_PREFIX.length)
  const commaIndex = rest.indexOf(',')
  const durationPart = commaIndex === -1 ? rest : rest.slice(0, commaIndex)
  const label = commaIndex === -1 ? '' : rest.slice(commaIndex + 1).trim()
  const parsedDuration = Number.parseFloat(durationPart.trim())
  const duration = Number.isFinite(parsedDuration) && parsedDuration >= 0 ? parsedDuration : 0

  if (!label) {
    return { duration, title: '' }
  }

  const separatorIndex = label.indexOf(' - ')

  if (separatorIndex === -1) {
    return { duration, title: label }
  }

  const artist = label.slice(0, separatorIndex).trim()
  const title = label.slice(separatorIndex + 3).trim()

  return { duration, title: title || label, ...(artist ? { artist } : {}) }
}

function resolveEntryPath(rawPath: string, playlistDirectory: string): string | null {
  if (isFileUrl(rawPath)) {
    try {
      return fileURLToPath(rawPath)
    } catch {
      return null
    }
  }

  if (isAbsolute(rawPath)) {
    return rawPath
  }

  return resolve(playlistDirectory, rawPath)
}

/**
 * Parses M3U/M3U8 playlist content into a list of entries. HTTP(S) stream
 * entries are skipped (this provider only imports local files). Nested
 * playlist references are not followed.
 */
export function parseM3uPlaylist(content: string, playlistDirectory: string): M3uPlaylistEntry[] {
  const lines = content.split(/\r\n|\r|\n/)
  const entries: M3uPlaylistEntry[] = []
  let pendingExtinf: { duration: number; title: string; artist?: string } | null = null

  for (const rawLine of lines) {
    const line = rawLine.trim()

    if (!line) {
      continue
    }

    if (line.toUpperCase().startsWith(EXTINF_PREFIX)) {
      pendingExtinf = parseExtinf(line)
      continue
    }

    if (line.startsWith('#')) {
      continue
    }

    if (isHttpUrl(line)) {
      pendingExtinf = null
      continue
    }

    const resolvedPath = resolveEntryPath(line, playlistDirectory)

    if (!resolvedPath) {
      pendingExtinf = null
      continue
    }

    const fallbackTitle = basename(resolvedPath, extname(resolvedPath))

    entries.push({
      path: resolvedPath,
      title: pendingExtinf?.title || fallbackTitle,
      ...(pendingExtinf?.artist ? { artist: pendingExtinf.artist } : {}),
      duration: pendingExtinf?.duration ?? 0
    })

    pendingExtinf = null
  }

  return entries
}

async function isReadableFile(path: string): Promise<boolean> {
  try {
    const stats = await stat(path)
    return stats.isFile()
  } catch {
    return false
  }
}

function normalizeCandidatePath(input: string): string | null {
  const trimmed = input.trim()

  if (!trimmed) {
    return null
  }

  if (isFileUrl(trimmed)) {
    try {
      return fileURLToPath(trimmed)
    } catch {
      return null
    }
  }

  if (!isAbsolute(trimmed)) {
    return null
  }

  return trimmed
}

export function createM3uPlaylistProvider(): PlaylistImportProvider {
  let authorizedTrackPaths = new Set<string>()

  return {
    id: PROVIDER_ID,
    displayName: PROVIDER_DISPLAY_NAME,

    canHandle: async (input) => {
      const trimmed = input.trim()

      if (!PLAYLIST_EXTENSION_PATTERN.test(trimmed)) {
        return false
      }

      const candidatePath = normalizeCandidatePath(trimmed)

      if (!candidatePath) {
        return false
      }

      return isReadableFile(candidatePath)
    },

    listTracks: async (input) => {
      const trimmed = input.trim()
      const playlistPath = normalizeCandidatePath(trimmed)

      if (!playlistPath) {
        throw new Error('Invalid M3U playlist path.')
      }

      const content = await readFile(playlistPath, 'utf8')
      const entries = parseM3uPlaylist(content, dirname(playlistPath)).filter((entry) =>
        Object.hasOwn(MIME_TYPES_BY_EXTENSION, extname(entry.path).toLowerCase())
      )
      authorizedTrackPaths = new Set(entries.map((entry) => entry.path))

      return entries.map((entry) => ({
        id: entry.path,
        title: entry.title,
        ...(entry.artist ? { artist: entry.artist } : {}),
        duration: entry.duration,
        externalRef: entry.path
      }))
    },

    resolveTrack: async (externalRef, context) => {
      const filePath = externalRef.trim()

      if (!filePath || !isAbsolute(filePath) || !authorizedTrackPaths.has(filePath)) {
        throw new Error('Invalid playlist track reference.')
      }

      const stats = await stat(filePath)

      if (!stats.isFile()) {
        throw new Error(`Playlist track file not found: ${filePath}`)
      }

      const data = await readFile(filePath, { signal: context?.signal })
      const name = basename(filePath)
      const type = MIME_TYPES_BY_EXTENSION[extname(filePath).toLowerCase()]
      const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer

      return {
        file: {
          data: arrayBuffer,
          name,
          lastModified: stats.mtimeMs,
          ...(type ? { type } : {})
        },
        outputDirectory: ''
      }
    }
  }
}
