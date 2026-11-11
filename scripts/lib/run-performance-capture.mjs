/* global clearTimeout, process, setTimeout */
import { spawn } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

export function runPerformanceCapture(args, timeoutMs) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [join(PROJECT_ROOT, 'scripts/capture-renderer-perf.mjs'), ...args], {
      cwd: PROJECT_ROOT,
      stdio: ['ignore', 'ignore', 'inherit']
    })
    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      rejectRun(new Error(`Electron capture exceeded ${timeoutMs}ms.`))
    }, timeoutMs)

    child.once('error', (error) => {
      clearTimeout(timeout)
      rejectRun(error)
    })
    child.once('exit', (code, signal) => {
      clearTimeout(timeout)

      if (code === 0) {
        resolveRun()
      } else {
        rejectRun(new Error(`Electron capture failed with ${signal ?? `exit code ${code}`}.`))
      }
    })
  })
}
