import { describe, expect, it } from 'vitest'

import {
  baselineVerdict,
  compareToBaseline,
  daysSinceBaseline,
  findRetest,
  retestDue,
  RETEST_AFTER_DAYS,
  type BaselineRep,
} from './baseline'

const ZONE = 'Asia/Colombo'

const BASELINE: BaselineRep = {
  sessionId: 'base',
  personaId: 'nadia',
  score: 54,
  takenAt: '2026-08-01T04:00:00.000Z',
}

/** `days` after the baseline, at the same time of day. */
function later(days: number): Date {
  return new Date(Date.parse(BASELINE.takenAt) + days * 86_400_000)
}

describe('the week-four offer', () => {
  it('counts days in the user\'s own timezone', () => {
    expect(daysSinceBaseline(BASELINE.takenAt, later(0), ZONE)).toBe(0)
    expect(daysSinceBaseline(BASELINE.takenAt, later(28), ZONE)).toBe(28)
  })

  it('appears on day 28 and not before', () => {
    const due = (days: number) =>
      retestDue({ baseline: BASELINE, retest: null, now: later(days), timezone: ZONE })
    expect(due(RETEST_AFTER_DAYS - 1)).toBe(false)
    expect(due(RETEST_AFTER_DAYS)).toBe(true)
    // It does not expire. Missing day 28 must not forfeit the comparison.
    expect(due(RETEST_AFTER_DAYS + 40)).toBe(true)
  })

  it('is silent for an account with no baseline yet', () => {
    expect(retestDue({ baseline: null, retest: null, now: later(90), timezone: ZONE })).toBe(false)
  })

  it('stops offering once the re-test has been taken', () => {
    const retest = { id: 'again', personaId: 'nadia', startedAt: later(30).toISOString(), compositeScore: 71 }
    expect(retestDue({ baseline: BASELINE, retest, now: later(31), timezone: ZONE })).toBe(false)
  })
})

describe('which rep is the re-test', () => {
  const rep = (id: string, days: number, composite: number | null, personaId = 'nadia') => ({
    id, personaId, startedAt: later(days).toISOString(), compositeScore: composite,
  })

  it('is the first qualifying attempt, never the best one', () => {
    // A re-test you can re-roll until the number flatters you is not a
    // measurement (§07).
    const found = findRetest({
      baseline: BASELINE,
      sessions: [rep('c', 40, 95), rep('a', 29, 61), rep('b', 33, 80)],
      timezone: ZONE,
    })
    expect(found?.id).toBe('a')
    expect(found?.compositeScore).toBe(61)
  })

  it('ignores reps before day 28, against another character, or ungraded', () => {
    expect(findRetest({ baseline: BASELINE, sessions: [rep('early', 27, 88)], timezone: ZONE })).toBeNull()
    expect(findRetest({ baseline: BASELINE, sessions: [rep('other', 30, 88, 'priya')], timezone: ZONE })).toBeNull()
    expect(findRetest({ baseline: BASELINE, sessions: [rep('ungraded', 30, null)], timezone: ZONE })).toBeNull()
  })

  it('never counts the baseline as its own re-test', () => {
    const self = { id: 'base', personaId: 'nadia', startedAt: later(30).toISOString(), compositeScore: 54 }
    expect(findRetest({ baseline: BASELINE, sessions: [self], timezone: ZONE })).toBeNull()
  })
})

describe('the comparison', () => {
  const then = [
    { key: 'opening', label: 'Opening', value: 50 },
    { key: 'curiosity', label: 'Curiosity', value: 40 },
  ]

  it('matches sub-scores by key, not by position', () => {
    // Reordering the six must never compare curiosity against composure.
    const comparison = compareToBaseline({
      thenScore: 54,
      nowScore: 71,
      thenSubScores: then,
      nowSubScores: [
        { key: 'curiosity', label: 'Curiosity', value: 72 },
        { key: 'opening', label: 'Opening', value: 68 },
      ],
      daysApart: 28,
    })
    expect(comparison.subScores).toEqual([
      { key: 'opening', label: 'Opening', then: 50, now: 68 },
      { key: 'curiosity', label: 'Curiosity', then: 40, now: 72 },
    ])
    expect(comparison.delta).toBe(17)
  })

  it('drops a sub-score present in only one of the two', () => {
    // A half-filled row reads as a collapse to zero, which is a lie.
    const comparison = compareToBaseline({
      thenScore: 54, nowScore: 60, thenSubScores: then,
      nowSubScores: [{ key: 'opening', label: 'Opening', value: 61 }],
      daysApart: 28,
    })
    expect(comparison.subScores.map((entry) => entry.key)).toEqual(['opening'])
  })
})

describe('the verdict', () => {
  const at = (thenScore: number, nowScore: number) => baselineVerdict({
    thenScore, nowScore, delta: nowScore - thenScore, subScores: [], daysApart: 28,
  })

  it('says it plainly when the number went down', () => {
    // The case it would be tempting not to write. A measurement that only has
    // copy for the flattering direction is one nobody should believe.
    const worse = at(71, 58)
    expect(worse).toContain('Down')
    expect(worse).toContain('58')
  })

  it('does not call a flat result an improvement', () => {
    expect(at(64, 64)).toContain('Flat')
  })

  it('carries both real numbers in every case', () => {
    for (const [before, after] of [[54, 82], [54, 62], [54, 56], [54, 54], [54, 40]] as const) {
      const line = at(before, after)
      expect(line, `${before}->${after}`).toContain(String(before))
      expect(line, `${before}->${after}`).toContain(String(after))
    }
  })
})
