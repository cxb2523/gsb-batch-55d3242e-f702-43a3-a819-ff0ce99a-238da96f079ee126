import { app, BrowserWindow, Menu, session } from 'electron'
import { configureSessionSecurity } from './appSecurity.js'
import { registerAppUpdateIpc } from './appUpdate.js'
import {
  appendRendererPerfFlag,
  isRendererPerfEnabled,
  readPerfUserDataDir,
  resolveRemoteDebuggingPort
} from './performanceFlags.js'
import { registerPlaylistImportIpc } from './playlistImport.js'
import { registerRecordingIpc } from './recording.js'
import { createMainWindow } from './window.js'

const mainDirectory = import.meta.dirname
const isDev = Boolean(process.env.ELECTRON_RENDERER_URL)
const perfUserDataDir = readPerfUserDataDir()
const rendererPerformanceEnabled = isRendererPerfEnabled()
const remoteDebuggingPort = resolveRemoteDebuggingPort(isDev, rendererPerformanceEnabled)

if (perfUserDataDir) {
  app.setPath('userData', perfUserDataDir)
}

if (remoteDebuggingPort) {
  app.commandLine.appendSwitch('remote-debugging-port', String(remoteDebuggingPort))
}

app.whenReady().then(() => {
  if (!isDev) {
    Menu.setApplicationMenu(null)
  }

  configureSessionSecurity(session.defaultSession)

  registerAppUpdateIpc()
  registerPlaylistImportIpc()
  registerRecordingIpc()
  createMainWindow({
    dirname: mainDirectory,
    enablePerformanceTracing: rendererPerformanceEnabled,
    isDev,
    rendererUrl: appendRendererPerfFlag(process.env.ELECTRON_RENDERER_URL)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow({
        dirname: mainDirectory,
        enablePerformanceTracing: rendererPerformanceEnabled,
        isDev,
        rendererUrl: appendRendererPerfFlag(process.env.ELECTRON_RENDERER_URL)
      })
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
