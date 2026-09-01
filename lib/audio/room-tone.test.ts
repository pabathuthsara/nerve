import { describe, expect, it } from 'vitest'
import { bedFor } from './room-tone'
import { roomAcousticsEnabled } from './scenes'

describe('room tone is independent of the convolver', () => {
  it('answers with a bed while procedural acoustics are switched off', () => {
    // The point of the whole file. `sceneForRoom` returns null right now
    // because convolution hurt intelligibility (docs/AUDIO.md), and that took
    // the ambient bed down with it even though AUDIO.md's own graph shows two
    // independent chains. `bedFor` answers the other question.
    expect(roomAcousticsEnabled()).toBe(false)
    expect(bedFor('bookshop')).not.toBeNull()
  })

  it('reuses the authored bed rather than a second copy of the numbers', () => {
    // Rule 8: content is authored in the repo and reviewed in a pull request.
    // A new scene has to stay a config row in `scenes.ts`.
    const bed = bedFor('bookshop')
    expect(bed?.masterDb).toBe(-40)
    expect(bed?.layers.map((layer) => layer.kind)).toEqual(['hvac-hum', 'traffic-through-glass'])
    expect(bed?.oneShotIntervalSeconds).toEqual([20, 40])
  })

  it('carries the second scene too, so the schema still generalises', () => {
    const bar = bedFor('bar')
    expect(bar).not.toBeNull()
    // Louder than the bookshop, which is the whole reason it exists as a foil.
    expect(bar!.masterDb).toBeGreaterThan(bedFor('bookshop')!.masterDb)
  })

  it('is null for a scene nobody authored', () => {
    expect(bedFor('nowhere')).toBeNull()
  })

  it('keeps every bed well below a speaking voice', () => {
    // A bed that competes with her is the intelligibility bug wearing a
    // different hat. -20 dBFS is already generous as a ceiling for a room.
    for (const id of ['bookshop', 'bar']) {
      expect(bedFor(id)!.masterDb, id).toBeLessThan(-20)
    }
  })
})
