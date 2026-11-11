import { BrowserWindow } from 'electron'
import { join } from 'node:path'

interface CreateMainWindowOptions {
  dirname: string
  enablePerformanceTracing?: boolean
  isDev: boolean
  rendererUrl?: string
}

export function createMainWindow({
  dirname,
  enablePerformanceTracing = false,
  isDev,
  rendererUrl
}: CreateMainWindowOptions): void {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1280,
    minHeight: 800,
    backgroundColor: '#0a0b0e',
    title: 'NextDJ',
    webPreferences: {
      preload: join(dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  if (!isDev) {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      const isReloadKey = input.key.toLowerCase() === 'r' && (input.meta || input.control)

      if (isReloadKey) {
        event.preventDefault()
      }
    })
  }

  if (rendererUrl) {
    mainWindow.loadURL(rendererUrl)
  } else {
    mainWindow.loadFile(join(dirname, '../renderer/index.html'), {
      query: enablePerformanceTracing ? { nextdjPerf: '1' } : undefined
    })
  }
}
