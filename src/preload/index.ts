import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  NextDjBridge,
  AppUpdateInfo,
  PlaylistImportProviderSummary,
  PlaylistImportResolvedFile,
  PlaylistImportTrack,
  RecordingStartOptions,
  RecordingStartResult,
  RecordingStopResult,
  RecordingWriteError
} from '../shared/nextdj.js'

const bridge: NextDjBridge = {
  appName: 'NextDJ',
  checkForUpdate: (): Promise<AppUpdateInfo> => ipcRenderer.invoke('app-update:check'),
  openUpdateDownload: (): Promise<void> => ipcRenderer.invoke('app-update:open-download'),
  selectPlaylistImportFile: (): Promise<string | null> => ipcRenderer.invoke('playlist-import:select-file'),
  listPlaylistImportProviders: (): Promise<PlaylistImportProviderSummary[]> =>
    ipcRenderer.invoke('playlist-import:list-providers'),
  listPlaylistImportTracks: (input: string): Promise<PlaylistImportTrack[]> =>
    ipcRenderer.invoke('playlist-import:list-tracks', input),
  resolvePlaylistImportTrack: (providerId: string, externalRef: string): Promise<PlaylistImportResolvedFile> =>
    ipcRenderer.invoke('playlist-import:resolve-track', providerId, externalRef),
  startRecording: (options: RecordingStartOptions): Promise<RecordingStartResult> =>
    ipcRenderer.invoke('recording:start', options),
  appendRecordingChunk: (id: string, chunk: ArrayBuffer): Promise<void> =>
    ipcRenderer.invoke('recording:append-chunk', id, chunk),
  stopRecording: (id: string): Promise<RecordingStopResult> => ipcRenderer.invoke('recording:stop', id),
  cancelRecording: (id: string, deleteFile: boolean): Promise<void> =>
    ipcRenderer.invoke('recording:cancel', id, deleteFile),
  revealRecording: (filePath: string): Promise<void> => ipcRenderer.invoke('recording:reveal', filePath),
  onRecordingWriteError: (callback: (error: RecordingWriteError) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, error: RecordingWriteError): void => callback(error)
    ipcRenderer.on('recording:write-error', listener)
    return () => ipcRenderer.removeListener('recording:write-error', listener)
  }
}

contextBridge.exposeInMainWorld('nextdj', bridge)
