import type { WaveformData } from './waveformData'
import { clearHotCueState, triggerHotCueState } from './deckHotCues'
import { DeckChannel, type EqBand } from './deckChannel'
import {
  createAutoLoopState,
  createEmptyLoop,
  createLoopInState,
  createLoopOutState,
  deactivateLoop
} from './deckLoops'
import {
  loadCuePoint,
  loadHotCues,
  migrateDeckPersistenceKey,
  saveCuePoint,
  saveHotCues
} from './deckPersistence'
import {
  calculateJogPlaybackRate,
  clampPitchPercent,
  pitchPercentToRate
} from './deckMath'
import {
  getJogConsumedSeconds,
  getLoopedPosition,
  getPlaybackPosition,
  clampPosition as clampDeckPosition
} from './deckTransport'
import { EMPTY_HOT_CUES, type HotCue, type LoopState, type TrackMetadata } from './deckTypes'
import { configureDeckSourceLoop, startDeckSource } from './deckSource'
import { DeckTrackLoader, type DeckLoadAnalysis } from './deckTrackLoader'
import { ScratchAudio } from './scratchAudio'

export type { DeckLoadAnalysis } from './deckTrackLoader'
export type { EqBand } from './deckChannel'

const JOG_TICK_MS = 40

export { MAX_PITCH_PERCENT, MIN_PITCH_PERCENT } from './deckMath'

export class Deck {
  readonly output: GainNode
  readonly cueOutput: GainNode

  onEnded: (() => void) | null = null

  private readonly context: AudioContext
  private readonly channel: DeckChannel
  private readonly trackLoader: DeckTrackLoader
  private readonly scratchAudio: ScratchAudio

  private buffer: AudioBuffer | null = null
  private source: AudioBufferSourceNode | null = null
  private started = false
  private suppressEnded = false
  private startContextTime = 0
  private offsetSeconds = 0
  private playbackRate = 1
  private basePlaybackRate = 1
  private cuePreviewing = false
  private scratchActive = false
  private scratchResumePlayback = false
  private jogPendingSeconds = 0
  private jogIntervalId: number | null = null
  private jogLastFoldTime = 0
  private transportIntent = 0
  private persistenceKey = 'No track loaded'

  duration = 0
  metadata: TrackMetadata = { name: 'No track loaded', bpm: 0, firstBeatOffset: 0 }
  waveform: WaveformData | null = null
  hotCues: Array<HotCue | null> = [...EMPTY_HOT_CUES]
  loop: LoopState = createEmptyLoop()
  cuePoint = 0

  constructor(context: AudioContext) {
    this.context = context
    this.channel = new DeckChannel(context)
    this.trackLoader = new DeckTrackLoader(context)
    this.scratchAudio = new ScratchAudio(context, this.channel.input)
    this.output = this.channel.output
    this.cueOutput = this.channel.cueOutput
  }

  get isPlaying(): boolean {
    return this.started || (this.scratchActive && this.scratchResumePlayback)
  }

  async loadFile(file: File | ArrayBuffer, analysis?: DeckLoadAnalysis, persistenceKey?: string): Promise<boolean> {
    const prepared = await this.trackLoader.prepare(file, analysis, persistenceKey)

    if (!prepared) {
      return false
    }

    this.stop()
    this.buffer = prepared.buffer
    this.duration = prepared.duration
    this.waveform = prepared.waveform
    this.metadata = prepared.metadata
    this.persistenceKey = prepared.persistenceKey
    migrateDeckPersistenceKey(prepared.metadata.name, prepared.persistenceKey)
    this.hotCues = loadHotCues(prepared.persistenceKey, (seconds) => this.clampPosition(seconds))
    this.cuePoint = loadCuePoint(prepared.persistenceKey, (seconds) => this.clampPosition(seconds))
    this.loop = createEmptyLoop()
    return true
  }

  async play(): Promise<void> {
    const intent = ++this.transportIntent

    if (!this.buffer || this.started || this.scratchActive) {
      return
    }

    if (this.context.state === 'suspended') {
      await this.context.resume()
    }

    if (intent !== this.transportIntent || !this.buffer || this.started) {
      return
    }

    this.startSourceAt(this.offsetSeconds)
  }

