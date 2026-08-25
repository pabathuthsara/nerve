import { describe, expect, it } from 'vitest'
import { FOCUS_PLANS, focusPlan, personaRankFor, type FocusArea } from './focus'
import { TECHNIQUES } from '@/lib/techniques/library'
import { FIELD_CHALLENGES } from '@/lib/field/challenges'
import { PERSONAS } from '@/lib/personas'

const FOCUSES = Object.keys(FOCUS_PLANS) as FocusArea[]

/**
 * The point of these is that the plan names real content. A focus that points
 * at a slug nobody authored is worse than a focus that points at nothing: the
 * assigner silently falls back and the answer looks ignored again.
 */
describe('FOCUS_PLANS', () => {
  it('names a library card that exists, for every answer', () => {
    for (const focus of FOCUSES) {
      const plan = FOCUS_PLANS[focus]
      expect(TECHNIQUES.some((card) => card.slug === plan.cardSlug), focus).toBe(true)
    }
  })

  it('names a card that actually targets the sub-score it claims', () => {
    for (const focus of FOCUSES) {
      const plan = FOCUS_PLANS[focus]
      const card = TECHNIQUES.find((entry) => entry.slug === plan.cardSlug)
      expect(card?.targets, focus).toContain(plan.subScore)
    }
  })

  it('names a field challenge that exists and is tier 1', () => {
    for (const focus of FOCUSES) {
      const plan = FOCUS_PLANS[focus]
      const challenge = FIELD_CHALLENGES.find((entry) => entry.slug === plan.challengeSlug)
      expect(challenge, focus).toBeTruthy()
      // A preference for a locked challenge is a preference the assigner has
      // to ignore, and a new account is gated to tier 1.
      expect(challenge?.tier, focus).toBe(1)
    }
  })

  it('names only characters who are actually on the roster', () => {
    for (const focus of FOCUSES) {
      for (const slug of FOCUS_PLANS[focus].personaSlugs) {
        expect(Object.keys(PERSONAS), `${focus}/${slug}`).toContain(slug)
      }
    }
  })

  it('gives every answer a different opening card — otherwise nothing changed', () => {
    const cards = FOCUSES.map((focus) => FOCUS_PLANS[focus].cardSlug)
    expect(new Set(cards).size).toBe(cards.length)
  })

  it('gives every answer a different first challenge', () => {
    const challenges = FOCUSES.map((focus) => FOCUS_PLANS[focus].challengeSlug)
    expect(new Set(challenges).size).toBe(challenges.length)
  })
})

describe('focusPlan', () => {
  it('is null when nobody answered', () => {
    expect(focusPlan(null)).toBeNull()
    expect(focusPlan(undefined)).toBeNull()
  })
})

describe('personaRankFor', () => {
  it('orders the preferred character first', () => {
    expect(personaRankFor('sustaining', 'maya')).toBeLessThan(personaRankFor('sustaining', 'nadia'))
  })

  it('sorts an unlisted character last rather than excluding them', () => {
    const plan = FOCUS_PLANS.opening
    expect(personaRankFor('opening', 'nobody')).toBe(plan.personaSlugs.length)
  })

  it('is flat with no answer, so the rotation decides on its own', () => {
    expect(personaRankFor(null, 'nadia')).toBe(0)
    expect(personaRankFor(null, 'robin')).toBe(0)
  })
})
