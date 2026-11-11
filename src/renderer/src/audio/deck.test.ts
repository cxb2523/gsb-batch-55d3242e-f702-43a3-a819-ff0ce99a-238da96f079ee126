import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Deck } from './deck'

vi.mock('./waveformData', () => ({
  computeWaveformData: vi.fn(() => ({
    overview: { bucketCount: 1, peaks: new Float32Array([0, 1]), lows: new Float32Array([0, 0.5]) },
    zoom: { bucketCount: 1, peaks: new Float32Array([0, 1]), lows: new Float32Array([0, 0.5]) }
  })),
  computeWaveformDataAsync: vi.fn(async () => ({
    overview: { bucketCount: 1, peaks: new Float32Array([0, 1]), lows: new Float32Array([0, 0.5]) },
    zoom: { bucketCount: 1, peaks: new Float32Array([0, 1]), lows: new Float32Array([0, 0.5]) }
  }))
}))

vi.mock('./bpm', () => ({
  detectBpm: vi.fn(async () => ({ bpm: 128, firstBeatOffset: 0.125 }))
}))

class FakeAudioParam {
  value: number
  values: number[] = []

  constructor(value = 0) {
    this.value = value
  }

  setValueAtTime(value: number): void {
    this.value = value
    this.values.push(value)
  }

  linearRampToValueAtTime(value: number): void {
    this.value = value
    this.values.push(value)
  }
}

class FakeAudioNode {
  connections: FakeAudioNode[] = []

  connect<T extends FakeAudioNode>(node: T): T {
    this.connections.push(node)
    return node
  }

  disconnect(): void {
    this.connections = []
  }
}

class FakeGainNode extends FakeAudioNode {
  gain = new FakeAudioParam(1)
}

class FakeBiquadFilterNode extends FakeAudioNode {
  Q = new FakeAudioParam(0)
  frequency = new FakeAudioParam(0)
  gain = new FakeAudioParam(0)
  type: BiquadFilterType = 'lowpass'
}

class FakeAudioBufferSourceNode extends FakeAudioNode {
  buffer: AudioBuffer | null = null
  loop = false
  loopStart = 0
  loopEnd = 0
  onended: (() => void) | null = null
  playbackRate = new FakeAudioParam(1)
  starts: Array<{ offset: number; when: number }> = []
  stopCalls = 0

  start(when: number, offset: number): void {
    this.starts.push({ offset, when })
  }

  stop(): void {
    this.stopCalls += 1
  }

  finish(): void {
    this.onended?.()
  }
}

class FakeAudioContext {
  currentTime = 0
  state: AudioContextState = 'running'
  sources: FakeAudioBufferSourceNode[] = []
  resume = vi.fn(async () => {
    this.state = 'running'
  })

  createGain(): GainNode {
    return new FakeGainNode() as unknown as GainNode
  }

  createBiquadFilter(): BiquadFilterNode {
    return new FakeBiquadFilterNode() as unknown as BiquadFilterNode
  }

  createBufferSource(): AudioBufferSourceNode {
    const source = new FakeAudioBufferSourceNode()
    this.sources.push(source)
    return source as unknown as AudioBufferSourceNode
  }

  createBuffer(numberOfChannels: number, length: number, sampleRate: number): AudioBuffer {
    return createBufferFromData(
      Array.from({ length: numberOfChannels }, () => new Float32Array(length)),
      sampleRate
    )
  }

  async decodeAudioData(): Promise<AudioBuffer> {
    return createBuffer(10)
  }
}

function createBuffer(duration: number): AudioBuffer {
  return createBufferFromData([new Float32Array(duration * 100)], 100)
}

function createBufferFromData(channels: Float32Array[], sampleRate: number): AudioBuffer {
  return {
    duration: channels[0].length / sampleRate,
    length: channels[0].length,
    numberOfChannels: channels.length,
    sampleRate,
    getChannelData: (channel: number) => channels[channel]
  } as unknown as AudioBuffer
}

async function loadDeck(deck: Deck, context: FakeAudioContext, analysis = { bpm: 120, firstBeatOffset: 0.25 }): Promise<void> {
  vi.spyOn(context, 'decodeAudioData').mockResolvedValueOnce(createBuffer(10))
  await deck.loadFile(new ArrayBuffer(8), analysis)
}

