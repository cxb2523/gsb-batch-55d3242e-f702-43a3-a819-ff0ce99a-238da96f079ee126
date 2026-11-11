import { describe, expect, it } from 'vitest'
import { LibraryCapacityError, LibraryTransactionQueue, prepareLibraryUpdate } from './libraryTransactions'
import type { LibraryTrack } from './libraryTypes'

const track = (id: string): LibraryTrack => ({
  id,
  title: id,
  duration: 1,
  bpm: 0,
  firstBeatOffset: 0,
  source: 'local'
})

describe('library transactions', () => {
  it('checks unique cumulative capacity before committing', () => {
    expect(prepareLibraryUpdate([track('one')], [track('one'), track('two')], 2).map(({ id }) => id)).toEqual([
      'one',
      'two'
    ])
    expect(() => prepareLibraryUpdate([track('one')], [track('two'), track('three')], 2)).toThrow(
      LibraryCapacityError
    )
  })

  it('serializes commits and keeps the queue usable after a failure', async () => {
    const queue = new LibraryTransactionQueue()
    const events: string[] = []
    let releaseFirst = (): void => undefined
    const first = queue.run(async () => {
      events.push('first:start')
      await new Promise<void>((resolve) => {
        releaseFirst = resolve
      })
      events.push('first:end')
    })
    const second = queue.run(async () => {
      events.push('second')
      throw new Error('failed commit')
    })
    const third = queue.run(async () => {
      events.push('third')
    })

    await Promise.resolve()
    expect(events).toEqual(['first:start'])
    releaseFirst()
    await first
    await expect(second).rejects.toThrow('failed commit')
    await third
    expect(events).toEqual(['first:start', 'first:end', 'second', 'third'])
  })
})