  pause(): void {
    this.transportIntent += 1

    if (this.scratchActive) {
      this.scratchResumePlayback = false
      this.scratchActive = false
      this.scratchAudio.stop()
      return
    }

    if (!this.started) {
      return
    }

    this.offsetSeconds = this.getPosition()
    this.stopSource(true)
  }

  stop(): void {
    this.transportIntent += 1
    this.scratchActive = false
    this.scratchResumePlayback = false
    this.stopSource(true)
    this.offsetSeconds = 0
    this.startContextTime = 0
  }

  seek(seconds: number): void {
    this.transportIntent += 1
    this.scratchActive = false
    this.scratchResumePlayback = false
    const nextOffset = getLoopedPosition(this.clampPosition(seconds), this.loop)
    const shouldRestart = this.started

    this.stopSource(true)
    this.offsetSeconds = nextOffset

    if (shouldRestart) {
      this.startSourceAt(nextOffset)
    }
  }

  scrubTo(seconds: number, direction: -1 | 1): void {
    if (!this.buffer || this.started) {
      return
    }

    this.transportIntent += 1
    this.offsetSeconds = getLoopedPosition(this.clampPosition(seconds), this.loop)
    this.scratchAudio.play(this.buffer, this.offsetSeconds, direction)
  }

  scratchStart(): number {
    if (!this.buffer || this.scratchActive) {
      return this.getPosition()
    }

    this.transportIntent += 1
    const position = this.getPosition()

    this.scratchResumePlayback = this.started
    this.offsetSeconds = position
    this.stopSource(true)
    this.offsetSeconds = position
    this.scratchActive = true
    return position
  }

  scratchEnd(): void {
    if (!this.scratchActive) {
      return
    }

    const shouldResume = this.scratchResumePlayback

    this.scratchAudio.stop()
    this.scratchActive = false
    this.scratchResumePlayback = false

    if (shouldResume) {
      this.startSourceAt(this.offsetSeconds)
    }
  }

  setPitch(percent: number): number {
    const clamped = clampPitchPercent(percent)

    if (this.started) {
      this.offsetSeconds = this.getPosition()
      this.startContextTime = this.context.currentTime
    }

    this.playbackRate = pitchPercentToRate(clamped)
    this.basePlaybackRate = this.playbackRate

    if (this.source) {
      this.source.playbackRate.setValueAtTime(this.playbackRate, this.context.currentTime)
    }

    return clamped
  }

  nudge(seconds: number): void {
    this.seek(this.getPosition() + seconds)
  }

  jogShift(seconds: number): void {
    if (this.scratchActive) {
      return
    }

    if (!this.started) {
      this.nudge(seconds)
      return
    }

    this.jogPendingSeconds += seconds
    this.applyJogRate()

    if (this.jogIntervalId === null) {
      this.jogIntervalId = window.setInterval(() => this.jogTick(), JOG_TICK_MS)
    }
  }

  setCuePoint(seconds: number = this.getPosition()): void {
    this.cuePoint = this.clampPosition(seconds)
    saveCuePoint(this.persistenceKey, this.cuePoint)
  }

  async cuePress(): Promise<void> {
    if (this.duration <= 0) {
      return
    }

    if (this.started) {
      this.pause()
      this.seek(this.cuePoint)
      return
    }

    const position = this.getPosition()

    if (Math.abs(position - this.cuePoint) > 0.08) {
      this.setCuePoint(position)
      this.seek(this.cuePoint)
      return
    }

    this.cuePreviewing = true
    await this.play()
  }

  cueRelease(): void {
    if (!this.cuePreviewing) {
      return
    }

    this.cuePreviewing = false
    this.pause()
    this.seek(this.cuePoint)
  }

  getEffectiveBpm(): number {
    return this.metadata.bpm > 0 ? this.metadata.bpm * this.playbackRate : 0
  }

  triggerHotCue(index: number): void {
    const result = triggerHotCueState(this.hotCues, index, this.getPosition(), this.duration)

    if (result.seekPosition !== null) {
      this.seek(result.seekPosition)
      return
    }

    this.hotCues = result.hotCues

    if (result.shouldSave) {
      saveHotCues(this.persistenceKey, this.hotCues)
    }
  }

  clearHotCue(index: number): void {
    this.hotCues = clearHotCueState(this.hotCues, index)
    saveHotCues(this.persistenceKey, this.hotCues)
  }

  setLoopIn(): void {
    this.loop = createLoopInState(this.loop, this.getPosition())
    this.applySourceLoop()
  }

