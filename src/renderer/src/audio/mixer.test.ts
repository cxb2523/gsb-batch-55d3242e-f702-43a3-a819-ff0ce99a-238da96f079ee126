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

function createContext(): AudioContext {
  return {
    currentTime: 2,
    destination: new FakeNode() as unknown as AudioDestinationNode,
    createGain: () => new FakeGain() as unknown as GainNode,
    createAnalyser: () => new FakeAnalyser() as unknown as AnalyserNode,
    createMediaStreamDestination: () => {
      const destination = new FakeNode() as unknown as MediaStreamAudioDestinationNode
      Object.assign(destination, { stream: {} })
      return destination
    }
  } as unknown as AudioContext
}

describe('Mixer', () => {
  beforeEach(() => {
    function MockAudio(): HTMLAudioElement {
      const audio = document.createElement('audio')
      Object.defineProperty(audio, 'play', { value: vi.fn().mockResolvedValue(undefined) })
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
    const phonesGain = (mixer as unknown as { cueOutputGain: FakeGain }).cueOutputGain

    mixer.setPhonesGain(-1)
    expect(phonesGain.gain.value).toBe(0)

    mixer.setPhonesGain(2)
    expect(phonesGain.gain.value).toBe(1)
  })
})
