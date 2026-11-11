import { app, dialog, ipcMain } from 'electron'
import { readFile } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { PlaylistImportResolvedFile, PlaylistImportTrack } from '../shared/nextdj.js'
import { createM3uPlaylistProvider } from './m3uPlaylistProvider.js'
import type {
  PlaylistImportPluginExport,
  PlaylistImportProvider,
  PlaylistImportRegistry
} from './playlistImportTypes.js'
import {
  PLAYLIST_IMPORT_LIMITS,
  normalizePlaylistTracks,
  normalizeResolvedPlaylistFile,
  parsePlaylistInput,
  withProviderTimeout
} from './playlistImportValidation.js'

const CONFIG_FILE_NAME = 'playlist-plugins.json'
const PLUGIN_LOAD_TIMEOUT_MS = 10_000
const CAN_HANDLE_TIMEOUT_MS = 3_000
const LIST_TRACKS_TIMEOUT_MS = 30_000
const RESOLVE_TRACK_TIMEOUT_MS = 120_000
const MISSING_DEPENDENCY_ERROR_CODE = 'NEXTDJ_PLAYLIST_DEPENDENCY_NOT_FOUND'
const DEPENDENCY_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/i

type ProviderErrorReporter = (scope: string, providerId: string, error: unknown) => void

const reportProviderError: ProviderErrorReporter = (scope, providerId, error) => {
  console.warn(`[playlist-import] ${scope} failed for ${providerId}:`, error)
}

interface PlaylistPluginConfig {
  plugins?: unknown
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readMissingProviderDependency(error: unknown): string | null {
  if (!error || typeof error !== 'object') {
    return null
  }

  const record = error as Record<string, unknown>
  const dependency = readString(record.dependency)

  if (record.code !== MISSING_DEPENDENCY_ERROR_CODE || !DEPENDENCY_NAME_PATTERN.test(dependency)) {
    return null
  }

  return dependency
}

function validateProvider(provider: PlaylistImportProvider): void {
  if (!provider.id || !/^[a-z0-9][a-z0-9._-]*$/i.test(provider.id)) {
    throw new Error('Playlist import provider has an invalid id.')
  }

  if (!provider.displayName) {
    throw new Error(`Playlist import provider "${provider.id}" has no display name.`)
  }

  if (
    typeof provider.canHandle !== 'function' ||
    typeof provider.listTracks !== 'function' ||
    typeof provider.resolveTrack !== 'function'
  ) {
    throw new Error(`Playlist import provider "${provider.id}" is missing required methods.`)
  }

  if (provider.priority !== undefined && !Number.isFinite(provider.priority)) {
    throw new Error(`Playlist import provider "${provider.id}" has an invalid priority.`)
  }
}

function normalizePluginExport(pluginExport: unknown): PlaylistImportProvider[] {
  if (Array.isArray(pluginExport)) {
    return pluginExport as PlaylistImportProvider[]
  }

  if (!pluginExport || typeof pluginExport !== 'object') {
    return []
  }

  const record = pluginExport as PlaylistImportPluginExport & Record<string, unknown>

  if (Array.isArray(record.providers)) {
    return record.providers as PlaylistImportProvider[]
  }

  if (record.provider) {
    return [record.provider as PlaylistImportProvider]
  }

  if (record.default) {
    return normalizePluginExport(record.default)
  }

  return [record as unknown as PlaylistImportProvider]
}

function resolvePluginPath(configPath: string, pluginPath: string): string {
  if (pluginPath.startsWith('data:') || pluginPath.startsWith('file:')) {
    return pluginPath
  }

  if (isAbsolute(pluginPath)) {
    return pluginPath
  }

  return resolve(configPath, '..', pluginPath)
}

function getPluginImportSpecifier(pluginPath: string): string {
  return pluginPath.startsWith('data:') || pluginPath.startsWith('file:') ? pluginPath : pathToFileURL(pluginPath).href
}

export function getPlaylistPluginConfigPath(): string {
  return resolve(app.getPath('userData'), CONFIG_FILE_NAME)
}

export async function readPlaylistPluginPaths(configPath = getPlaylistPluginConfigPath()): Promise<string[]> {
  try {
    const rawConfig = await readFile(configPath, 'utf8')
    const parsed = JSON.parse(rawConfig) as PlaylistPluginConfig

    if (!Array.isArray(parsed.plugins)) {
      return []
    }

    return parsed.plugins.map(readString).filter(Boolean).map((pluginPath) => resolvePluginPath(configPath, pluginPath))
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return []
    }

    throw error
  }
}

export async function loadPlaylistImportProviders(
  pluginPaths: string[],
  onError: ProviderErrorReporter = reportProviderError
): Promise<PlaylistImportProvider[]> {
  const providers: PlaylistImportProvider[] = []

  for (const pluginPath of pluginPaths) {
    try {
      const pluginModule = await withProviderTimeout('Playlist plugin load', PLUGIN_LOAD_TIMEOUT_MS, () =>
        import(/* @vite-ignore */ getPluginImportSpecifier(pluginPath))
      )
      const pluginProviders = normalizePluginExport(pluginModule)

      for (const provider of pluginProviders) {
        try {
          validateProvider(provider)
          providers.push(provider)
        } catch (error) {
          onError('validation', provider?.id || pluginPath, error)
        }
      }
    } catch (error) {
      onError('load', pluginPath, error)
    }
  }

  return providers
}

