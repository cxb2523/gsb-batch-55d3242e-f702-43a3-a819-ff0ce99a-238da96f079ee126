import { useEffect } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { DJEngine } from '../audio/engine'
import type { DeckState } from '../app/deckState'
import type { DeckId } from '../app/engineTypes'
import { subscribeVisualFrame } from '../performance/visualClock'

type TransportDeckSnapshot = Pick<DeckState, 'position' | 'isPlaying' | 'effectiveBpm' | 'hotCues' | 'loop'>
const TRANSPORT_VIEW_INTERVAL_MS = 50

function hasTransportSnapshotChanged(current: DeckState, snapshot: TransportDeckSnapshot): boolean {
  return (
    current.position !== snapshot.position ||
    current.isPlaying !== snapshot.isPlaying ||
    current.effectiveBpm !== snapshot.effectiveBpm ||
    current.hotCues !== snapshot.hotCues ||
    current.loop !== snapshot.loop
  )
}

export function useTransportTicker(
  engine: DJEngine,
  masterDeckIdRef: MutableRefObject<DeckId | null>,
  updateMasterDeck: (deckId: DeckId | null) => void,
  setDecks: Dispatch<SetStateAction<Record<DeckId, DeckState>>>
): void {
  useEffect(() => {
    let lastUpdate = Number.NEGATIVE_INFINITY

    const tick = (timestamp: number): void => {
      if (timestamp - lastUpdate < TRANSPORT_VIEW_INTERVAL_MS) {
        return
      }

      lastUpdate = timestamp
      const deckAPlaying = engine.deckA.isPlaying
      const deckBPlaying = engine.deckB.isPlaying
      const currentMaster = masterDeckIdRef.current

      if (currentMaster === 'A' && deckAPlaying) {
        updateMasterDeck('A')
      } else if (currentMaster === 'B' && deckBPlaying) {
        updateMasterDeck('B')
      } else if (deckAPlaying) {
        updateMasterDeck('A')
      } else if (deckBPlaying) {
        updateMasterDeck('B')
      } else {
        updateMasterDeck(null)
      }

      setDecks((current) => {
        const deckA: TransportDeckSnapshot = {
          position: engine.deckA.getPosition(),
          isPlaying: engine.deckA.isPlaying,
          effectiveBpm: engine.deckA.getEffectiveBpm(),
          hotCues: engine.deckA.hotCues,
          loop: engine.deckA.loop
        }
        const deckB: TransportDeckSnapshot = {
          position: engine.deckB.getPosition(),
          isPlaying: engine.deckB.isPlaying,
          effectiveBpm: engine.deckB.getEffectiveBpm(),
          hotCues: engine.deckB.hotCues,
          loop: engine.deckB.loop
        }

        if (!hasTransportSnapshotChanged(current.A, deckA) && !hasTransportSnapshotChanged(current.B, deckB)) {
          return current
        }

        return {
          A: {
            ...current.A,
            ...deckA
          },
          B: {
            ...current.B,
            ...deckB
          }
        }
      })
    }

    return subscribeVisualFrame(tick)
  }, [engine, masterDeckIdRef, setDecks, updateMasterDeck])
}
