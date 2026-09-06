import { describe, expect, it } from 'vitest'
import { bedFor } from './room-tone'
import { SCENES, roomAcousticsEnabled } from './scenes'
import { PERSONAS, RETIRED_PERSONAS } from '@/lib/personas'
import { roomName, sceneId } from '@/lib/voice/types'
import { compileInstructions } from '@/lib/voice/openai/persona'

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
    for (const id of Object.keys(SCENES)) {
      expect(bedFor(id)!.masterDb, id).toBeLessThan(-20)
    }
  })
})

describe('every character stands in her own room', () => {
  // Nine authored personas and two authored scenes: `sceneId` returns
  // `bed ?? reverbIr`, so seven of them fell through to somebody else's room.
  // Erin stood on a train platform listening to glasses being set down, and —
  // worse, because it reaches the contract rather than the speakers — Maya and
  // Robin were told in their Absolute rules to react "the way a stranger in a
  // bookshop would" from a coffee shop and a hotel lobby. That is
  // PERSONA-AUDIT §3.6, fixed for Tess alone and left running on two live rungs.

  const EVERYONE = [...Object.values(PERSONAS), ...Object.values(RETIRED_PERSONAS)]

  it('authors a bed for every room on the roster', () => {
    for (const persona of EVERYONE) {
      expect(bedFor(sceneId(persona.room)), persona.slug).not.toBeNull()
    }
  })

  it('gives no two characters in different places the same room', () => {
    // The test that would have caught this. A shared scene is legitimate —
    // two characters can stand in one bar — but only when they are authored
    // into the same place.
    const byScene = new Map<string, string[]>()
    for (const persona of EVERYONE) {
      const id = sceneId(persona.room)
      byScene.set(id, [...(byScene.get(id) ?? []), persona.scene])
    }
    for (const [id, scenes] of byScene) {
      const rooms = new Set(scenes.map((scene) => scene.split(/[,.]/)[0]?.trim()))
      expect(rooms.size, `${id}: ${[...rooms].join(' / ')}`).toBe(1)
    }
  })

  it('says the room she is standing in, in the rules that say what is inviolable', () => {
    for (const persona of EVERYONE) {
      const room = roomName(persona.room)
      expect(compileInstructions(persona)).toContain(`a stranger in a ${room} would react`)
      // And it reads as English. "in a train platform" does not.
      expect(room, persona.slug).not.toMatch(/-/)
    }
  })

  it('never lets the persona trim and the scene disagree about the same room', () => {
    // `applyRoomConfig` hands the persona's interval to the convolver path;
    // `RoomTone` reads the scene's. Two numbers for one rhythm is how one of
    // them goes quietly unused.
    for (const persona of EVERYONE) {
      const bed = bedFor(sceneId(persona.room))!
      expect(bed.oneShotIntervalSeconds.map((s) => s * 1000), persona.slug)
        .toEqual(persona.room.oneShotIntervalMs)
    }
  })
})
