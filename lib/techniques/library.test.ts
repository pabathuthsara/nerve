import { describe, expect, it } from 'vitest'
import { TECHNIQUES, techniqueForSubScore, type SubScore } from './library'

const SUB_SCORES: SubScore[] = [
  'opening', 'curiosity', 'listening', 'signalReading', 'composure', 'close',
]

describe('the library (§10 D)', () => {
  it('has a technique for every sub-score', () => {
    // §07 promises the scorecard links its two weakest sub-scores to "the
    // matching technique". That sentence is only keepable while this holds, so
    // it is asserted rather than assumed — adding a seventh sub-score without a
    // card would silently produce a focus with nowhere to go.
    for (const sub of SUB_SCORES) {
      expect(techniqueForSubScore(sub), sub).not.toBeNull()
    }
  })

  it('returns nothing for something that is not a sub-score', () => {
    expect(techniqueForSubScore('charisma')).toBeNull()
  })

  it('never points a sub-score at an opener or an exit card', () => {
    // Openers and exits also carry targets, so the lookup has to filter on
    // kind. A user told their curiosity is weak wants the technique, not a
    // list of things to say walking up.
    for (const sub of SUB_SCORES) {
      expect(techniqueForSubScore(sub)?.kind).toBe('technique')
    }
  })

  it('gives every card a slug, a summary and at least one example', () => {
    for (const card of TECHNIQUES) {
      expect(card.slug, card.title).toMatch(/^[a-z0-9-]+$/)
      expect(card.summary.length, card.title).toBeGreaterThan(0)
      expect(card.examples.length, card.title).toBeGreaterThan(0)
    }
  })

  it('has unique slugs — they are the route', () => {
    const slugs = TECHNIQUES.map((card) => card.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })
})
