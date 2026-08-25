import { describe, expect, it } from 'vitest'
import { TEXT_WARMTH_CEILING, textWarmth } from './warmth'
import { ARM_THRESHOLD } from '@/lib/data/rep-rules'
import { PERSONAS } from '@/lib/personas'

const ROSTER = Object.values(PERSONAS)

describe('textWarmth', () => {
  it('opens where the character opens', () => {
    for (const persona of ROSTER) {
      expect(textWarmth(persona, 0), persona.slug).toBe(Math.round(persona.trajectory.start))
    }
  })

  it('rises as the conversation continues', () => {
    for (const persona of ROSTER) {
      expect(textWarmth(persona, 5), persona.slug).toBeGreaterThan(textWarmth(persona, 0))
    }
  })

  /**
   * The load-bearing one. Text mode must never arm the number: the offer is the
   * voice rep's payoff, and a payoff reachable in a mode with no meter, no
   * clock and no quota is a payoff worth nothing.
   */
  it('never reaches the arm threshold, however long the thread runs', () => {
    for (const persona of ROSTER) {
      for (const turns of [0, 1, 10, 100, 10_000]) {
        expect(textWarmth(persona, turns), `${persona.slug}@${turns}`).toBeLessThan(ARM_THRESHOLD)
        expect(textWarmth(persona, turns), `${persona.slug}@${turns}`).toBeLessThanOrEqual(TEXT_WARMTH_CEILING)
      }
    }
  })

  it('keeps a character below her own session ceiling as well', () => {
    for (const persona of ROSTER) {
      expect(textWarmth(persona, 10_000), persona.slug)
        .toBeLessThanOrEqual(persona.trajectory.sessionCeiling)
    }
  })

  it('never goes negative on a nonsense turn count', () => {
    const [first] = ROSTER
    if (!first) throw new Error('The roster is empty.')
    expect(textWarmth(first, -50)).toBe(Math.round(first.trajectory.start))
  })

  it('is deterministic — the same thread reopened finds her in the same mood', () => {
    const [first] = ROSTER
    if (!first) throw new Error('The roster is empty.')
    expect(textWarmth(first, 7)).toBe(textWarmth(first, 7))
  })

  it('leaves real daylight under the arm line, not one point', () => {
    expect(ARM_THRESHOLD - TEXT_WARMTH_CEILING).toBeGreaterThanOrEqual(5)
  })
})