function createDeck(): { context: FakeAudioContext; deck: Deck } {
  const context = new FakeAudioContext()
  return { context, deck: new Deck(context as unknown as AudioContext) }
}

function createDeferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolvePromise = (_value: T): void => undefined
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve
  })

  return { promise, resolve: resolvePromise }
}

describe('Deck', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useRealTimers()
  })

  it('loads decoded audio with supplied analysis and resets transport state', async () => {
    const { context, deck } = createDeck()

    await loadDeck(deck, context)

    expect(deck.duration).toBe(10)
    expect(deck.metadata).toEqual({ name: 'Loaded audio', bpm: 120, firstBeatOffset: 0.25 })
    expect(deck.waveform?.overview.bucketCount).toBe(1)
    expect(deck.isPlaying).toBe(false)
    expect(deck.getPosition()).toBe(0)
  })

  it('plays, pauses, seeks and resumes from the current transport position', async () => {
    const { context, deck } = createDeck()
    await loadDeck(deck, context)

    await deck.play()
    context.currentTime = 2.01

    expect(deck.isPlaying).toBe(true)
    expect(deck.getPosition()).toBeCloseTo(2.01, 2)

    deck.pause()
    expect(deck.isPlaying).toBe(false)
    expect(deck.getPosition()).toBeCloseTo(2.01, 2)
    expect(context.sources[0].stopCalls).toBe(1)

    deck.seek(4)
    await deck.play()

    expect(context.sources[1].starts[0].when).toBeCloseTo(2.02)
    expect(context.sources[1].starts[0].offset).toBe(4.01)
  })

  it('scrubs stopped audio in both directions without starting transport playback', async () => {
    const { context, deck } = createDeck()
    const samples = Float32Array.from({ length: 1000 }, (_, index) => index)
    vi.spyOn(context, 'decodeAudioData').mockResolvedValueOnce(createBufferFromData([samples], 100))
    await deck.loadFile(new ArrayBuffer(8), { bpm: 120, firstBeatOffset: 0 })

    deck.scrubTo(4, 1)
    deck.scrubTo(3.5, -1)

    expect(deck.isPlaying).toBe(false)
    expect(deck.getPosition()).toBe(3.5)
    expect(context.sources).toHaveLength(2)
    expect(context.sources[0].buffer?.getChannelData(0)[0]).toBe(400)
    expect(context.sources[1].buffer?.getChannelData(0)[0]).toBe(349)
    expect(context.sources[1].buffer?.getChannelData(0)[1]).toBe(348)
  })

  it('scratches playing audio in both directions and resumes from the new position', async () => {
    const { context, deck } = createDeck()
    await loadDeck(deck, context)
    await deck.play()
    context.currentTime = 2.01

    const startPosition = deck.scratchStart()
    deck.scrubTo(1.5, -1)

    expect(startPosition).toBeCloseTo(2.01, 2)
    expect(context.sources[0].stopCalls).toBe(1)
    expect(deck.isPlaying).toBe(true)
    expect(deck.getPosition()).toBe(1.5)

    deck.scratchEnd()

    expect(deck.isPlaying).toBe(true)
    expect(context.sources).toHaveLength(3)
    expect(context.sources[2].starts[0].offset).toBe(1.51)
  })

  it('does not resume after playback is paused during an active scratch', async () => {
    const { context, deck } = createDeck()
    await loadDeck(deck, context)
    await deck.play()

    deck.scratchStart()
    deck.pause()
    deck.scratchEnd()

    expect(deck.isPlaying).toBe(false)
    expect(context.sources).toHaveLength(1)
  })

  it('clamps pitch and applies it to the active source', async () => {
    const { context, deck } = createDeck()
    await loadDeck(deck, context)
    await deck.play()

    const clamped = deck.setPitch(25)

    expect(clamped).toBe(16)
    expect(context.sources[0].playbackRate.value).toBe(1.16)
    expect(deck.getEffectiveBpm()).toBeCloseTo(139.2)
  })

  it('previews from the cue point and returns there on release', async () => {
    const { context, deck } = createDeck()
    await loadDeck(deck, context)

    deck.setCuePoint(1.5)
    deck.seek(1.5)
    await deck.cuePress()

    expect(deck.isPlaying).toBe(true)

    context.currentTime = 0.51
    deck.cueRelease()

    expect(deck.isPlaying).toBe(false)
    expect(deck.getPosition()).toBe(1.5)
  })

  it('configures sample-accurate native loops without recreating the source', async () => {
    const { context, deck } = createDeck()
    await loadDeck(deck, context)

    deck.seek(2)
    deck.setAutoLoop(4)

    expect(deck.loop).toEqual({ start: 2, end: 4, active: true })

    await deck.play()
    expect(context.sources[0]).toMatchObject({ loop: true, loopStart: 2, loopEnd: 4 })
    context.currentTime = 2.3

    expect(deck.getPosition()).toBeCloseTo(2.3, 2)
    expect(context.sources).toHaveLength(1)

    deck.exitLoop()
    expect(deck.loop.active).toBe(false)
    expect(context.sources[0].loop).toBe(false)
  })

  it('serializes concurrent play intents while the audio context resumes', async () => {
    const { context, deck } = createDeck()
    await loadDeck(deck, context)
    context.state = 'suspended'
    const resume = createDeferred<void>()
    context.resume.mockImplementation(() => resume.promise)

    const firstPlay = deck.play()
    const secondPlay = deck.play()
    context.state = 'running'
    resume.resolve(undefined)
    await Promise.all([firstPlay, secondPlay])

    expect(context.sources).toHaveLength(1)
    expect(deck.isPlaying).toBe(true)
  })

  it('does not start cue preview after release wins a pending context resume', async () => {
    const { context, deck } = createDeck()
    await loadDeck(deck, context)
    deck.setCuePoint(1.5)
    deck.seek(1.5)
    context.state = 'suspended'
    const resume = createDeferred<void>()
    context.resume.mockImplementation(() => resume.promise)

    const cuePress = deck.cuePress()
    deck.cueRelease()
    context.state = 'running'
    resume.resolve(undefined)
    await cuePress

    expect(context.sources).toHaveLength(0)
    expect(deck.isPlaying).toBe(false)
    expect(deck.getPosition()).toBe(1.5)
  })

  it('marks the track ended and notifies listeners when the source finishes naturally', async () => {
    const { context, deck } = createDeck()
    const onEnded = vi.fn()
    deck.onEnded = onEnded
    await loadDeck(deck, context)

    await deck.play()
    context.sources[0].finish()

    expect(deck.isPlaying).toBe(false)
    expect(deck.getPosition()).toBe(10)
    expect(onEnded).toHaveBeenCalledTimes(1)
  })

  it('commits only the latest overlapping deck load', async () => {
    const { context, deck } = createDeck()
    const firstDecode = createDeferred<AudioBuffer>()
    const secondDecode = createDeferred<AudioBuffer>()
    context.decodeAudioData = vi
      .fn()
      .mockImplementationOnce(() => firstDecode.promise)
      .mockImplementationOnce(() => secondDecode.promise)

    const firstLoad = deck.loadFile(new ArrayBuffer(8), { bpm: 100, firstBeatOffset: 0 })
    const secondLoad = deck.loadFile(new ArrayBuffer(16), { bpm: 130, firstBeatOffset: 0.2 })

    secondDecode.resolve(createBuffer(20))
    await expect(secondLoad).resolves.toBe(true)
    firstDecode.resolve(createBuffer(10))
    await expect(firstLoad).resolves.toBe(false)

    expect(deck.duration).toBe(20)
    expect(deck.metadata).toMatchObject({ bpm: 130, firstBeatOffset: 0.2 })
  })

  it('keeps cue persistence separate for tracks with the same filename', async () => {
    const { deck } = createDeck()
    const analysis = { bpm: 120, firstBeatOffset: 0 }

    await deck.loadFile(new File(['first'], 'shared-name.mp3'), analysis, 'track-a')
    deck.setCuePoint(3)

    await deck.loadFile(new File(['second'], 'shared-name.mp3'), analysis, 'track-b')
    expect(deck.cuePoint).toBe(0)
    deck.setCuePoint(6)

    await deck.loadFile(new File(['first'], 'shared-name.mp3'), analysis, 'track-a')
    expect(deck.cuePoint).toBe(3)
  })
})