export function createPlaylistImportRegistry(
  providers: PlaylistImportProvider[],
  onError: ProviderErrorReporter = reportProviderError
): PlaylistImportRegistry {
  const providersById = new Map<string, PlaylistImportProvider>()
  const activeProviders: PlaylistImportProvider[] = []

  for (const provider of providers) {
    validateProvider(provider)

    if (providersById.has(provider.id)) {
      onError('registration', provider.id, new Error(`Duplicate playlist import provider id "${provider.id}".`))
      continue
    }

    providersById.set(provider.id, provider)
    activeProviders.push(provider)
  }

  const orderedProviders = activeProviders
    .map((provider, index) => ({ provider, index }))
    .sort((left, right) => (right.provider.priority ?? 0) - (left.provider.priority ?? 0) || left.index - right.index)
    .map(({ provider }) => provider)

  return {
    listProviders: () =>
      orderedProviders.map((provider) => ({
        id: provider.id,
        displayName: provider.displayName
      })),

    async listTracks(input: string): Promise<PlaylistImportTrack[]> {
      const trimmedInput = parsePlaylistInput(input)
      let matchedProvider = false
      let missingDependency: string | null = null

      for (const provider of orderedProviders) {
        let canHandle: boolean

        try {
          canHandle = await withProviderTimeout('Provider selection', CAN_HANDLE_TIMEOUT_MS, (signal) =>
            Promise.resolve(provider.canHandle(trimmedInput, { signal }))
          )
        } catch (error) {
          onError('canHandle', provider.id, error)
          continue
        }

        if (!canHandle) {
          continue
        }

        matchedProvider = true

        try {
          const tracks = await withProviderTimeout('Playlist listing', LIST_TRACKS_TIMEOUT_MS, (signal) =>
            provider.listTracks(trimmedInput, { signal })
          )
          return normalizePlaylistTracks(tracks, provider.id)
        } catch (error) {
          onError('listTracks', provider.id, error)
          missingDependency ??= readMissingProviderDependency(error)
        }
      }

      if (matchedProvider) {
        if (missingDependency) {
          throw new Error(
            `Playlist provider dependency "${missingDependency}" was not found. Install it or configure the provider.`
          )
        }

        throw new Error('Playlist providers could not list tracks for this input.')
      }

      throw new Error('No playlist import plugin can handle this input.')
    },

    async resolveTrack(providerId: string, externalRef: string): Promise<PlaylistImportResolvedFile> {
      const provider = providersById.get(providerId)

      if (!provider) {
        throw new Error('Unknown playlist import provider.')
      }

      const trimmedRef = externalRef.trim()

      if (!trimmedRef || trimmedRef.length > PLAYLIST_IMPORT_LIMITS.externalRefCharacters) {
        throw new Error('Invalid playlist track reference.')
      }

      try {
        const resolved = await withProviderTimeout('Track resolution', RESOLVE_TRACK_TIMEOUT_MS, (signal) =>
          provider.resolveTrack(trimmedRef, { signal })
        )
        return normalizeResolvedPlaylistFile(resolved)
      } catch (error) {
        onError('resolveTrack', provider.id, error)
        throw new Error('Playlist provider could not resolve this track.', { cause: error })
      }
    }
  }
}

export async function createConfiguredPlaylistImportRegistry(
  builtinProviders: PlaylistImportProvider[] = [createM3uPlaylistProvider()]
): Promise<PlaylistImportRegistry> {
  try {
    const pluginPaths = await readPlaylistPluginPaths()
    const providers = await loadPlaylistImportProviders(pluginPaths)
    return createPlaylistImportRegistry([...providers, ...builtinProviders])
  } catch (error) {
    reportProviderError('configuration', CONFIG_FILE_NAME, error)
    return createPlaylistImportRegistry(builtinProviders)
  }
}

export function registerPlaylistImportIpc(registryPromise = createConfiguredPlaylistImportRegistry()): void {
  ipcMain.handle('playlist-import:select-file', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'M3U playlists', extensions: ['m3u', 'm3u8'] }]
    })

    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  ipcMain.handle('playlist-import:list-providers', async () => {
    const registry = await registryPromise
    return registry.listProviders()
  })

  ipcMain.handle('playlist-import:list-tracks', async (_event, input: unknown) => {
    if (typeof input !== 'string') {
      throw new Error('Paste a playlist URL or reference.')
    }

    const registry = await registryPromise
    return registry.listTracks(input)
  })

  ipcMain.handle('playlist-import:resolve-track', async (_event, providerId: unknown, externalRef: unknown) => {
    if (typeof providerId !== 'string' || typeof externalRef !== 'string') {
      throw new Error('Invalid playlist track reference.')
    }

    const registry = await registryPromise
    return registry.resolveTrack(providerId, externalRef)
  })
}
