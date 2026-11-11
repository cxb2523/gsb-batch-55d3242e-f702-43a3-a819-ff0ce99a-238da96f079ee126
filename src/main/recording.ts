import { app, ipcMain, shell, webContents } from 'electron'
import { createWriteStream, type WriteStream } from 'node:fs'
import { mkdir, rm, statfs } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import {
  isPathInsideDirectory,
  MIN_RECORDING_FREE_BYTES,
  timestampedRecordingFileName
} from './recordingPaths.js'
import {
  parseDeleteFileFlag,
  parseRecordingChunk,
  parseRecordingPath,
  parseRecordingSessionId,
  parseRecordingStartOptions
} from './recordingValidation.js'
import { readPerfRecordingsDir } from './performanceFlags.js'
import { RecordingSessionRegistry, type RecordingSession } from './recordingSessionRegistry.js'

const sessions = new RecordingSessionRegistry<WriteStream>()
let allowQuit = false
let quitFinalizing = false

function getRecordingsDirectory(): string {
  return readPerfRecordingsDir() ?? join(app.getPath('music'), 'NextDJ Recordings')
}

function setThrottling(webContentsId: number, throttled: boolean): void {
  const contents = webContents.fromId(webContentsId)

  if (contents && !contents.isDestroyed()) {
    contents.setBackgroundThrottling(throttled)
  }
}

function writeChunk(stream: WriteStream, chunk: Buffer): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    stream.write(chunk, (error) => (error ? rejectPromise(error) : resolvePromise()))
  })
}

async function openStream(filePath: string): Promise<WriteStream> {
  const stream = createWriteStream(filePath, { flags: 'wx' })

  await once(stream, 'open')
  return stream
}

async function endStream(stream: WriteStream): Promise<void> {
  if (stream.destroyed || stream.closed) {
    return
  }

  stream.end()
  await once(stream, 'close')
}

async function closeSession(session: RecordingSession<WriteStream>): Promise<void> {
  if (session.video) {
    setThrottling(session.webContentsId, true)
  }

  if (session.stream) {
    await endStream(session.stream)
  }
}

async function finalizeSession(id: string, webContentsId?: number): Promise<RecordingSession<WriteStream> | null> {
  const session =
    webContentsId === undefined ? sessions.take(id) : sessions.takeOwned(id, webContentsId)

  if (!session) {
    return null
  }

  await closeSession(session)
  return session
}

async function finalizeSessionsFor(webContentsId: number): Promise<void> {
  const ownedSessions = sessions.takeForWebContents(webContentsId)
  await Promise.allSettled(ownedSessions.map(closeSession))
}

async function finalizeAllSessions(): Promise<void> {
  await Promise.allSettled(sessions.takeAll().map(closeSession))
}

async function failSession(id: string, error: unknown): Promise<void> {
  const session = sessions.take(id)

  if (!session) {
    return
  }

  await closeSession(session).catch(() => undefined)
  const contents = webContents.fromId(session.webContentsId)

  if (contents && !contents.isDestroyed()) {
    contents.send('recording:write-error', {
      id,
      message: error instanceof Error ? error.message : 'Could not write the recording.'
    })
  }
}

export function registerRecordingIpc(): void {
  ipcMain.handle('recording:start', async (event, rawOptions: unknown) => {
    const options = parseRecordingStartOptions(rawOptions)
    const directory = getRecordingsDirectory()
    const id = randomUUID()
    const filePath = join(directory, timestampedRecordingFileName(options.extension, new Date(), id))
    const webContentsId = event.sender.id

    sessions.reserve(id, filePath, webContentsId, options.video)

    try {
      await mkdir(directory, { recursive: true })

      const stats = await statfs(directory)
      const freeBytes = stats.bavail * stats.bsize

      if (freeBytes < MIN_RECORDING_FREE_BYTES) {
        throw new Error('Not enough free disk space to record (less than 500 MB available).')
      }

      const stream = await openStream(filePath)
      sessions.activate(id, stream)
      stream.on('error', (error) => {
        void failSession(id, error)
      })

      if (options.video) {
        // The compositor draws on a timer in the renderer; without this the
        // frame rate collapses when the window is occluded or minimized.
        event.sender.setBackgroundThrottling(false)
      }

      return { id, filePath }
    } catch (error) {
      const session = sessions.take(id)

      if (session) {
        await closeSession(session).catch(() => undefined)
      }

      await rm(filePath, { force: true }).catch(() => undefined)
      throw error
    }
  })

  ipcMain.handle('recording:append-chunk', async (event, rawId: unknown, rawChunk: unknown) => {
    const id = parseRecordingSessionId(rawId)
    const chunk = parseRecordingChunk(rawChunk)
    const session = sessions.getOwnedActive(id, event.sender.id)

    try {
      sessions.reserveBytes(id, event.sender.id, chunk.byteLength)
      const buffer = Buffer.from(chunk)
      await writeChunk(session.stream as WriteStream, buffer)
    } catch (error) {
      await failSession(id, error)
    }
  })

  ipcMain.handle('recording:stop', async (event, rawId: unknown) => {
    const id = parseRecordingSessionId(rawId)
    const session = await finalizeSession(id, event.sender.id)

    if (!session) {
      throw new Error('Recording session not found.')
    }

    return { filePath: session.filePath, bytes: session.bytes }
  })

  ipcMain.handle('recording:cancel', async (event, rawId: unknown, rawDeleteFile: unknown) => {
    const id = parseRecordingSessionId(rawId)
    const deleteFile = parseDeleteFileFlag(rawDeleteFile)
    const session = await finalizeSession(id, event.sender.id)

    if (session && deleteFile) {
      await rm(session.filePath, { force: true })
    }
  })

  ipcMain.handle('recording:reveal', (_event, rawFilePath: unknown) => {
    const filePath = parseRecordingPath(rawFilePath)
    const directory = getRecordingsDirectory()

    if (!isPathInsideDirectory(filePath, directory)) {
      throw new Error('Invalid recording path.')
    }

    shell.showItemInFolder(filePath)
  })

  app.on('web-contents-created', (_event, contents) => {
    contents.on('destroyed', () => void finalizeSessionsFor(contents.id))
    contents.on('render-process-gone', () => void finalizeSessionsFor(contents.id))
  })

  app.on('before-quit', (event) => {
    if (allowQuit) {
      return
    }

    event.preventDefault()

    if (quitFinalizing) {
      return
    }

    quitFinalizing = true
    void finalizeAllSessions().finally(() => {
      allowQuit = true
      app.quit()
    })
  })
}
