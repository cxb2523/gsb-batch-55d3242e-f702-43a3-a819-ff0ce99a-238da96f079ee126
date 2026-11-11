import { describe, expect, it } from 'vitest'
import { DeckChannel } from './deckChannel'

class FakeParam {
  value = 0

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
}

class FakeGain extends FakeNode {
  gain = new FakeParam()
}

class FakeFilter extends FakeNode {
  Q = new FakeParam()
  frequency = new FakeParam()
  gain = new FakeParam()
  type: BiquadFilterType = 'lowpass'
}

describe('DeckChannel', () => {
  it('owns the pre-fader cue graph and clamps channel controls', () => {
    const gains: FakeGain[] = []
    const filters: FakeFilter[] = []
    const context = {
      currentTime: 4,
      createGain: () => {
        const gain = new FakeGain()
        gains.push(gain)
        return gain as unknown as GainNode
      },
      createBiquadFilter: () => {
        const filter = new FakeFilter()
        filters.push(filter)
        return filter as unknown as BiquadFilterNode
      }
    } as unknown as AudioContext
    const channel = new DeckChannel(context)

    channel.setTrim(-1)
    channel.setFader(2)
    channel.setEq('low', -40)
    channel.setEq('mid', 20)

    expect(channel.input.gain.value).toBe(0)
    expect(gains[3].gain.value).toBe(1)
    expect(filters[0].gain.value).toBe(-26)
    expect(filters[1].gain.value).toBe(6)
    expect(filters[2].connections).toHaveLength(2)
    expect(filters[2].connections).toContain(channel.cueOutput)
  })
})
