export interface RecordingSessionPolicy {
  maxActiveSessions: number
  maxSessionsPerWebContents: number
  maxChunkBytes: number
  maxSessionBytes: number
}

export const DEFAULT_RECORDING_SESSION_POLICY: RecordingSessionPolicy = {
  maxActiveSessions: 4,
  maxSessionsPerWebContents: 1,
  maxChunkBytes: 16 * 1024 * 1024,
  maxSessionBytes: 32 * 1024 * 1024 * 1024
}

export interface RecordingSession<TStream> {
  id: string
  stream: TStream | null
  filePath: string
  webContentsId: number
  video: boolean
  bytes: number
  phase: 'reserved' | 'active'
}

export class RecordingSessionRegistry<TStream> {
  private readonly sessions = new Map<string, RecordingSession<TStream>>()

  constructor(private readonly policy: RecordingSessionPolicy = DEFAULT_RECORDING_SESSION_POLICY) {}

  reserve(id: string, filePath: string, webContentsId: number, video: boolean): RecordingSession<TStream> {
    if (this.sessions.has(id)) {
      throw new Error('Recording session already exists.')
    }

    if (this.sessions.size >= this.policy.maxActiveSessions) {
      throw new Error('Too many recordings are already active.')
    }

    const senderSessions = [...this.sessions.values()].filter(
      (session) => session.webContentsId === webContentsId
    ).length

    if (senderSessions >= this.policy.maxSessionsPerWebContents) {
      throw new Error('A recording is already active for this window.')
    }

    const session: RecordingSession<TStream> = {
      id,
      stream: null,
      filePath,
      webContentsId,
      video,
      bytes: 0,
      phase: 'reserved'
    }

    this.sessions.set(id, session)
    return session
  }

  activate(id: string, stream: TStream): RecordingSession<TStream> {
    const session = this.sessions.get(id)

    if (!session || session.phase !== 'reserved') {
      throw new Error('Recording session not found.')
    }

    session.stream = stream
    session.phase = 'active'
    return session
  }

  reserveBytes(id: string, webContentsId: number, byteLength: number): RecordingSession<TStream> {
    const session = this.getOwnedActive(id, webContentsId)

    if (byteLength > this.policy.maxChunkBytes) {
      throw new Error('Recording chunk exceeds the allowed size.')
    }

    if (session.bytes + byteLength > this.policy.maxSessionBytes) {
      throw new Error('Recording reached the maximum allowed size.')
    }

    session.bytes += byteLength
    return session
  }

  getOwnedActive(id: string, webContentsId: number): RecordingSession<TStream> {
    const session = this.sessions.get(id)

    if (
      !session ||
      session.webContentsId !== webContentsId ||
      session.phase !== 'active' ||
      session.stream === null
    ) {
      throw new Error('Recording session not found.')
    }

    return session
  }

  takeOwned(id: string, webContentsId: number): RecordingSession<TStream> | null {
    const session = this.sessions.get(id)

    if (!session || session.webContentsId !== webContentsId) {
      return null
    }

    this.sessions.delete(id)
    return session
  }

  take(id: string): RecordingSession<TStream> | null {
    const session = this.sessions.get(id) ?? null

    if (session) {
      this.sessions.delete(id)
    }

    return session
  }

  takeForWebContents(webContentsId: number): RecordingSession<TStream>[] {
    const ownedSessions: RecordingSession<TStream>[] = []

    for (const [id, session] of this.sessions) {
      if (session.webContentsId === webContentsId) {
        this.sessions.delete(id)
        ownedSessions.push(session)
      }
    }

    return ownedSessions
  }

  takeAll(): RecordingSession<TStream>[] {
    const allSessions = [...this.sessions.values()]
    this.sessions.clear()
    return allSessions
  }

  get size(): number {
    return this.sessions.size
  }
}
