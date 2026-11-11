import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createPlaylistImportRegistry,
  loadPlaylistImportProviders,
  readPlaylistPluginPaths
} from './playlistImport.js'
import { createDemoPlaylistProvider } from './demoPlaylistProvider.js'

const temporaryDirectories: string[] = []

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'nextdj-playlist-import-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('playlist import registry', () => {
  it('returns no plugin paths when config is missing or empty', async () => {
    const tempDir = await createTemporaryDirectory()
    const configPath = join(tempDir, 'playlist-plugins.json')

    await expect(readPlaylistPluginPaths(configPath)).resolves.toEqual([])

    await writeFile(configPath, JSON.stringify({ plugins: [] }))
    await expect(readPlaylistPluginPaths(configPath)).resolves.toEqual([])
  })

  it('resolves relative plugin paths from the config directory', async () => {
    const tempDir = await createTemporaryDirectory()
    const configPath = join(tempDir, 'playlist-plugins.json')

    await writeFile(configPath, JSON.stringify({ plugins: ['./plugins/demo.mjs'] }))

    await expect(readPlaylistPluginPaths(configPath)).resolves.toEqual([join(tempDir, 'plugins/demo.mjs')])
  })

  it('loads providers from ESM plugins', async () => {
    const pluginPath = `data:text/javascript,${encodeURIComponent(`
        export default {
          id: 'fixture',
          displayName: 'Fixture Provider',
          canHandle: (input) => input.startsWith('fixture:'),
          listTracks: async () => [{ id: 'one', title: 'One', duration: 1, externalRef: 'one' }],
          resolveTrack: async () => ({ file: null, outputDirectory: '' })
        }
      `)}`

    const providers = await loadPlaylistImportProviders([pluginPath])

    expect(providers).toHaveLength(1)
    expect(providers[0].id).toBe('fixture')
  })

  it('isolates plugin load and validation failures', async () => {
    const brokenPlugin = `data:text/javascript,${encodeURIComponent(`throw new Error('broken plugin')`)}`
    const missingCanHandle = `data:text/javascript,${encodeURIComponent(`
      export default {
        id: 'invalid',
        displayName: 'Invalid',
        listTracks: async () => [],
        resolveTrack: async () => ({ file: null, outputDirectory: '' })
      }
    `)}`
    const validPlugin = `data:text/javascript,${encodeURIComponent(`
      export default {
        id: 'valid',
        displayName: 'Valid',
        canHandle: () => true,
        listTracks: async () => [],
        resolveTrack: async () => ({ file: null, outputDirectory: '' })
      }
    `)}`
    const onError = vi.fn()

    const providers = await loadPlaylistImportProviders([brokenPlugin, missingCanHandle, validPlugin], onError)

    expect(providers.map((provider) => provider.id)).toEqual(['valid'])
    expect(onError).toHaveBeenCalledTimes(2)
  })

  it('lists tracks through the first provider that can handle the input', async () => {
    const registry = createPlaylistImportRegistry([createDemoPlaylistProvider()])

    await expect(registry.listTracks('demo:playlist')).resolves.toEqual([
      {
        providerId: 'demo-local',
        id: 'demo-track',
        title: 'Demo Playlist Track',
        artist: 'Demo Artist',
        duration: 30,
        externalRef: 'demo-track'
      }
    ])
  })

  it('rejects unknown providers and isolates duplicate provider ids', async () => {
    const provider = createDemoPlaylistProvider()
    const onError = vi.fn()
    const registry = createPlaylistImportRegistry([provider, provider], onError)

    await expect(registry.resolveTrack('missing', 'track')).rejects.toThrow('Unknown playlist import provider.')
    expect(registry.listProviders()).toHaveLength(1)
    expect(onError).toHaveBeenCalledWith('registration', provider.id, expect.any(Error))
  })

  it('falls through to another matching provider after an isolated failure', async () => {
    const onError = vi.fn()
    const failingProvider = {
      ...createDemoPlaylistProvider(),
      id: 'failing',
      priority: 10,
      listTracks: vi.fn(async () => {
        throw new Error('remote unavailable')
      })
    }
    const fallbackProvider = {
      ...createDemoPlaylistProvider(),
      id: 'fallback'
    }
    const registry = createPlaylistImportRegistry([fallbackProvider, failingProvider], onError)

    await expect(registry.listTracks('demo:playlist')).resolves.toMatchObject([{ providerId: 'fallback' }])
    expect(failingProvider.listTracks).toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith('listTracks', 'failing', expect.any(Error))
  })

  it('surfaces a validated missing provider dependency after fallbacks fail', async () => {
    const missingDependency = Object.assign(new Error('internal executable lookup failed'), {
      code: 'NEXTDJ_PLAYLIST_DEPENDENCY_NOT_FOUND',
      dependency: 'yt-dlp'
    })
    const provider = {
      ...createDemoPlaylistProvider(),
      listTracks: vi.fn(async () => {
        throw missingDependency
      })
    }
    const registry = createPlaylistImportRegistry([provider])

    await expect(registry.listTracks('demo:playlist')).rejects.toThrow(
      'Playlist provider dependency "yt-dlp" was not found. Install it or configure the provider.'
    )
  })

  it('does not expose unvalidated dependency details', async () => {
    const unsafeDependency = Object.assign(new Error('private path failed'), {
      code: 'NEXTDJ_PLAYLIST_DEPENDENCY_NOT_FOUND',
      dependency: '../../private-file'
    })
    const provider = {
      ...createDemoPlaylistProvider(),
      listTracks: vi.fn(async () => {
        throw unsafeDependency
      })
    }
    const registry = createPlaylistImportRegistry([provider])

    await expect(registry.listTracks('demo:playlist')).rejects.toThrow('Playlist providers could not list tracks')
  })

  it('rejects malformed provider metadata before IPC', async () => {
    const onError = vi.fn()
    const provider = {
      ...createDemoPlaylistProvider(),
      listTracks: vi.fn(async () => [
        { id: 'one', title: { invalid: true }, duration: 1, externalRef: 'one' }
      ])
    }
    const registry = createPlaylistImportRegistry([provider as never], onError)

    await expect(registry.listTracks('demo:playlist')).rejects.toThrow('could not list tracks')
    expect(onError).toHaveBeenCalledWith('listTracks', provider.id, expect.any(Error))
  })
})
