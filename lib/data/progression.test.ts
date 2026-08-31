import { describe, expect, it } from 'vitest'

import { ARM_THRESHOLD, KEEP_THRESHOLD } from './rep-rules'
import {
  engineRung,
  qualifyingByLevel,
  uiLevel,
  uiWarmth,
  unlockedLevels,
  unlockRequirement,
  UNLOCK_REPS,
  UNLOCK_SCORE,
  wonFromOutcome,
  wonFromRep,
} from './progression'

describe('wonFromRep', () => {
  it('refuses the rep that shipped this bug, grade and all', () => {
    // THE REGRESSION, with the numbers off the real session. A Priya rep whose
    // meter peaked at 60.16 and finished at 59.91: never armed, and the user
    // was correctly shown "She left". The grader then called the conversation
    // "receptive" — fairly, it was pleasant — and `wonFromRep` short-circuited
    // on that outcome before looking at the meter at all, rewriting the session
    // as a win. The stored record disagreed with the screen the user had just
    // been shown, and the invented win counted toward the next unlock.
    //
    // The outcome is passed deliberately. Without it this case passes against
    // the broken version too, which makes it worthless as a guard: the meter
    // alone always said no, and the whole bug was that the meter was skipped.
    // Assigned first so excess-property checking does not reject what is now an
    // unknown key — the point is that an outcome is *ignored*, not rejected.
    const real = { finalWarmth: 59.91, peakWarmth: 60.16, outcome: 'receptive' }
    expect(wonFromRep(real)).toBe(false)
  })

  it('lets no grade take a real win away either', () => {
    // The mirror. She gave the number, the user watched it arrive, and a
    // grader calling the exchange "rejecting" afterwards does not undo it.
    const harshlyGraded = { finalWarmth: 80, peakWarmth: 90, outcome: 'rejecting' }
    expect(wonFromRep(harshlyGraded)).toBe(true)
  })

  it('is armed AND still willing, which is the format rule', () => {
    // Armed and holding.
    expect(wonFromRep({ finalWarmth: KEEP_THRESHOLD, peakWarmth: ARM_THRESHOLD })).toBe(true)
    // Touched 80 and slid to 60: still a win. Using final alone would lose it.
    expect(wonFromRep({ finalWarmth: 60, peakWarmth: 80 })).toBe(true)
    // Armed, then collapsed past the keep line. Hysteresis has a floor.
    expect(wonFromRep({ finalWarmth: KEEP_THRESHOLD - 0.1, peakWarmth: 90 })).toBe(false)
    // Never armed, however warm it ended. Never armed means never.
    expect(wonFromRep({ finalWarmth: ARM_THRESHOLD - 0.1, peakWarmth: ARM_THRESHOLD - 0.1 })).toBe(false)
  })

  it('falls back to final warmth when no peak was recorded', () => {
    expect(wonFromRep({ finalWarmth: 70, peakWarmth: null })).toBe(true)
    expect(wonFromRep({ finalWarmth: 40, peakWarmth: null })).toBe(false)
    expect(wonFromRep({ finalWarmth: null })).toBe(false)
  })
})

describe('wonFromOutcome', () => {
  it('is the last resort for a row with nothing else, and nothing more', () => {
    // It still exists for sessions written before `won` and the warmth columns
    // did. Every caller has to try `row.won` first — `fetchPersonas` did not,
    // which is how the roster's locked state came to be decided by the grade.
    expect(wonFromOutcome('receptive')).toBe(true)
    expect(wonFromOutcome('neutral')).toBe(false)
    expect(wonFromOutcome('rejecting')).toBe(false)
    expect(wonFromOutcome(null)).toBe(false)
  })

  it('is overridden by a stored win in either direction', () => {
    // The shape every caller now uses: `row.won ?? wonFromOutcome(row.outcome)`.
    const resolve = (won: boolean | null, outcome: string | null) => won ?? wonFromOutcome(outcome)
    expect(resolve(false, 'receptive')).toBe(false)
    expect(resolve(true, 'rejecting')).toBe(true)
    expect(resolve(null, 'receptive')).toBe(true)
  })
})

