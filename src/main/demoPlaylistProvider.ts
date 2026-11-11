import type { PlaylistImportProvider } from './playlistImportTypes.js'

export function createDemoPlaylistProvider(): PlaylistImportProvider {
  return {
    id: 'demo-local',
    displayName: 'Demo Local',
    canHandle: (input) => input.trim().startsWith('demo:'),
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
}
