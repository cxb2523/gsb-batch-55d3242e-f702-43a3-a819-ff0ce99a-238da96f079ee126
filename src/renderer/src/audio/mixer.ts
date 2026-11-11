import { OutputRouter } from './output'

let sharedAudioContext: AudioContext | null = null

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function getAudioContext(): AudioContext {
  sharedAudioContext ??= new AudioContext()
  return sharedAudioContext
}

export class Mixer {
  readonly context: AudioContext
  readonly outputRouter: OutputRouter
  readonly channelAInput: GainNode
  readonly channelBInput: GainNode
  readonly channelACueInput: GainNode
  readonly channelBCueInput: GainNode
  readonly channelAAnalyser: AnalyserNode
  readonly channelBAnalyser: AnalyserNode
  readonly masterAnalyser: AnalyserNode
  readonly masterGain: GainNode

  // REC OUT: post-crossfader, pre-master-volume, so recordings keep a
  // constant level while the room volume moves. Sibling branch of the
  // output router, so output-device switches never touch it.
  private readonly recordBus: GainNode
  private readonly recordDestination: MediaStreamAudioDestinationNode

  private readonly channelACrossfadeGain: GainNode
  private readonly channelBCrossfadeGain: GainNode
  private readonly channelACueGain: GainNode
  private readonly channelBCueGain: GainNode
  private readonly cueBus: GainNode
  private readonly cueMasterBlendGain: GainNode
  private readonly cueCueBlendGain: GainNode
  private readonly cueOutputGain: GainNode

  constructor(context = getAudioContext()) {
    this.context = context
    this.outputRouter = new OutputRouter(context)
    this.channelAInput = context.createGain()
    this.channelBInput = context.createGain()
    this.channelACueInput = context.createGain()
    this.channelBCueInput = context.createGain()
    this.channelAAnalyser = context.createAnalyser()
    this.channelBAnalyser = context.createAnalyser()
    this.masterAnalyser = context.createAnalyser()
    this.masterGain = context.createGain()
    this.channelACrossfadeGain = context.createGain()
    this.channelBCrossfadeGain = context.createGain()
    this.channelACueGain = context.createGain()
    this.channelBCueGain = context.createGain()
    this.cueBus = context.createGain()
    this.cueMasterBlendGain = context.createGain()
    this.cueCueBlendGain = context.createGain()
    this.cueOutputGain = context.createGain()
    this.recordBus = context.createGain()
    this.recordDestination = context.createMediaStreamDestination()

    this.configureAnalyser(this.channelAAnalyser)
    this.configureAnalyser(this.channelBAnalyser)
    this.configureAnalyser(this.masterAnalyser)

    this.masterGain.gain.value = 0.9
    this.channelACueGain.gain.value = 0
    this.channelBCueGain.gain.value = 0

    this.channelAInput
      .connect(this.channelAAnalyser)
      .connect(this.channelACrossfadeGain)
      .connect(this.masterGain)

    this.channelBInput
      .connect(this.channelBAnalyser)
      .connect(this.channelBCrossfadeGain)
      .connect(this.masterGain)

    this.channelACrossfadeGain.connect(this.recordBus)
    this.channelBCrossfadeGain.connect(this.recordBus)
    this.recordBus.connect(this.recordDestination)

    this.channelACueInput.connect(this.channelACueGain).connect(this.cueBus)
    this.channelBCueInput.connect(this.channelBCueGain).connect(this.cueBus)
    this.cueBus.connect(this.cueCueBlendGain).connect(this.cueOutputGain)
    this.masterGain.connect(this.masterAnalyser).connect(this.outputRouter.masterInput)
    this.masterGain.connect(this.cueMasterBlendGain).connect(this.cueOutputGain)
    this.cueOutputGain.connect(this.outputRouter.cueInput)

    this.setCrossfade(0)
    this.setCueMix(0)
  }

  get recordStream(): MediaStream {
    return this.recordDestination.stream
  }

  setCrossfade(x: number): void {
    const clamped = clamp(x, -1, 1)
    const angle = ((clamped + 1) * Math.PI) / 4
    const gainA = Math.cos(angle)
    const gainB = Math.sin(angle)

    this.channelACrossfadeGain.gain.setValueAtTime(gainA, this.context.currentTime)
    this.channelBCrossfadeGain.gain.setValueAtTime(gainB, this.context.currentTime)
  }

  setMasterGain(value: number): void {
    this.masterGain.gain.setValueAtTime(clamp(value, 0, 1), this.context.currentTime)
  }

  setPhonesGain(value: number): void {
    this.cueOutputGain.gain.setValueAtTime(clamp(value, 0, 1), this.context.currentTime)
  }

  setCue(channel: 'A' | 'B', on: boolean): void {
    const cueGain = channel === 'A' ? this.channelACueGain : this.channelBCueGain
    cueGain.gain.setValueAtTime(on ? 1 : 0, this.context.currentTime)
  }

  setCueMix(value: number): void {
    const clamped = clamp(value, 0, 1)
    const angle = clamped * (Math.PI / 2)
    const cueGain = Math.cos(angle)
    const masterGain = Math.sin(angle)

    this.cueCueBlendGain.gain.setValueAtTime(cueGain, this.context.currentTime)
    this.cueMasterBlendGain.gain.setValueAtTime(masterGain, this.context.currentTime)
  }

  private configureAnalyser(analyser: AnalyserNode): void {
    analyser.fftSize = 2048
    analyser.smoothingTimeConstant = 0.8
  }
}
