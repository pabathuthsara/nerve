import { describe, expect, it } from 'vitest'

import { ARM_THRESHOLD, KEEP_THRESHOLD } from './rep-rules'
import { rankFor } from './rank'
import {
  earnedLevels,
  engineRung,
  nextUnlockProgress,
  qualifyingByLevel,
  uiLevel,
  uiWarmth,
  unlockedLevels,
  unlockProgress,
  unlockProgressLabel,
  unlockRequirement,
  FIRST_UNLOCK_REPS,
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

  it('has tier 1 open from the start, and nothing else', () => {
    // Tess, and only Tess. A first session that has to be earned is a first
    // session nobody has — but everything above it is a rung, which is the
    // whole of RETENTION-AUDIT R2: while tier 2 was free the first unlock any
    // account could reach was tier 3, so no new user ever saw one.
    const open = unlockedLevels({})
    expect(open.has(1)).toBe(true)
    expect(open.has(2)).toBe(false)
    expect(open.has(3)).toBe(false)
    expect(open.has(4)).toBe(false)
  })

  it('never shuts a tier somebody has already played', () => {
    // §08: a tier only ever opens. Gating tier 2 is the one change that could
    // reach backwards, so a qualifying rep AT a tier is proof it was open —
    // an account that scored 79 against Nadia while she was free must not find
    // her locked because it never scored 70+ against Tess.
    const open = unlockedLevels(qualifyingByLevel([{ level: 2, composite: 79 }]))
    expect(open.has(2)).toBe(true)
    expect(open.has(1)).toBe(true)
    // And it takes nothing away from the gate: one rep at tier 2 is still not
    // the two that tier 3 costs.
    expect(open.has(3)).toBe(false)
  })

  it('still gates tier 2 for an account with no qualifying reps at all', () => {
    // The rule above must not become a way around R2. A new account has no
    // qualifying reps anywhere, so the gate is exactly as it was authored.
    expect(unlockedLevels({}).has(2)).toBe(false)
    expect(unlockedLevels({ 1: 0, 2: 0 }).has(2)).toBe(false)
  })

  it('never leaves a hole in the ladder', () => {
    // The regression R2 introduced and this closes: the gates name only the
    // tier directly below, so an account with two qualifying reps at tier 2 and
    // none at tier 1 satisfied tier 3 and failed tier 2 — Maya and Robin open
    // with Nadia locked between them. Closed downwards, never upwards: closing
    // upwards would take a character away from somebody who earned her (§08).
    const open = unlockedLevels(qualifyingByLevel([
      { level: 2, composite: 92 },
      { level: 2, composite: 88 },
    ]))
    expect([...open].sort()).toEqual([1, 2, 3])
  })

  it('opens tier 2 on one qualifying rep against Tess', () => {
    // One, not two. The free grant is a single voice rep ever (§14), so a gate
    // costing two graded reps is a gate the account standing at it cannot pay.
    expect(unlockedLevels({ 1: 0 }).has(2)).toBe(false)
    expect(unlockedLevels({ 1: FIRST_UNLOCK_REPS }).has(2)).toBe(true)
  })

  it('mints no rank for the tier it just made earnable', () => {
    // `rankFor` reads tiers CLEARED (`UNLOCK_REPS` of them), never tiers open.
    // Gating tier 2 must not move the rail with it.
    expect(rankFor(qualifyingByLevel([{ level: 1, composite: 92 }]))).toBe('rookie')
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
    // `1 rep`, not `1 reps`. The gate a new account meets first is the one
    // place the ladder is not uniform, and it is also the sentence they read.
    expect(unlockRequirement(2)).toBe(`Score ${UNLOCK_SCORE}+ in 1 rep at Level 1`)
    expect(unlockRequirement(3)).toBe(`Score ${UNLOCK_SCORE}+ in ${UNLOCK_REPS} reps at Level 2`)
    expect(unlockRequirement(4)).toBe(`Score ${UNLOCK_SCORE}+ in ${UNLOCK_REPS} reps at Level 3`)
  })
})

describe('what is open and what was earned are two questions', () => {
  it('only mints a moment for a gate that was actually met', () => {
    // The back-compat rules make `unlockedLevels` generous on purpose, so that
    // gating tier 2 could not shut a character somebody already had. An account
    // grandfathered in that way has not just unlocked anything, and telling it
    // otherwise is the noise the unlock filter existed to avoid.
    const grandfathered = qualifyingByLevel([{ level: 2, composite: 79 }])
    expect(unlockedLevels(grandfathered).has(2)).toBe(true)
    expect(earnedLevels(grandfathered).has(2)).toBe(false)
  })

  it('mints tier 2 for the rep that actually opened it', () => {
    const earned = earnedLevels(qualifyingByLevel([{ level: 1, composite: 92 }]))
    expect([...earned]).toEqual([2])
  })

  it('never mints tier 1, which nobody earns', () => {
    expect(earnedLevels({ 1: 9, 2: 9, 3: 9 }).has(1)).toBe(false)
  })
})

describe('the unlock meter (R8)', () => {
  it('moves because of the rep that just happened', () => {
    // The defect: `unlockRequirement` returns the same sentence before and
    // after the rep that advanced it, so the one screen that could show
    // progress showed a constant.
    const before = unlockProgress(3, { 2: 0 })
    const after = unlockProgress(3, { 2: 1 })
    expect(before).toEqual({ level: 3, fromLevel: 2, have: 0, need: UNLOCK_REPS })
    expect(after).toEqual({ level: 3, fromLevel: 2, have: 1, need: UNLOCK_REPS })
    expect(unlockProgressLabel(after!)).toBe(`1 of ${UNLOCK_REPS} reps at ${UNLOCK_SCORE}+ on Level 02`)
  })

  it('is silent once the tier is open, and for a tier that was never gated', () => {
    expect(unlockProgress(3, { 2: UNLOCK_REPS })).toBeNull()
    expect(unlockProgress(1, {})).toBeNull()
  })

  it('never reads more than the gate costs', () => {
    // Four qualifying reps at a tier is not "4 of 2".
    expect(unlockProgress(3, { 2: 9 })).toBeNull()
    expect(unlockProgress(4, { 3: 1, 2: 9 })).toEqual({ level: 4, fromLevel: 3, have: 1, need: UNLOCK_REPS })
  })

  it('points at the lowest tier still shut', () => {
    // The result screen shows one meter, and the ladder is climbed in order.
    expect(nextUnlockProgress({})).toEqual({ level: 2, fromLevel: 1, have: 0, need: FIRST_UNLOCK_REPS })
    expect(nextUnlockProgress({ 1: 1 })).toEqual({ level: 3, fromLevel: 2, have: 0, need: UNLOCK_REPS })
    expect(nextUnlockProgress({ 1: 1, 2: 2, 3: 2 })).toBeNull()
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
