import type { RecordingStartOptions } from '../shared/nextdj.js'
import { isAllowedRecordingExtension } from './recordingPaths.js'

export function parseRecordingStartOptions(value: unknown): RecordingStartOptions {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid recording options.')
  }

  const options = value as Partial<RecordingStartOptions>

  if (!isAllowedRecordingExtension(options.extension)) {
    throw new Error('Unsupported recording format.')
  }

  if (typeof options.video !== 'boolean') {
    throw new Error('Invalid recording options.')
  }

  return {
    extension: options.extension,
    video: options.video
  }
}

export function parseRecordingSessionId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('Recording session not found.')
  }

  return value
}

export function parseRecordingChunk(value: unknown): ArrayBuffer {
  if (!(value instanceof ArrayBuffer)) {
    throw new Error('Invalid recording chunk.')
  }

  return value
}

export function parseDeleteFileFlag(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new Error('Invalid recording cancel option.')
  }

  return value
}

export function parseRecordingPath(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('Invalid recording path.')
  }

  return value
}
