import type { NextDjBridge, PlaylistImportTrack as SharedPlaylistImportTrack } from '../../shared/nextdj'

declare global {
  interface Window {
    nextdj?: NextDjBridge
  }

  type PlaylistImportTrack = SharedPlaylistImportTrack
}

export {}
