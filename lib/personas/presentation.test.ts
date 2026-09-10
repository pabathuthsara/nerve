/**
 * The public half of a character, tied to the engine half.
 *
 * `PRESENTATION` is what a roster card, the landing page and a
 * merchant-of-record reviewer read, and it is seeded into `personas` by
 * `npm run db:seed`. Everything here is hand-authored (§02), which is exactly
 * why it can drift from the character it describes.
 */

import { describe, expect, it } from 'vitest'

import { PERSONAS, RETIRED_PERSONAS } from './index'
import { PRESENTATION } from './presentation'

const EVERYONE = [...Object.values(PERSONAS), ...Object.values(RETIRED_PERSONAS)]

describe('the public half', () => {
  it('calls her what the engine calls her', () => {
    // MEASURED, 10 September. Rung 1 was renamed from Tess to Cass — the
    // persona, the contract, the database and the roster card all moved, and
    // the landing page kept its own hardcoded copy of the old name and carried
    // on introducing her by it.
    //
    // A display name written in two places is a display name that will be
    // wrong in one of them, on the surface §14 has a compliance reviewer
    // reading.
    for (const persona of EVERYONE) {
      expect(PRESENTATION[persona.slug]?.name, persona.slug).toBe(persona.name)
    }
  })

  it('describes the room she is actually standing in', () => {
    // The same failure one field along: `settingShort` said "Launderette" for
    // days after she had moved into a gallery, because the copy and the room
    // are authored in different files.
    for (const persona of EVERYONE) {
      const card = PRESENTATION[persona.slug]
      expect(card, persona.slug).toBeDefined()
      const place = persona.room.place ?? ''
      if (!place) continue
      // A shared significant word, not a substring. Erin's room is a "train
      // station" and her card says "Train platform" — the same place described
      // twice, which is a wording question and not a wrong room. "Gallery"
      // against "launderette" shares nothing, which is the failure this is for.
      const words = (text: string) =>
        new Set(text.toLowerCase().match(/[a-z]{3,}/g) ?? [])
      const said = words(`${card!.setting} ${card!.settingShort}`)
      const room = [...words(place)]
      expect(
        room.some((word) => said.has(word)),
        `${persona.slug} card says "${card!.settingShort}", room is "${place}"`,
      ).toBe(true)
    }
  })

  it('covers every character, so a new one cannot ship without a card', () => {
    for (const persona of EVERYONE) {
      const card = PRESENTATION[persona.slug]!
      expect(card.hook.length, persona.slug).toBeGreaterThan(20)
      expect(card.blurb.length, persona.slug).toBeGreaterThan(40)
      expect(card.respondsTo.length, persona.slug).toBeGreaterThan(0)
      expect(card.shutsDownOn.length, persona.slug).toBeGreaterThan(0)
    }
  })

  it('never calls a dating character a flirt, on the half a reviewer reads', () => {
    // §14: every merchant-of-record provider on the shortlist bans dating
    // products by name, and a reviewer who signs up meets rung 1 first.
    // `gated.flirtiness` is a dial; the word is not public copy.
    for (const persona of EVERYONE) {
      const card = PRESENTATION[persona.slug]!
      const text = [card.setting, card.hook, card.blurb, ...card.respondsTo, ...card.shutsDownOn]
        .join(' ')
        .toLowerCase()
      expect(text, persona.slug).not.toMatch(/\bflirt|\bseduc|\bpick[- ]?up\b|\bdating\b/)
    }
  })
})
