/* global process */
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateElectronSmokeSnapshot } from './lib/electron-smoke.mjs'
import { runPerformanceCapture } from './lib/run-performance-capture.mjs'

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function readOption(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

const outputPath = readOption('--out', '')
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'nextdj-electron-smoke-'))
const capturePath = join(temporaryDirectory, 'snapshot.json')

try {
  await runPerformanceCapture(
    ['--scenario', 'deck-play', '--warmup-ms', '500', '--wait-ms', '250', '--out', capturePath],
    45000
  )

  const snapshot = JSON.parse(await readFile(capturePath, 'utf8'))
  const failures = validateElectronSmokeSnapshot(snapshot)
  const report = {
    passed: failures.length === 0,
    checks: [
      'production Electron renderer opened',
      'deterministic WAV loaded through the file input',
      'library metadata decoded',
      'deck audio and waveform decoded',
      'play changed the transport control to pause'
    ],
    failures,
    snapshot
  }
  const serializedReport = `${JSON.stringify(report, null, 2)}\n`

  if (outputPath) {
    const absoluteOutputPath = resolve(PROJECT_ROOT, outputPath)
    await mkdir(dirname(absoluteOutputPath), { recursive: true })
    await writeFile(absoluteOutputPath, serializedReport)
  }

  process.stdout.write(serializedReport)

  if (failures.length > 0) {
    process.exitCode = 1
  }
} finally {
  await rm(temporaryDirectory, { force: true, recursive: true })
}