describe('unlocks are counted from scores, not wins', () => {
  it('counts a rep only when it cleared the bar', () => {
    // §08: two sessions scoring 70+ at a level opens the one above it. The gate
    // used to count wins — whether she gave her number — which §07 is careful
    // to make never the thing that counts, and which the grader could invent.
    const counts = qualifyingByLevel([
      { level: 1, composite: UNLOCK_SCORE },
      { level: 1, composite: UNLOCK_SCORE - 1 },
      { level: 1, composite: 92 },
      { level: 2, composite: 71 },
      // Ungraded. An ungraded rep has demonstrated nothing yet.
      { level: 2, composite: null },
    ])
    expect(counts).toEqual({ 1: 2, 2: 1 })
  })

  it('opens tier 3 on two qualifying reps at tier 2 and not before', () => {
    expect(unlockedLevels({ 2: 1 }).has(3)).toBe(false)
    expect(unlockedLevels({ 2: 2 }).has(3)).toBe(true)
  })

  it('opens tier 4 on two qualifying reps at tier 3 and not before', () => {
    // Robin's gate, unchanged by the renumber: it was two qualifying reps
    // against Maya when Maya was tier 2, and it is two qualifying reps against
    // Maya now that she is tier 3.
    expect(unlockedLevels({ 3: 1 }).has(4)).toBe(false)
    expect(unlockedLevels({ 3: 2 }).has(4)).toBe(true)
  })

  it('is the top tier at 4, and nothing above it opens', () => {
    // The roster ships four characters, so tier 4 is the end of the ladder.
    // Qualifying reps at the top open nothing, rather than opening a tier with
    // nobody standing on it.
    const everything = unlockedLevels({ 1: 9, 2: 9, 3: 9, 4: 9 })
    expect([...everything].sort()).toEqual([1, 2, 3, 4])
  })

  it('has tiers 1 and 2 open from the start', () => {
    // Tess and Nadia. A first session that has to be earned is a first session
    // nobody has, and the two free tiers are the two receptive ones.
    const open = unlockedLevels({})
    expect(open.has(1)).toBe(true)
    expect(open.has(2)).toBe(true)
    expect(open.has(3)).toBe(false)
    expect(open.has(4)).toBe(false)
  })

  it('advances a clean rep that ended in rejection', () => {
    // The property this whole change exists for (§07). Two reps that scored 92
    // and 88 and produced no number at all open the next tier.
    const counts = qualifyingByLevel([
      { level: 2, composite: 92 },
      { level: 2, composite: 88 },
    ])
    expect(unlockedLevels(counts).has(3)).toBe(true)
  })

  it('says what a tier costs in the same words everywhere', () => {
    expect(unlockRequirement(1)).toBeNull()
    expect(unlockRequirement(2)).toBeNull()
    expect(unlockRequirement(3)).toBe(`Score ${UNLOCK_SCORE}+ in ${UNLOCK_REPS} reps at Level 2`)
    expect(unlockRequirement(4)).toBe(`Score ${UNLOCK_SCORE}+ in ${UNLOCK_REPS} reps at Level 3`)
  })
})

describe('presentation', () => {
  it('gives each shipped rung its own visible tier', () => {
    // The roster holds engine rungs 1 to 4 and the map is the identity across
    // them. It was `ceil(level / 2)` while eight rungs shared four tiers, which
    // put Nadia and Maya in one tier and left the top empty.
    expect(uiLevel(1)).toBe(1)
    expect(uiLevel(2)).toBe(2)
    expect(uiLevel(3)).toBe(3)
    expect(uiLevel(4)).toBe(4)
  })

  it('round-trips a stored ladder position through both directions', () => {
    // `syncLevel` writes `profiles.current_level` through `engineRung` and every
    // read takes it back through `uiLevel`. If the two stop being inverses, a
    // user's position lands on a tier they never earned.
    for (const tier of [1, 2, 3, 4] as const) {
      expect(uiLevel(engineRung(tier))).toBe(tier)
    }
  })

  it('still places a rung nobody holds, so old sessions render', () => {
    // A session row from before the roster changed names the rung it was run
    // at. Refusing to map it would blank a history row the user can still open.
    expect([5, 6, 7, 8].map(uiLevel)).toEqual([4, 4, 4, 4])
    expect(uiLevel(0)).toBe(1)
    expect(uiLevel(99)).toBe(4)
  })

  it('clamps warmth for display without rescaling it', () => {
    // 60 on the meter and 60 in the engine have to be the same 60, or the
    // threshold on the ring stops meaning anything.
    expect(uiWarmth(59.91)).toBe(60)
    expect(uiWarmth(-20)).toBe(0)
    expect(uiWarmth(null)).toBe(0)
  })
})
