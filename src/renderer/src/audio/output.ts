export interface OutputDeviceInfo {
  deviceId: string
  label: string
}

type SinkSelectableAudioElement = HTMLAudioElement & {
  setSinkId?: (sinkId: string) => Promise<void>
}

type MasterRoute = 'direct' | 'media-element'

const DEFAULT_OUTPUT_DEVICE_ID = 'default'

function createHiddenAudioElement(stream: MediaStream): SinkSelectableAudioElement {
  const audio = new Audio() as SinkSelectableAudioElement

  audio.autoplay = true
  audio.controls = false
  audio.srcObject = stream
  audio.style.display = 'none'

  if (typeof document !== 'undefined') {
    document.body.append(audio)
  }

  void audio.play().catch(() => {
    // Browser autoplay policy may require a user gesture; playback is retried on device changes.
  })

  return audio
}

export class OutputRouter {
  readonly masterInput: GainNode
  readonly cueInput: GainNode

  private readonly context: AudioContext
  private readonly masterDestination: MediaStreamAudioDestinationNode
  private readonly cueDestination: MediaStreamAudioDestinationNode
  private readonly masterAudio: SinkSelectableAudioElement
  private readonly cueAudio: SinkSelectableAudioElement
  private masterRoute: MasterRoute = 'direct'
  private masterRouteOperationId = 0
  private requestedMediaPermission = false

  constructor(context: AudioContext) {
    this.context = context
    this.masterInput = context.createGain()
    this.cueInput = context.createGain()
    this.masterDestination = context.createMediaStreamDestination()
    this.cueDestination = context.createMediaStreamDestination()
    this.masterAudio = createHiddenAudioElement(this.masterDestination.stream)
    this.cueAudio = createHiddenAudioElement(this.cueDestination.stream)

    // Keep the latency-critical room output inside WebAudio when it follows
    // the system default device. Routing it through a MediaStream-backed
    // HTMLAudioElement adds a second playback buffer that can lag transport.
    this.masterInput.connect(context.destination)
    this.cueInput.connect(this.cueDestination)
  }

  async listOutputDevices(): Promise<OutputDeviceInfo[]> {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return []
    }

    let devices = await navigator.mediaDevices.enumerateDevices()
    let outputs = this.filterOutputDevices(devices)
    const hasBlankOutputLabel = this.hasBlankOutputLabel(devices)

    if (!this.requestedMediaPermission && hasBlankOutputLabel) {
      this.requestedMediaPermission = true

      if (navigator.mediaDevices.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
          stream.getTracks().forEach((track) => track.stop())
          devices = await navigator.mediaDevices.enumerateDevices()
          outputs = this.filterOutputDevices(devices)
        } catch {
          return outputs
        }
      }
    }

    return outputs
  }

  async setMasterDevice(deviceId: string): Promise<void> {
    const operationId = ++this.masterRouteOperationId

    if (deviceId === DEFAULT_OUTPUT_DEVICE_ID) {
      this.setMasterRoute('direct')
      return
    }

    await this.setDevice(this.masterAudio, deviceId)

    if (operationId === this.masterRouteOperationId) {
      this.setMasterRoute('media-element')
    }
  }

  async setCueDevice(deviceId: string): Promise<void> {
    await this.setDevice(this.cueAudio, deviceId)
  }

  private filterOutputDevices(devices: MediaDeviceInfo[]): OutputDeviceInfo[] {
    return devices
      .filter((device) => device.kind === 'audiooutput')
      .map((device) => ({
        deviceId: device.deviceId,
        label: device.label || (device.deviceId === 'default' ? 'System default' : 'Audio output')
      }))
  }

  private hasBlankOutputLabel(devices: MediaDeviceInfo[]): boolean {
    return devices.some((device) => device.kind === 'audiooutput' && device.label.length === 0)
  }

  private setMasterRoute(route: MasterRoute): void {
    if (this.masterRoute === route) {
      return
    }

    this.masterInput.disconnect()

    if (route === 'direct') {
      this.masterAudio.pause()
      this.masterInput.connect(this.context.destination)
    } else {
      this.masterInput.connect(this.masterDestination)
    }

    this.masterRoute = route
  }

  private async setDevice(audio: SinkSelectableAudioElement, deviceId: string): Promise<void> {
    if (!audio.setSinkId) {
      throw new Error('Audio output device selection is not supported in this environment.')
    }

    await audio.setSinkId(deviceId)
    await audio.play()
  }
}
