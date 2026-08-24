import { describe, expect, it } from 'vitest'
import { UNLOCK_REPS, UNLOCK_SCORE, qualifyingByLevel } from './progression'
import { RANKS, nextRankRequirement, rankFor, rankIndex } from './rank'

describe('ranks (§08)', () => {
  it('starts everybody at rookie', () => {
    expect(rankFor({})).toBe('rookie')
  })

  it('advances only on demonstrated skill, never on reps served', () => {
    // §08's rule, and the same one the unlocks use: grinding advances nobody.
    // Asserted through `qualifyingByLevel` rather than against `rankFor`'s
    // input directly, because that function is where "qualifying" is decided —
    // testing the rank in isolation would prove nothing about the rule.
    const forty = Array.from({ length: 40 }, () => ({ level: 1 as const, composite: 60 }))
    expect(rankFor(qualifyingByLevel(forty))).toBe('rookie')

    const two = [
      { level: 1 as const, composite: UNLOCK_SCORE },
      { level: 1 as const, composite: UNLOCK_SCORE + 12 },
    ]
    expect(rankFor(qualifyingByLevel(two))).toBe('regular')
  })

  it('walks the rail one CLEARED tier at a time', () => {
    // Tiers 1 and 2 are open from the start, so a rank keyed on what is
    // unlocked would hand a brand-new account a rank it had not earned.
    expect(rankFor({ 1: UNLOCK_REPS })).toBe('regular')
    expect(rankFor({ 1: UNLOCK_REPS, 2: UNLOCK_REPS })).toBe('contender')
  })

  it('earns the last rank by clearing the top tier, not by opening one above', () => {
    // The reason this rank exists at all. There is no tier above the top one,
    // so Closer is the only thing left to be good at — two reps at 70+ against
    // the character who gives nothing away.
    const contender = { 1: UNLOCK_REPS, 2: UNLOCK_REPS, 3: UNLOCK_REPS - 1 }
    expect(rankFor(contender)).toBe('contender')
    expect(rankFor({ ...contender, 3: UNLOCK_REPS })).toBe('closer')
  })

  it('never skips a rank, whatever order the reps arrive in', () => {
    // Somebody who cleared the top tier has necessarily cleared the ones below
    // to reach it, so an out-of-order history should still read monotonically.
    let previous = -1
    const ladder: Record<number, number>[] = [
      {},
      { 1: UNLOCK_REPS },
      { 1: UNLOCK_REPS, 2: UNLOCK_REPS },
      { 1: UNLOCK_REPS, 2: UNLOCK_REPS, 3: UNLOCK_REPS },
    ]
    for (const counts of ladder) {
      const index = rankIndex(rankFor(counts))
      expect(index).toBeGreaterThan(previous)
      previous = index
    }
  })

  it('says what the next one costs, and stops at the top', () => {
    expect(nextRankRequirement('rookie')).toContain('Level 1')
    expect(nextRankRequirement('regular')).toContain('Level 2')
    expect(nextRankRequirement('contender')).toContain('Level 3')
    expect(nextRankRequirement('closer')).toBeNull()
  })

  it('keeps §08\'s four names', () => {
    expect(RANKS).toEqual(['rookie', 'regular', 'contender', 'closer'])
  })
})
