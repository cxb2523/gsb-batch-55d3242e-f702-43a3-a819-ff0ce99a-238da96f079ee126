/* global WebSocket, clearTimeout, fetch, process, setTimeout */
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'
import { createSyntheticAudioFile } from './lib/synthetic-audio.mjs'

const DEFAULT_WAIT_MS = 5000
const DEFAULT_WARMUP_MS = 1000
const SCENARIOS = new Set(['', 'deck-load', 'deck-play', 'deck-record'])
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function readOption(name, fallback) {
  const index = process.argv.indexOf(name)

  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(true)
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      child.off('exit', onExit)
      resolve(false)
    }, timeoutMs)
    const onExit = () => {
      clearTimeout(timeout)
      resolve(true)
    }

    child.once('exit', onExit)
  })
}

async function readJson(url) {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Could not read ${url}: ${response.status}`)
  }

  return response.json()
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()

    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => {
        if (address && typeof address === 'object') {
          resolve(address.port)
        } else {
          reject(new Error('Could not allocate a local debugging port.'))
        }
      })
    })
  })
}

async function findRendererTarget(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  const url = `http://127.0.0.1:${port}/json/list`

  while (Date.now() < deadline) {
    try {
      const targets = await readJson(url)
      const target = targets.find((candidate) => candidate.type === 'page' && candidate.webSocketDebuggerUrl)

      if (target) {
        return target
      }
    } catch {
      // Electron may still be starting.
    }

    await delay(250)
  }

  throw new Error(`No Electron renderer target appeared on port ${port}.`)
}

function createCdpClient(webSocketDebuggerUrl) {
  let nextId = 1
  const pending = new Map()
  const socket = new WebSocket(webSocketDebuggerUrl)

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data.toString())

    if (!message.id) {
      return
    }

    const request = pending.get(message.id)

    if (!request) {
      return
    }

    pending.delete(message.id)

    if (message.error) {
      request.reject(new Error(message.error.message ?? 'CDP command failed.'))
    } else {
      request.resolve(message.result)
    }
  })

  return new Promise((resolve, reject) => {
    socket.addEventListener('open', () => {
      resolve({
        close: () => socket.close(),
        send: (method, params = {}) =>
          new Promise((requestResolve, requestReject) => {
            const id = nextId
            nextId += 1
            pending.set(id, { resolve: requestResolve, reject: requestReject })
            socket.send(JSON.stringify({ id, method, params }))
          })
      })
    })
    socket.addEventListener('error', () => reject(new Error('Could not connect to Electron renderer CDP.')))
  })
}

async function waitForProfiler(client, timeoutMs) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const result = await client.send('Runtime.evaluate', {
      expression: 'Boolean(globalThis.__NEXTDJ_PERF__?.snapshot)',
      returnByValue: true
    })

    if (result.result?.value === true) {
      return
    }

    await delay(250)
  }

  throw new Error('Renderer profiler did not become available.')
}

async function readSnapshot(client) {
  const result = await client.send('Runtime.evaluate', {
    expression: 'globalThis.__NEXTDJ_PERF__.snapshot()',
    returnByValue: true
  })

  return result.result?.value
}

async function resetProfiler(client) {
  await client.send('Runtime.evaluate', {
    expression: 'globalThis.__NEXTDJ_PERF__.reset()'
  })
}

function hasMeasure(snapshot, name) {
  return Boolean(snapshot?.measures?.[name]?.count)
}

async function waitForMeasures(client, names, timeoutMs) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const snapshot = await readSnapshot(client)

    if (names.every((name) => hasMeasure(snapshot, name))) {
      return
    }

    await delay(250)
  }

  throw new Error(`Timed out waiting for performance measures: ${names.join(', ')}`)
}

async function waitForSelectorNode(client, selector, timeoutMs) {
  const deadline = Date.now() + timeoutMs

  await client.send('DOM.enable')

  while (Date.now() < deadline) {
    const documentResult = await client.send('DOM.getDocument', { depth: -1, pierce: true })
    const queryResult = await client.send('DOM.querySelectorAll', {
      nodeId: documentResult.root.nodeId,
      selector
    })
    const [nodeId] = queryResult.nodeIds ?? []

    if (nodeId) {
      return nodeId
    }

    await delay(250)
  }

  throw new Error(`Could not find selector: ${selector}`)
}

