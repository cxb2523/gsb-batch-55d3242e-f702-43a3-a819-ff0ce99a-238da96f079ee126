export interface MimeChoice {
  mimeType: string
  extension: 'm4a' | 'mp4' | 'webm'
}

// MP4 first: Chromium 126+ muxes fragmented MP4 in MediaRecorder, which is
// both DJ-friendly (plays anywhere) and append-only (survives crashes).
const AUDIO_CANDIDATES: MimeChoice[] = [
  { mimeType: 'audio/mp4;codecs=mp4a.40.2', extension: 'm4a' },
  { mimeType: 'audio/mp4', extension: 'm4a' },
  { mimeType: 'audio/webm;codecs=opus', extension: 'webm' },
  { mimeType: 'audio/webm', extension: 'webm' }
]

const VIDEO_CANDIDATES: MimeChoice[] = [
  { mimeType: 'video/mp4;codecs=avc1.640028,mp4a.40.2', extension: 'mp4' },
  { mimeType: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', extension: 'mp4' },
  { mimeType: 'video/mp4', extension: 'mp4' },
  { mimeType: 'video/webm;codecs=h264,opus', extension: 'webm' },
  { mimeType: 'video/webm;codecs=vp9,opus', extension: 'webm' },
  { mimeType: 'video/webm;codecs=vp8,opus', extension: 'webm' },
  { mimeType: 'video/webm', extension: 'webm' }
]

function pick(candidates: MimeChoice[]): MimeChoice | null {
  if (typeof MediaRecorder === 'undefined') {
    return null
  }

  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate.mimeType)) ?? null
}

export function pickAudioMime(): MimeChoice | null {
  return pick(AUDIO_CANDIDATES)
}

export function pickVideoMime(): MimeChoice | null {
  return pick(VIDEO_CANDIDATES)
}
