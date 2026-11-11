import * as path from 'node:path'

export const ALLOWED_RECORDING_EXTENSIONS = new Set(['m4a', 'mp4', 'webm'])
export const MIN_RECORDING_FREE_BYTES = 500 * 1024 * 1024

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function timestampedRecordingFileName(extension: string, now = new Date(), uniqueSuffix?: string): string {
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const time = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`
  const suffix = uniqueSuffix ? ` ${uniqueSuffix}` : ''

  return `NextDJ ${date} ${time}${suffix}.${extension}`
}

export function isAllowedRecordingExtension(extension: unknown): extension is string {
  return typeof extension === 'string' && ALLOWED_RECORDING_EXTENSIONS.has(extension)
}

type PathOperations = Pick<typeof path, 'isAbsolute' | 'relative' | 'resolve' | 'sep'>

export function isPathInsideDirectory(
  filePath: unknown,
  directory: string,
  pathOperations: PathOperations = path
): filePath is string {
  if (typeof filePath !== 'string') {
    return false
  }

  const resolvedDirectory = pathOperations.resolve(directory)
  const resolvedFilePath = pathOperations.resolve(filePath)
  const relativePath = pathOperations.relative(resolvedDirectory, resolvedFilePath)

  return (
    relativePath === '' ||
    (relativePath !== '..' &&
      !relativePath.startsWith(`..${pathOperations.sep}`) &&
      !pathOperations.isAbsolute(relativePath))
  )
}
