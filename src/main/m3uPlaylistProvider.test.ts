import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { createPlaylistImportRegistry } from './playlistImport.js'
import { createM3uPlaylistProvider, parseM3uPlaylist } from './m3uPlaylistProvider.js'

const temporaryDirectories: string[] = []

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'nextdj-m3u-import-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('parseM3uPlaylist', () => {
  it('parses EXTINF entries with artist and title', () => {
    const content = ['#EXTM3U', '#EXTINF:123,Daft Punk - One More Time', 'track1.mp3'].join('\n')

    expect(parseM3uPlaylist(content, '/music')).toEqual([
      { path: '/music/track1.mp3', title: 'One More Time', artist: 'Daft Punk', duration: 123 }
    ])
  })

  it('parses EXTINF entries without an artist', () => {
    const content = ['#EXTINF:42,Untitled Track', 'track2.mp3'].join('\n')

    expect(parseM3uPlaylist(content, '/music')).toEqual([
      { path: '/music/track2.mp3', title: 'Untitled Track', duration: 42 }
    ])
  })

  it('falls back to the file basename when there is no EXTINF', () => {
    const content = 'track3.mp3'

    expect(parseM3uPlaylist(content, '/music')).toEqual([{ path: '/music/track3.mp3', title: 'track3', duration: 0 }])
  })

  it('resolves relative, absolute, and file:// entries', () => {
    const content = ['relative.mp3', '/absolute/path/track.mp3', pathToFileURL('/other/track.mp3').href].join('\n')

    expect(parseM3uPlaylist(content, '/music')).toEqual([
      { path: '/music/relative.mp3', title: 'relative', duration: 0 },
      { path: '/absolute/path/track.mp3', title: 'track', duration: 0 },
      { path: '/other/track.mp3', title: 'track', duration: 0 }
    ])
  })

  it('handles CRLF line endings', () => {
    const content = '#EXTM3U\r\n#EXTINF:10,Song\r\ntrack.mp3\r\n'

    expect(parseM3uPlaylist(content, '/music')).toEqual([{ path: '/music/track.mp3', title: 'Song', duration: 10 }])
  })

  it('skips http(s) stream entries', () => {
    const content = ['#EXTINF:5,Stream', 'https://example.com/stream.mp3', 'local.mp3'].join('\n')

    expect(parseM3uPlaylist(content, '/music')).toEqual([{ path: '/music/local.mp3', title: 'local', duration: 0 }])
  })

  it('returns an empty list for an empty file', () => {
    expect(parseM3uPlaylist('', '/music')).toEqual([])
    expect(parseM3uPlaylist('#EXTM3U\n', '/music')).toEqual([])
  })
})

describe('createM3uPlaylistProvider canHandle', () => {
  it('accepts an existing .m3u absolute path', async () => {
    const dir = await createTemporaryDirectory()
    const playlistPath = join(dir, 'playlist.m3u')
    await writeFile(playlistPath, '#EXTM3U\n')

    const provider = createM3uPlaylistProvider()

    await expect(provider.canHandle(playlistPath)).resolves.toBe(true)
  })

  it('accepts an existing .m3u8 absolute path', async () => {
    const dir = await createTemporaryDirectory()
    const playlistPath = join(dir, 'playlist.m3u8')
    await writeFile(playlistPath, '#EXTM3U\n')

    const provider = createM3uPlaylistProvider()

    await expect(provider.canHandle(playlistPath)).resolves.toBe(true)
  })

  it('accepts mixed-case playlist extensions', async () => {
    const dir = await createTemporaryDirectory()
    const playlistPath = join(dir, 'playlist.M3u')
    await writeFile(playlistPath, '#EXTM3U\n')

    await expect(createM3uPlaylistProvider().canHandle(playlistPath)).resolves.toBe(true)
  })

  it('rejects a nonexistent path', async () => {
    const provider = createM3uPlaylistProvider()

    await expect(provider.canHandle('/definitely/does/not/exist.m3u')).resolves.toBe(false)
  })

  it('rejects a URL', async () => {
    const provider = createM3uPlaylistProvider()

    await expect(provider.canHandle('https://example.com/x.m3u')).resolves.toBe(false)
  })

  it('rejects a random sentence', async () => {
    const provider = createM3uPlaylistProvider()

    await expect(provider.canHandle('please import my music')).resolves.toBe(false)
  })
})

describe('createM3uPlaylistProvider listTracks/resolveTrack', () => {
  it('does not resolve an arbitrary path that was not authorized by listTracks', async () => {
    const dir = await createTemporaryDirectory()
    const audioPath = join(dir, 'private.mp3')
    await writeFile(audioPath, new Uint8Array([1, 2, 3]))

    await expect(createM3uPlaylistProvider().resolveTrack(audioPath)).rejects.toThrow(
      'Invalid playlist track reference.'
    )
  })

  it('does not expose non-audio entries from a playlist', async () => {
    const dir = await createTemporaryDirectory()
    const playlistPath = join(dir, 'playlist.m3u')
    await writeFile(playlistPath, ['notes.txt', 'song.mp3'].join('\n'))

    const tracks = await createM3uPlaylistProvider().listTracks(playlistPath)

    expect(tracks).toHaveLength(1)
    expect(tracks[0].title).toBe('song')
  })

  it('lists and resolves a track end-to-end', async () => {
    const dir = await createTemporaryDirectory()
    const audioPath = join(dir, 'song.mp3')
    const audioBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
    await writeFile(audioPath, audioBytes)

    const playlistPath = join(dir, 'playlist.m3u')
    await writeFile(playlistPath, ['#EXTM3U', '#EXTINF:12,Artist - Song', 'song.mp3'].join('\n'))

    const provider = createM3uPlaylistProvider()
    const tracks = await provider.listTracks(playlistPath)

    expect(tracks).toEqual([
      { id: audioPath, title: 'Song', artist: 'Artist', duration: 12, externalRef: audioPath }
    ])

    const resolved = await provider.resolveTrack(audioPath)

    expect(resolved.file).not.toBeNull()
    expect(resolved.file?.data.byteLength).toBe(audioBytes.byteLength)
    expect(resolved.file?.name).toBe('song.mp3')
  })

  it('rejects resolveTrack for a nonexistent entry', async () => {
    const provider = createM3uPlaylistProvider()

    await expect(provider.resolveTrack('/does/not/exist.mp3')).rejects.toThrow()
  })
})

describe('m3u provider registry integration', () => {
  it('lists canonicalized tracks through the registry', async () => {
    const dir = await createTemporaryDirectory()
    const audioPath = join(dir, 'song.mp3')
    await writeFile(audioPath, new Uint8Array([9, 9, 9]))

    const playlistPath = join(dir, 'playlist.m3u')
    await writeFile(playlistPath, ['#EXTM3U', 'song.mp3'].join('\n'))

    const registry = createPlaylistImportRegistry([createM3uPlaylistProvider()])

    expect(registry.listProviders()).toEqual([{ id: 'm3u-local', displayName: 'Local M3U playlist' }])

    const tracks = await registry.listTracks(playlistPath)

    expect(tracks).toEqual([
      {
        providerId: 'm3u-local',
        id: audioPath,
        title: 'song',
        duration: 0,
        externalRef: audioPath
      }
    ])
  })
})
