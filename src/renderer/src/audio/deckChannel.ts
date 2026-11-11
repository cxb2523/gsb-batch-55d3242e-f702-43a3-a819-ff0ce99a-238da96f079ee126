import { clampEqDb, clampPositiveValue, clampUnitValue } from './deckMath'

export type EqBand = 'low' | 'mid' | 'high'

export class DeckChannel {
  readonly input: GainNode
  readonly output: GainNode
  readonly cueOutput: GainNode

  private readonly context: AudioContext
  private readonly lowFilter: BiquadFilterNode
  private readonly midFilter: BiquadFilterNode
  private readonly highFilter: BiquadFilterNode
  private readonly channelFader: GainNode

  constructor(context: AudioContext) {
    this.context = context
    this.input = context.createGain()
    this.output = context.createGain()
    this.cueOutput = context.createGain()
    this.lowFilter = context.createBiquadFilter()
    this.midFilter = context.createBiquadFilter()
    this.highFilter = context.createBiquadFilter()
    this.channelFader = context.createGain()

    this.input.gain.value = 1
    this.channelFader.gain.value = 1
    this.output.gain.value = 1
    this.cueOutput.gain.value = 1

    this.lowFilter.type = 'lowshelf'
    this.lowFilter.frequency.value = 320
    this.midFilter.type = 'peaking'
    this.midFilter.frequency.value = 1000
    this.midFilter.Q.value = 1
    this.highFilter.type = 'highshelf'
    this.highFilter.frequency.value = 3200

    this.input
      .connect(this.lowFilter)
      .connect(this.midFilter)
      .connect(this.highFilter)
      .connect(this.channelFader)
      .connect(this.output)

    this.highFilter.connect(this.cueOutput)
  }

  setEq(band: EqBand, dB: number): void {
    this.getEqFilter(band).gain.setValueAtTime(clampEqDb(dB), this.context.currentTime)
  }

  setTrim(value: number): void {
    this.input.gain.setValueAtTime(clampPositiveValue(value), this.context.currentTime)
  }

  setFader(value: number): void {
    this.channelFader.gain.setValueAtTime(clampUnitValue(value), this.context.currentTime)
  }

  private getEqFilter(band: EqBand): BiquadFilterNode {
    if (band === 'low') {
      return this.lowFilter
    }

    if (band === 'mid') {
      return this.midFilter
    }

    return this.highFilter
  }
}
