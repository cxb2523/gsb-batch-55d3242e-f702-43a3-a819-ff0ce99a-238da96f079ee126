const MIN_REMOTE_DEBUGGING_PORT = 1024
const MAX_REMOTE_DEBUGGING_PORT = 65535

export function readRemoteDebuggingPort(value = process.env.NEXTDJ_REMOTE_DEBUGGING_PORT): number | null {
  if (!value) {
    return null
  }

  const port = Number(value)

  return Number.isInteger(port) && port >= MIN_REMOTE_DEBUGGING_PORT && port <= MAX_REMOTE_DEBUGGING_PORT ? port : null
}

export function isRendererPerfEnabled(value = process.env.NEXTDJ_PERF): boolean {
  return value === '1'
}

export function resolveRemoteDebuggingPort(
  isDev: boolean,
  perfEnabled = isRendererPerfEnabled(),
  port = readRemoteDebuggingPort()
): number | null {
  return isDev || perfEnabled ? port : null
}

export function readPerfUserDataDir(value = process.env.NEXTDJ_PERF_USER_DATA_DIR): string | null {
  return value && value.trim() ? value : null
}

export function readPerfRecordingsDir(value = process.env.NEXTDJ_PERF_RECORDINGS_DIR): string | null {
  return value && value.trim() ? value : null
}

export function appendRendererPerfFlag(rendererUrl: string | undefined, enabled = isRendererPerfEnabled()): string | undefined {
  if (!rendererUrl || !enabled) {
    return rendererUrl
  }

  try {
    const url = new URL(rendererUrl)
    url.searchParams.set('nextdjPerf', '1')
    return url.toString()
  } catch {
    const separator = rendererUrl.includes('?') ? '&' : '?'
    return `${rendererUrl}${separator}nextdjPerf=1`
  }
}
