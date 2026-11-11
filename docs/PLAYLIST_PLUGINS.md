# Playlist Import Plugins

NextDJ can load external playlist import providers from a local config file. Providers run in the Electron main process and are never executed in the renderer.

## Local Config

Create `playlist-plugins.json` in the app user data directory:

```json
{
  "plugins": [
    "/absolute/path/to/demo-playlist-plugin/dist/index.mjs"
  ]
}
```

Relative paths are resolved from the directory that contains `playlist-plugins.json`.

## Provider API

A plugin is an ESM module that exports one provider, a default provider, or a `providers` array:

```ts
export interface PlaylistImportProvider {
  id: string
  displayName: string
  priority?: number
  canHandle: (input: string, context?: { signal: AbortSignal }) => boolean | Promise<boolean>
  listTracks: (input: string, context?: { signal: AbortSignal }) => Promise<Array<{
    id: string
    title: string
    artist?: string
    duration: number
    externalRef: string
  }>>
  resolveTrack: (externalRef: string, context?: { signal: AbortSignal }) => Promise<{
    file: {
      data: ArrayBuffer
      name: string
      lastModified: number
      type?: string
    } | null
    outputDirectory: string
  }>
}
```

Provider ids must be stable and match `^[a-z0-9][a-z0-9._-]*$`.
`canHandle` is required so one generic provider cannot capture every input.
Higher `priority` values are considered first; providers with the same priority
keep their configuration order.

Core validates and canonicalizes every provider response. A single playlist may
contain at most 5,000 tracks, track strings and the complete serialized response
have bounded sizes, durations must be finite and between zero and 24 hours, and
resolved files may not exceed 512 MiB. Provider operations receive an abort
signal and are subject to timeouts. Providers should stop network and file work
promptly when that signal is aborted.

If a provider depends on a local executable that is unavailable, it can throw
an error with `code` set to `NEXTDJ_PLAYLIST_DEPENDENCY_NOT_FOUND` and a
`dependency` value matching `^[a-z0-9][a-z0-9._-]{0,63}$`. NextDJ surfaces a
bounded dependency message while keeping all other provider errors isolated.

## Demo Provider

```js
export default {
  id: 'demo-local',
  displayName: 'Demo Local',
  canHandle: (input) => input.startsWith('demo:'),
  async listTracks() {
    return [
      {
        id: 'demo-track',
        title: 'Demo Playlist Track',
        artist: 'Demo Artist',
        duration: 30,
        externalRef: 'demo-track'
      }
    ]
  },
  async resolveTrack() {
    return {
      file: null,
      outputDirectory: ''
    }
  }
}
```

Providers are responsible for only importing content that the user has the right to access, copy, and use.

## Built-in Providers

NextDJ ships one built-in provider: `m3u-local` (Local M3U playlist). It
accepts the absolute path to a local `.m3u`/`.m3u8` file (a `file://` URL to
that path also works) and lists the tracks it references. Playlist entries
may be absolute paths, paths relative to the playlist file's directory, or
`file://` URLs; `http(s)://` stream entries are skipped rather than causing
an error. Nested playlist references are not followed.

Built-in providers are registered after any providers loaded from
`playlist-plugins.json`, so a configured plugin with a conflicting id takes
precedence over the built-in.

See [`src/main/m3uPlaylistProvider.ts`](../src/main/m3uPlaylistProvider.ts)
for a reference implementation that plugin authors can copy.