async function querySelectorNode(client, selector) {
  await client.send('DOM.enable')
  const documentResult = await client.send('DOM.getDocument', { depth: -1, pierce: true })
  const queryResult = await client.send('DOM.querySelectorAll', {
    nodeId: documentResult.root.nodeId,
    selector
  })
  const [nodeId] = queryResult.nodeIds ?? []

  return nodeId ?? null
}

async function getRecorderStatusText(client) {
  const result = await client.send('Runtime.evaluate', {
    expression: `document.querySelector('.rec-control')?.innerText ?? ''`,
    returnByValue: true
  })

  return result.result?.value ?? ''
}

async function waitForRecordingButton(client, timeoutMs) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const stopNodeId = await querySelectorNode(client, '.rec-control button[aria-label="Stop recording"]:not(:disabled)')

    if (stopNodeId) {
      return stopNodeId
    }

    const errorNodeId = await querySelectorNode(client, '.rec-note-error')

    if (errorNodeId) {
      throw new Error(`Recording failed: ${await getRecorderStatusText(client)}`)
    }

    await delay(250)
  }

  throw new Error(`Recording did not start: ${await getRecorderStatusText(client)}`)
}

async function clickNode(client, nodeId) {
  const { model } = await client.send('DOM.getBoxModel', { nodeId })

  if (!model?.content?.length) {
    throw new Error('Could not read element bounds for click.')
  }

  const x = (model.content[0] + model.content[2] + model.content[4] + model.content[6]) / 4
  const y = (model.content[1] + model.content[3] + model.content[5] + model.content[7]) / 4

  await client.send('Input.dispatchMouseEvent', {
    button: 'left',
    buttons: 1,
    clickCount: 1,
    type: 'mousePressed',
    x,
    y
  })
  await client.send('Input.dispatchMouseEvent', {
    button: 'left',
    buttons: 0,
    clickCount: 1,
    type: 'mouseReleased',
    x,
    y
  })
}

async function loadSyntheticDeckTrack(client, options) {
  const fixture = await createSyntheticAudioFile(options)

  try {
    const nodeId = await waitForSelectorNode(client, '.library-panel input[type="file"]', 10000)

    await client.send('DOM.setFileInputFiles', {
      files: [fixture.filePath],
      nodeId
    })
    const loadNodeId = await waitForSelectorNode(client, '.library-table tbody .load-chip-a', 10000)
    await clickNode(client, loadNodeId)
    await waitForMeasures(
      client,
      [
        'library.audioMetadata.decodeAudioData',
        'library.audioMetadata.detectBpm',
        'deck.loadFile.decodeAudioData',
        'deck.loadFile.computeWaveform'
      ],
      20000
    )
  } finally {
    await fixture.remove()
  }
}

async function playSyntheticDeckTrack(client) {
  await loadSyntheticDeckTrack(client)

  const playNodeId = await waitForSelectorNode(client, '.deck-panel button[aria-label="Play"]:not(:disabled)', 10000)
  await clickNode(client, playNodeId)
  await waitForSelectorNode(client, '.deck-panel button[aria-label="Pause"]', 10000)
}

async function recordSyntheticDeckTrack(client) {
  await loadSyntheticDeckTrack(client, { durationSeconds: 12 })

  const playNodeId = await waitForSelectorNode(client, '.deck-panel button[aria-label="Play"]:not(:disabled)', 10000)
  await clickNode(client, playNodeId)
  await waitForSelectorNode(client, '.deck-panel button[aria-label="Pause"]', 10000)

  const recordNodeId = await waitForSelectorNode(client, '.rec-control button[aria-label="Start recording"]', 10000)
  await clickNode(client, recordNodeId)
  const audioModeNodeId = await waitForSelectorNode(client, '.rec-popover-item', 10000)
  await clickNode(client, audioModeNodeId)

  const stopNodeId = await waitForRecordingButton(client, 15000)
  await delay(1500)
  await clickNode(client, stopNodeId)
  await waitForSelectorNode(client, '.rec-control button[aria-label="Recording saved, show in Finder"]', 10000)
  await waitForMeasures(
    client,
    [
      'recording.startRecording',
      'recording.chunk.arrayBuffer',
      'recording.appendRecordingChunk',
      'recording.pendingWrites',
      'recording.stopRecording'
    ],
    10000
  )
}

