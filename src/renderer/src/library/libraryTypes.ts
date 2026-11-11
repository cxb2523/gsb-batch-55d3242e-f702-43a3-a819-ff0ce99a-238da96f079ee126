export interface LibraryTrack {
  id: string
  title: string
  artist?: string
  artworkUrl?: string
  duration: number
  bpm: number
  firstBeatOffset: number
  file?: File
  source: 'local' | 'external'
  providerId?: string
  externalRef?: string
}

export interface PersistedTrack {
  id: string
  title: string
  artist?: string
  artworkUrl?: string
  duration: number
  bpm: number
  firstBeatOffset: number
  source: 'local' | 'external' | string
  providerId?: string
  externalRef?: string
  fileName?: string
  fileType?: string
  fileLastModified?: number
  hasFile: boolean
  [key: string]: unknown
}
