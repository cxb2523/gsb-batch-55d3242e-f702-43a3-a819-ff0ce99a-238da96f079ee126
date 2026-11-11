import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OutputRouter } from './output'

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

type TestAudioElement = HTMLAudioElement & {
  play: ReturnType<typeof vi.fn>
  pause: ReturnType<typeof vi.fn>
  setSinkId: ReturnType<typeof vi.fn>
}

function createContext(): {
  context: AudioContext
  destination: FakeNode
  mediaDestinations: FakeNode[]
} {
  const destination = new FakeNode()
  const mediaDestinations: FakeNode[] = []

  return {
    context: {
      destination: destination as unknown as AudioDestinationNode,
      createGain: () => new FakeNode() as unknown as GainNode,
      createMediaStreamDestination: () => {
        const mediaDestination = new FakeNode()
        mediaDestinations.push(mediaDestination)
        return Object.assign(mediaDestination, { stream: {} }) as unknown as MediaStreamAudioDestinationNode
      }
    } as unknown as AudioContext,
    destination,
    mediaDestinations
  }
}

function getAudioElements(): TestAudioElement[] {
  return Array.from(document.querySelectorAll('audio')) as TestAudioElement[]
}

describe('OutputRouter', () => {
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

  it('routes the default master output directly to the AudioContext destination', async () => {
    const { context, destination, mediaDestinations } = createContext()
    const router = new OutputRouter(context)
    const masterInput = router.masterInput as unknown as FakeNode
    const [masterAudio] = getAudioElements()

    await router.setMasterDevice('default')

    expect(masterInput.connections).toEqual([destination])
    expect(masterInput.connections).not.toContain(mediaDestinations[0])
    expect(masterAudio.setSinkId).not.toHaveBeenCalled()
  })

  it('uses the selectable media-element route for a non-default master device', async () => {
    const { context, mediaDestinations } = createContext()
    const router = new OutputRouter(context)
    const masterInput = router.masterInput as unknown as FakeNode
    const [masterAudio] = getAudioElements()

    await router.setMasterDevice('external-speakers')

    expect(masterAudio.setSinkId).toHaveBeenCalledWith('external-speakers')
    expect(masterAudio.play).toHaveBeenCalled()
    expect(masterInput.connections).toEqual([mediaDestinations[0]])
  })

  it('returns to the direct route and stops buffered media playback', async () => {
    const { context, destination } = createContext()
    const router = new OutputRouter(context)
    const masterInput = router.masterInput as unknown as FakeNode
    const [masterAudio] = getAudioElements()

    await router.setMasterDevice('external-speakers')
    await router.setMasterDevice('default')

    expect(masterAudio.pause).toHaveBeenCalled()
    expect(masterInput.connections).toEqual([destination])
  })

  it('does not let a stale device change replace a newer direct route', async () => {
    let finishDeviceChange = (): void => undefined
    const pendingDeviceChange = new Promise<void>((resolve) => {
      finishDeviceChange = resolve
    })
    const { context, destination } = createContext()
    const router = new OutputRouter(context)
    const masterInput = router.masterInput as unknown as FakeNode
    const [masterAudio] = getAudioElements()

    masterAudio.setSinkId.mockReturnValueOnce(pendingDeviceChange)
    const staleChange = router.setMasterDevice('slow-speakers')
    await router.setMasterDevice('default')
    finishDeviceChange()
    await staleChange

    expect(masterInput.connections).toEqual([destination])
  })
})