  setLoopOut(): void {
    this.loop = createLoopOutState(this.loop, this.getPosition())
    this.applySourceLoop()
  }

  setAutoLoop(beats: number): void {
    const start = this.getPosition()
    const loop = createAutoLoopState(this.metadata.bpm, beats, this.duration, start, (seconds) =>
      this.clampPosition(seconds)
    )

    if (loop) {
      this.loop = loop
      this.applySourceLoop()
    }
  }

  exitLoop(): void {
    if (this.started) {
      this.offsetSeconds = this.getPosition()
      this.startContextTime = this.context.currentTime
    }

    this.loop = deactivateLoop(this.loop)
    this.applySourceLoop()
  }

  setEq(band: EqBand, dB: number): void {
    this.channel.setEq(band, dB)
  }

  setTrim(value: number): void {
    this.channel.setTrim(value)
  }

  setChannelFader(value: number): void {
    this.channel.setFader(value)
  }

  getPosition(): number {
    if (!this.started) {
      return this.clampPosition(this.offsetSeconds)
    }

    return getLoopedPosition(
      getPlaybackPosition(
        this.started,
        this.offsetSeconds,
        this.context.currentTime,
        this.startContextTime,
        this.playbackRate,
        this.duration
      ),
      this.loop
    )
  }

  private startSourceAt(offsetSeconds: number): void {
    if (!this.buffer) {
      return
    }

    this.scratchAudio.stop()

    const { source, offsetSeconds: scheduledOffset, startContextTime } = startDeckSource({
      buffer: this.buffer,
      context: this.context,
      destination: this.channel.input,
      duration: this.duration,
      offsetSeconds,
      playbackRate: this.playbackRate,
      loop: this.loop,
      onEnded: () => {
        if (this.suppressEnded) {
          this.suppressEnded = false
          return
        }

        this.started = false
        this.source = null
        this.offsetSeconds = this.duration
        this.startContextTime = 0
        this.onEnded?.()
      }
    })

    this.source = source
    this.started = true
    this.offsetSeconds = scheduledOffset
    this.startContextTime = startContextTime
    this.suppressEnded = false
  }

  private applySourceLoop(): void {
    if (this.source) {
      configureDeckSourceLoop(this.source, this.loop)
    }
  }

  // Fold elapsed time at the current rate into the offset, then bend the
  // rate so the pending jog shift is consumed within JOG_CHASE_SECONDS.
  private applyJogRate(): void {
    this.offsetSeconds = this.getPosition()
    this.startContextTime = this.context.currentTime
    this.jogLastFoldTime = this.context.currentTime

    this.playbackRate = calculateJogPlaybackRate(this.basePlaybackRate, this.jogPendingSeconds)
    this.source?.playbackRate.setValueAtTime(this.playbackRate, this.context.currentTime)
  }

  private jogTick(): void {
    const consumed = getJogConsumedSeconds(
      this.playbackRate,
      this.basePlaybackRate,
      this.context.currentTime,
      this.jogLastFoldTime
    )
    this.jogPendingSeconds -= consumed

    if (!this.started || Math.abs(this.jogPendingSeconds) < 0.0005) {
      this.endJog()
      return
    }

    this.applyJogRate()
  }

  private endJog(): void {
    if (this.jogIntervalId !== null) {
      window.clearInterval(this.jogIntervalId)
      this.jogIntervalId = null
    }

    this.jogPendingSeconds = 0

    if (this.started) {
      this.offsetSeconds = this.getPosition()
      this.startContextTime = this.context.currentTime
    }

    this.playbackRate = this.basePlaybackRate
    this.source?.playbackRate.setValueAtTime(this.basePlaybackRate, this.context.currentTime)
  }

  private stopSource(suppressEnded: boolean): void {
    this.scratchAudio.stop()
    if (this.jogIntervalId !== null) {
      window.clearInterval(this.jogIntervalId)
      this.jogIntervalId = null
      this.jogPendingSeconds = 0
      this.playbackRate = this.basePlaybackRate
    }

    if (!this.source) {
      this.started = false
      return
    }

    this.suppressEnded = suppressEnded
    this.source.onended = null
    this.source.stop()
    this.source.disconnect()
    this.source = null
    this.started = false
  }

  private clampPosition(seconds: number): number {
    return clampDeckPosition(seconds, this.duration)
  }

}
