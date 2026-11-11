import { getScheduledOffset, getScheduledStart } from './deckTransport'
import type { LoopState } from './deckTypes'

interface StartDeckSourceOptions {
  buffer: AudioBuffer
  context: AudioContext
  destination: AudioNode
  duration: number
  offsetSeconds: number
  onEnded: () => void
  playbackRate: number
  loop: LoopState
}

interface StartedDeckSource {
  offsetSeconds: number
  source: AudioBufferSourceNode
  startContextTime: number
}

export function startDeckSource({
  buffer,
  context,
  destination,
  duration,
  offsetSeconds,
  onEnded,
  playbackRate,
  loop
}: StartDeckSourceOptions): StartedDeckSource {
  const source = context.createBufferSource()
  const startContextTime = getScheduledStart(context.currentTime)
  const scheduledOffset = getScheduledOffset(offsetSeconds, playbackRate, duration)

  source.buffer = buffer
  source.playbackRate.value = playbackRate
  configureDeckSourceLoop(source, loop)
  source.connect(destination)
  source.onended = onEnded
  source.start(startContextTime, scheduledOffset)

  return {
    offsetSeconds: scheduledOffset,
    source,
    startContextTime
  }
}

export function configureDeckSourceLoop(source: AudioBufferSourceNode, loop: LoopState): void {
  const active = loop.active && loop.start !== null && loop.end !== null && loop.end > loop.start

  source.loop = active

  if (active) {
    source.loopStart = loop.start as number
    source.loopEnd = loop.end as number
  }
}
