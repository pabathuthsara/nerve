/**
 * The two field rules that must not drift: who is allowed what, and the fact
 * that today's challenge is today's challenge however many times you look.
 */

import { describe, expect, it } from 'vitest'
import { chooseChallenge, nextTierRequirement, T4_ASK_DAYS, unlockedTier, type AssignableChallenge } from './assignment'

const pool: AssignableChallenge[] = [
  { id: 't1-a', tier: 1 }, { id: 't1-b', tier: 1 }, { id: 't1-c', tier: 1 },
  { id: 't2-a', tier: 2 }, { id: 't2-b', tier: 2 }, { id: 't2-c', tier: 2 },
  { id: 't3-a', tier: 3 }, { id: 't3-b', tier: 3 },
  { id: 't4-a', tier: 4 }, { id: 't4-b', tier: 4 },
]

describe('the tier gate (§09)', () => {
  it('opens tier 2 on the second rung and tier 3 on the top one', () => {
    // Re-anchored when the roster went to three rungs — 1, 2 and 4. The old
    // thresholds (4, 6, 7) read an eight-rung ladder and would now gate two of
    // the four field tiers behind a sim level nobody can reach.
    expect(unlockedTier(1)).toBe(1)
    expect(unlockedTier(2)).toBe(2)
    expect(unlockedTier(3)).toBe(2)
    expect(unlockedTier(4)).toBe(3)
  })

  it('never opens the romantic tier from the sim ladder alone', () => {
    // T4 asks a real person for a name or a number. No amount of being good at
    // talking to a synthetic character earns that — only having gone outside
    // and asked does.
    for (const rung of [1, 2, 3, 4, 5, 6, 7, 8]) {
      expect(unlockedTier(rung)).toBeLessThan(4)
      expect(unlockedTier(rung, { tier3AskDays: 0 })).toBeLessThan(4)
    }
  })

  it('opens tier 4 on field days, and needs the top rung too', () => {
    const earned = { tier3AskDays: T4_ASK_DAYS }
    expect(unlockedTier(4, earned)).toBe(4)
    expect(unlockedTier(4, { tier3AskDays: T4_ASK_DAYS - 1 })).toBe(3)

    // The gym rung is still necessary, just no longer sufficient. Somebody who
    // has done the field work but never cleared the ladder is not handed T4 as
    // a consolation.
    expect(unlockedTier(1, earned)).toBe(1)
    expect(unlockedTier(2, earned)).toBe(2)
  })

  it('fails shut when the field history is unknown', () => {
    // Every caller that cannot see the log gates T4 closed rather than open.
    // For an exposure ladder that is the only safe direction to be wrong in:
    // too little exposure is a slow week, too much is somebody quitting.
    expect(unlockedTier(4)).toBe(3)
    expect(unlockedTier(8)).toBe(3)
  })

  it('never hands a beginner the romantic tier', () => {
    // The whole point of graded exposure. Level 1 is in-app only.
    const chosen = chooseChallenge({ challenges: pool, tier: unlockedTier(1), recentIds: [], seed: 'u:2026-08-23' })
    expect(chosen?.tier).toBe(1)
  })

  it('says what the next tier costs, and stops where the gym stops', () => {
    expect(nextTierRequirement(1)).toContain('Level 2')
    expect(nextTierRequirement(2)).toContain('Level 4')
    // T3 is the last one the gym opens, so there is no requirement to state.
    // Naming one for T4 would be a promise the product cannot keep.
    expect(nextTierRequirement(3)).toContain(String(T4_ASK_DAYS))
    expect(nextTierRequirement(4)).toBeNull()
  })
})

describe('the pick', () => {
  const base = { challenges: pool, tier: 2 as const, recentIds: [], seed: 'user-1:2026-08-23' }

  it('gives the same answer every time it is asked', () => {
    const first = chooseChallenge(base)
    for (let attempt = 0; attempt < 25; attempt += 1) {
      expect(chooseChallenge(base)?.id).toBe(first?.id)
    }
  })

  it('gives different people different challenges on the same day', () => {
    const ids = new Set(
      ['a', 'b', 'c', 'd', 'e', 'f'].map((user) => chooseChallenge({ ...base, seed: `${user}:2026-08-23` })?.id),
    )
    expect(ids.size).toBeGreaterThan(1)
  })

  it('moves on the next day', () => {
    const monday = chooseChallenge({ ...base, seed: 'user-1:2026-08-24' })?.id
    const tuesday = chooseChallenge({ ...base, seed: 'user-1:2026-08-25' })?.id
    const wednesday = chooseChallenge({ ...base, seed: 'user-1:2026-08-26' })?.id
    expect(new Set([monday, tuesday, wednesday]).size).toBeGreaterThan(1)
  })

  it('prefers the top unlocked tier — that is where the training is', () => {
    expect(chooseChallenge(base)?.tier).toBe(2)
  })

  it('drops a tier only when everything fresh up there is used up', () => {
    const chosen = chooseChallenge({ ...base, recentIds: ['t2-a', 't2-b', 't2-c'] })
    expect(chosen?.tier).toBe(1)
  })

  it('does not repeat anything from the last thirty days', () => {
    const chosen = chooseChallenge({ ...base, recentIds: ['t2-a', 't2-b'] })
    expect(chosen?.id).toBe('t2-c')
  })

  it('goes round again rather than refusing when everything is recent', () => {
    const everything = pool.map((challenge) => challenge.id)
    expect(chooseChallenge({ ...base, recentIds: everything })).not.toBeNull()
  })

  it('walks the pool on a swap instead of rerolling it', () => {
    const seen = new Set<string | undefined>()
    for (let attempt = 0; attempt < 3; attempt += 1) {
      seen.add(chooseChallenge({ ...base, attempt })?.id)
    }
    expect(seen.size).toBe(3)
  })

  it('returns null when there is nothing to give', () => {
    expect(chooseChallenge({ ...base, challenges: [] })).toBeNull()
  })
})
