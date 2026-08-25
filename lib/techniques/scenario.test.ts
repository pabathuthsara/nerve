import { describe, expect, it } from 'vitest'
import { personaForCard } from './scenario'
import { TECHNIQUES } from './library'
import { PERSONAS } from '@/lib/personas'

const ROSTER = Object.keys(PERSONAS)

describe('personaForCard', () => {
  it('sends a card to the room it names, when that room has a character', () => {
    expect(personaForCard({ targets: ['opening'], setting: 'cafe' }, ROSTER)).toBe('maya')
  })

  it('falls to the skill when the room has nobody on the roster', () => {
    // There is no gym character shipped, so the opening preference decides.
    expect(personaForCard({ targets: ['opening'], setting: 'gym' }, ROSTER)).toBe('nadia')
  })

  it('sends the reading-and-leaving cards to the character who trains them', () => {
    expect(personaForCard({ targets: ['signalReading'] }, ROSTER)).toBe('robin')
    expect(personaForCard({ targets: ['close'] }, ROSTER)).toBe('robin')
  })

  it('never points at a character the account cannot reach', () => {
    // A brand-new account has Nadia and nobody else.
    expect(personaForCard({ targets: ['close'] }, ['nadia'])).toBe('nadia')
    expect(personaForCard({ targets: ['opening'], setting: 'cafe' }, ['nadia'])).toBe('nadia')
  })

  it('draws nothing when the roster has not arrived', () => {
    expect(personaForCard({ targets: ['opening'] }, [])).toBeNull()
  })

  it('resolves every authored card, on a new account and on a full roster', () => {
    for (const card of TECHNIQUES) {
      expect(personaForCard(card, ROSTER), card.slug).not.toBeNull()
      expect(personaForCard(card, ['nadia']), card.slug).toBe('nadia')
    }
  })

  it('only ever names characters who are on the shipped roster', () => {
    for (const card of TECHNIQUES) {
      expect(ROSTER, card.slug).toContain(personaForCard(card, ROSTER))
    }
  })
})
