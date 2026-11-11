import { Deck } from './deck'
import { Mixer } from './mixer'
import type { OutputRouter } from './output'

export class DJEngine {
  readonly mixer: Mixer
  readonly outputRouter: OutputRouter
  readonly deckA: Deck
  readonly deckB: Deck

  constructor() {
    this.mixer = new Mixer()
    this.outputRouter = this.mixer.outputRouter
    this.deckA = new Deck(this.mixer.context)
    this.deckB = new Deck(this.mixer.context)

    this.deckA.output.connect(this.mixer.channelAInput)
    this.deckB.output.connect(this.mixer.channelBInput)
    this.deckA.cueOutput.connect(this.mixer.channelACueInput)
    this.deckB.cueOutput.connect(this.mixer.channelBCueInput)
  }
}

let engine: DJEngine | null = null

export function getEngine(): DJEngine {
  engine ??= new DJEngine()
  return engine
}
