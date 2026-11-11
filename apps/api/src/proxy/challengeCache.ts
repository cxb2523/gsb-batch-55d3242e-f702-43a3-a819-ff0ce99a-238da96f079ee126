// Short-lived routing memory for hosts that recently served a challenge.

export type ChallengeMode = "direct" | "cf" | "unknown"

interface CacheEntry {
  mode: ChallengeMode
  lastCheck: number
}

export class ChallengeCache {
  private readonly entries = new Map<string, CacheEntry>()
  private readonly ttlMs: number

  constructor(opts: { ttlMs?: number } = {}) {
    this.ttlMs = opts.ttlMs ?? 5 * 60 * 1000 // 5 minutes
  }

  get(hostname: string): ChallengeMode | undefined {
    const entry = this.entries.get(hostname)
    if (!entry) return
    if (Date.now() - entry.lastCheck > this.ttlMs) {
      this.entries.delete(hostname)
      return
    }
    return entry.mode
  }

  set(hostname: string, mode: ChallengeMode): void {
    this.entries.set(hostname, { mode, lastCheck: Date.now() })
  }

  delete(hostname: string): void {
    this.entries.delete(hostname)
  }

  clear(): void {
    this.entries.clear()
  }

  size(): number {
    return this.entries.size
  }

  prune(): number {
    const now = Date.now()
    let removed = 0
    for (const [host, entry] of this.entries) {
      if (now - entry.lastCheck <= this.ttlMs) continue
      this.entries.delete(host)
      removed++
    }
    return removed
  }
}
