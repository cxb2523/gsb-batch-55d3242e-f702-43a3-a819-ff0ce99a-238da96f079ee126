import type {
  PlaylistImportProviderSummary,
  PlaylistImportResolvedFile,
  PlaylistImportTrack
} from '../shared/nextdj.js'

export interface PlaylistImportProvider {
  id: string
  displayName: string
  priority?: number
  canHandle: (input: string, context?: PlaylistImportOperationContext) => boolean | Promise<boolean>
  listTracks: (
    input: string,
    context?: PlaylistImportOperationContext
  ) => Promise<Array<Omit<PlaylistImportTrack, 'providerId'>>>
  resolveTrack: (externalRef: string, context?: PlaylistImportOperationContext) => Promise<PlaylistImportResolvedFile>
}

export interface PlaylistImportOperationContext {
  signal: AbortSignal
}

export type PlaylistImportPluginExport =
  | PlaylistImportProvider
  | PlaylistImportProvider[]
  | {
      provider?: PlaylistImportProvider
      providers?: PlaylistImportProvider[]
      default?: PlaylistImportProvider | PlaylistImportProvider[]
    }

export interface PlaylistImportRegistry {
  listProviders: () => PlaylistImportProviderSummary[]
  listTracks: (input: string) => Promise<PlaylistImportTrack[]>
  resolveTrack: (providerId: string, externalRef: string) => Promise<PlaylistImportResolvedFile>
}
