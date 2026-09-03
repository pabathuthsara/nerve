/**
 * The mapping is the thing that rots, so the mapping is the thing under test.
 *
 * Every one of these walks a real union or a real authored array — the rank
 * list, the sub-score labels the grader returns, the milestone table, the plan
 * record — rather than a copy of it written out here. A rank renamed, a
 * seventh dimension added or a fifth milestone appended turns this suite red
 * before it turns a screen blank, which is the whole point: a missing mark
 * renders as nothing, and nothing is invisible in review.
 */

import { describe, expect, it } from 'vitest'
import { RANKS } from '@/lib/data/rank'
import { SUB_SCORE_LABELS } from '@/lib/data/scorecard'
import { REJECTION_MILESTONES } from '@/lib/field/milestones'
import { PUBLIC_PLANS } from '@/lib/site/plans'
import { FOCUS_PLANS } from '@/lib/data/focus'
import {
  dimensionMark,
  fieldTierMark,
  focusMark,
  libraryKindMark,
  milestoneMark,
  planMark,
  rankMark,
  tierMark,
  type MarkName,
} from './registry'

/** Every name the drawing switch has to handle. Kept in step by the tests. */
const ALL: MarkName[] = [
  'rank-1', 'rank-2', 'rank-3', 'rank-4',
  'dim-opening', 'dim-curiosity', 'dim-listening', 'dim-signal', 'dim-composure', 'dim-close',
  'tier-1', 'tier-2', 'tier-3', 'tier-4',
  'field-1', 'field-2', 'field-3', 'field-4',
  'kind-technique', 'kind-opener', 'kind-ladder', 'kind-recovery', 'kind-exit',
  'milestone-1', 'milestone-2', 'milestone-3', 'milestone-4',
  'plan-free', 'plan-pro', 'plan-elite',
  'state-roster', 'state-field', 'state-chart', 'state-library',
  'state-session', 'state-transcript', 'state-filter', 'state-letter',
  'bound-script', 'bound-companion', 'bound-clinical', 'bound-adult',
]

describe('every family resolves for every real member', () => {
  it('gives each shipped rank its own mark', () => {
    const marks = RANKS.map(rankMark)
    expect(marks).toHaveLength(RANKS.length)
    expect(new Set(marks).size).toBe(RANKS.length)
    for (const mark of marks) expect(ALL).toContain(mark)
  })

  it('gives each sub-score the grader returns its own mark', () => {
    const keys = Object.keys(SUB_SCORE_LABELS)
    const marks = keys.map(dimensionMark)
    // No nulls: a dimension with no mark is a scorecard row with a hole in it.
    expect(marks.every((mark) => mark !== null)).toBe(true)
    expect(new Set(marks).size).toBe(keys.length)
  })

  it('gives each milestone its own mark, in order', () => {
    const marks = REJECTION_MILESTONES.map((milestone) => milestoneMark(milestone.at))
    expect(new Set(marks).size).toBe(REJECTION_MILESTONES.length)
    for (const mark of marks) expect(ALL).toContain(mark)
  })

  it('gives each published plan its own mark', () => {
    const marks = PUBLIC_PLANS.map((plan) => planMark(plan.id))
    expect(new Set(marks).size).toBe(PUBLIC_PLANS.length)
  })

  it('gives each onboarding focus answer a dimension mark', () => {
    for (const area of Object.keys(FOCUS_PLANS)) expect(focusMark(area)).not.toBeNull()
    expect(focusMark(null)).toBeNull()
    expect(focusMark('not-a-focus')).toBeNull()
  })

  it('covers every library kind', () => {
    const kinds = ['technique', 'opener', 'ladder', 'recovery', 'exit'] as const
    const marks = kinds.map(libraryKindMark)
    expect(new Set(marks).size).toBe(kinds.length)
  })
})

describe('tiers clamp rather than vanish', () => {
  // A session row from before the roster was renumbered still names a rung of
  // 5 or higher, and it still has to draw something (`progression.ts`).
  it('clamps a retired rung to the top tier', () => {
    expect(tierMark(7)).toBe('tier-4')
    expect(fieldTierMark(9)).toBe('field-4')
  })

  it('clamps below the bottom rather than returning nothing', () => {
    expect(tierMark(0)).toBe('tier-1')
    expect(fieldTierMark(-2)).toBe('field-1')
  })

  it('draws the count it names, for every shipped tier', () => {
    expect([1, 2, 3, 4].map(tierMark)).toEqual(['tier-1', 'tier-2', 'tier-3', 'tier-4'])
    expect([1, 2, 3, 4].map(fieldTierMark)).toEqual(['field-1', 'field-2', 'field-3', 'field-4'])
  })
})

describe('an unknown member is a bug, not a hole', () => {
  it('falls back to the first rank rather than drawing nothing', () => {
    // @ts-expect-error deliberately outside the union
    expect(rankMark('not-a-rank')).toBe('rank-1')
  })

  it('falls back to the first milestone ring', () => {
    expect(milestoneMark(7)).toBe('milestone-1')
  })
})