async function runScenario(client, scenario) {
  if (scenario === 'deck-load') {
    return loadSyntheticDeckTrack(client)
  }

  if (scenario === 'deck-play') {
    return playSyntheticDeckTrack(client)
  }

  if (scenario === 'deck-record') {
    return recordSyntheticDeckTrack(client)
  }

  return null
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return
  }

  const signalProcessGroup = (signal) => {
    try {
      process.kill(-child.pid, signal)
    } catch {
      child.kill(signal)
    }
  }

  signalProcessGroup('SIGINT')

  if (await waitForExit(child, 2000)) {
    return
  }

  signalProcessGroup('SIGTERM')

  if (await waitForExit(child, 2000)) {
    return
  }

  signalProcessGroup('SIGKILL')
  await waitForExit(child, 1000)
}

async function removeTemporaryDirectory(directory) {
  await rm(directory, {
    force: true,
    maxRetries: 5,
    recursive: true,
    retryDelay: 200
  })
}

const requestedPort = readOption('--port', '')
const port = requestedPort ? Number(requestedPort) : await getFreePort()
const waitMs = Number(readOption('--wait-ms', String(DEFAULT_WAIT_MS)))
const warmupMs = Number(readOption('--warmup-ms', String(DEFAULT_WARMUP_MS)))
const outPath = readOption('--out', '')
const scenario = readOption('--scenario', '')

if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('--port must be an integer between 1024 and 65535.')
}

if (!Number.isInteger(waitMs) || waitMs < 0) {
  throw new Error('--wait-ms must be a non-negative integer.')
}

if (!Number.isInteger(warmupMs) || warmupMs < 0) {
  throw new Error('--warmup-ms must be a non-negative integer.')
}

if (!SCENARIOS.has(scenario)) {
  throw new Error(`--scenario must be one of: ${Array.from(SCENARIOS).filter(Boolean).join(', ')}`)
}

const userDataDirectory = scenario ? await mkdtemp(join(tmpdir(), 'nextdj-perf-user-data-')) : ''
const recordingsDirectory = scenario === 'deck-record' ? await mkdtemp(join(tmpdir(), 'nextdj-perf-recordings-')) : ''
const child = spawn(electronPath, [join(PROJECT_ROOT, 'out/main/index.js')], {
  cwd: PROJECT_ROOT,
  detached: true,
  env: {
    ...process.env,
    NEXTDJ_PERF: '1',
    NEXTDJ_REMOTE_DEBUGGING_PORT: String(port),
    ...(userDataDirectory ? { NEXTDJ_PERF_USER_DATA_DIR: userDataDirectory } : {}),
    ...(recordingsDirectory ? { NEXTDJ_PERF_RECORDINGS_DIR: recordingsDirectory } : {})
  },
  stdio: ['ignore', 'pipe', 'pipe']
})

child.stdout.on('data', (data) => process.stderr.write(data))
child.stderr.on('data', (data) => process.stderr.write(data))

let client

try {
  const target = await findRendererTarget(port, 15000)
  client = await createCdpClient(target.webSocketDebuggerUrl)
  await waitForProfiler(client, 10000)
  await delay(warmupMs)
  await resetProfiler(client)
  await runScenario(client, scenario)
  await delay(waitMs)

  const snapshot = await readSnapshot(client)
  const output = `${JSON.stringify(snapshot, null, 2)}\n`

  if (outPath) {
    await writeFile(outPath, output)
  } else {
    process.stdout.write(output)
  }
} finally {
  client?.close()
  await stop(child)
  if (userDataDirectory) {
    await removeTemporaryDirectory(userDataDirectory)
  }
  if (recordingsDirectory) {
    await removeTemporaryDirectory(recordingsDirectory)
  }
}
