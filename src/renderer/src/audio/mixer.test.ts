import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Mixer } from './mixer'

class FakeParam {
  value = 1

  setValueAtTime(value: number): void {
    this.value = value
  }
}

class FakeNode {
  connections: FakeNode[] = []

  connect<T extends FakeNode>(node: T): T {
    this.connections.push(node)
    return node
  }

  disconnect(): void {
    this.connections = []
  }
}

class FakeGain extends FakeNode {
  gain = new FakeParam()
}

class FakeAnalyser extends FakeNode {
  fftSize = 0
  smoothingTimeConstant = 0
}

function createStream(): MediaStream {
  return {
    active: true,
    getTracks: () => []
  } as unknown as MediaStream
}

function createContext(): AudioContext {
  return {
    currentTime: 2,
    destination: new FakeNode() as unknown as AudioDestinationNode,
    createGain: () => new FakeGain() as unknown as GainNode,
    createAnalyser: () => new FakeAnalyser() as unknown as AnalyserNode,
    createMediaStreamDestination: () => {
      const destination = new FakeNode() as unknown as MediaStreamAudioDestinationNode
      Object.assign(destination, { stream: createStream() })
      return destination
    }
  } as unknown as AudioContext
}

type TestAudioElement = HTMLAudioElement & {
  play: ReturnType<typeof vi.fn>
  pause: ReturnType<typeof vi.fn>
  setSinkId: ReturnType<typeof vi.fn>
}

function getAudioElements(): TestAudioElement[] {
  return Array.from(document.querySelectorAll('audio')) as TestAudioElement[]
}

interface MixerInternals {
  recordBus: FakeGain
  recordDestination: FakeNode
  channelACrossfadeGain: FakeGain
  channelBCrossfadeGain: FakeGain
  cueOutputGain: FakeGain
}

function internals(mixer: Mixer): MixerInternals {
  return mixer as unknown as MixerInternals
}

describe('Mixer', () => {
  beforeEach(() => {
    function MockAudio(): TestAudioElement {
      const audio = document.createElement('audio') as TestAudioElement

      Object.defineProperties(audio, {
        pause: { value: vi.fn() },
        play: { value: vi.fn().mockResolvedValue(undefined) },
        setSinkId: { value: vi.fn().mockResolvedValue(undefined) }
      })

      return audio
    }

    vi.stubGlobal('Audio', MockAudio)
  })

  afterEach(() => {
    document.querySelectorAll('audio').forEach((audio) => audio.remove())
    vi.unstubAllGlobals()
  })

  it('clamps the independent headphones output gain', () => {
    const mixer = new Mixer(createContext())
    const phonesGain = internals(mixer).cueOutputGain

    mixer.setPhonesGain(-1)
    expect(phonesGain.gain.value).toBe(0)

    mixer.setPhonesGain(2)
    expect(phonesGain.gain.value).toBe(1)
  })

  it('feeds the recording bus from the channel crossfader gains, not the master gain', () => {
    const mixer = new Mixer(createContext())
    const { recordBus, recordDestination, channelACrossfadeGain, channelBCrossfadeGain } = internals(mixer)
    const masterGain = mixer.masterGain as unknown as FakeGain

    expect(channelACrossfadeGain.connections).toContain(recordBus)
    expect(channelBCrossfadeGain.connections).toContain(recordBus)
    expect(masterGain.connections).not.toContain(recordBus)
    expect(recordBus.connections).toEqual([recordDestination])
  })

  it('keeps the recording bus gain and stream unchanged when master and phones gains move', () => {
    const mixer = new Mixer(createContext())
    const { recordBus, recordDestination, cueOutputGain } = internals(mixer)
    const masterGain = mixer.masterGain as unknown as FakeGain
    const recordStream = mixer.recordStream
    const recordBusConnections = [...recordBus.connections]
    const destinationConnections = [...recordDestination.connections]

    expect(recordBus.gain.value).toBe(1)

    mixer.setMasterGain(0)
    mixer.setMasterGain(0.25)
    mixer.setPhonesGain(0)
    mixer.setPhonesGain(0.5)

    expect(masterGain.gain.value).toBe(0.25)
    expect(cueOutputGain.gain.value).toBe(0.5)
    expect(recordBus.gain.value).toBe(1)
    expect(recordBus.connections).toEqual(recordBusConnections)
    expect(recordDestination.connections).toEqual(destinationConnections)
    expect(mixer.recordStream).toBe(recordStream)
  })

  it('keeps the same record stream while the master device switches', async () => {
    const mixer = new Mixer(createContext())
    const recordStream = mixer.recordStream

    await mixer.outputRouter.setMasterDevice('external-speakers')
    expect(mixer.outputRouter.isMasterMediaElementRoute).toBe(true)
    expect(mixer.recordStream).toBe(recordStream)

    await mixer.outputRouter.setMasterDevice('default')
    expect(mixer.outputRouter.isMasterMediaElementRoute).toBe(false)
    expect(mixer.recordStream).toBe(recordStream)

    await mixer.outputRouter.setMasterDevice('usb-headphones')
    expect(mixer.outputRouter.isMasterMediaElementRoute).toBe(true)
    expect(mixer.recordStream).toBe(recordStream)
  })

  it('rethrows a failed master device switch and leaves the record stream intact', async () => {
    const mixer = new Mixer(createContext())
    const { recordBus, recordDestination } = internals(mixer)
    const recordStream = mixer.recordStream
    const recordBusConnections = [...recordBus.connections]
    const destinationConnections = [...recordDestination.connections]
    const [masterAudio] = getAudioElements()

    masterAudio.setSinkId.mockRejectedValueOnce(new Error('device unavailable'))

    await expect(mixer.outputRouter.setMasterDevice('missing-speakers')).rejects.toThrow('device unavailable')

    expect(mixer.outputRouter.isMasterMediaElementRoute).toBe(false)
    expect(mixer.recordStream).toBe(recordStream)
    expect(mixer.recordStream.active).toBe(true)
    expect(recordBus.connections).toEqual(recordBusConnections)
    expect(recordDestination.connections).toEqual(destinationConnections)
  })

  it('keeps a named master route and the record stream when switching to another named device fails', async () => {
    const mixer = new Mixer(createContext())
    const recordStream = mixer.recordStream
    const [masterAudio] = getAudioElements()

    await mixer.outputRouter.setMasterDevice('external-speakers')
    expect(mixer.outputRouter.isMasterMediaElementRoute).toBe(true)

    masterAudio.setSinkId.mockRejectedValueOnce(new Error('device unavailable'))

    await expect(mixer.outputRouter.setMasterDevice('missing-speakers')).rejects.toThrow('device unavailable')

    expect(mixer.outputRouter.isMasterMediaElementRoute).toBe(true)
    expect(mixer.recordStream).toBe(recordStream)
    expect(mixer.recordStream.active).toBe(true)
  })
})
