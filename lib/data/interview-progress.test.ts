import { describe, expect, it } from 'vitest'
import {
  DIMENSION_COLUMN,
  INTERVIEW_DIMENSIONS,
  TREND_MINIMUM,
  interviewProgress,
  progressReading,
  type InterviewRep,
} from './interview-progress'
import { UNLOCK_REPS, qualifyingByLevel } from './progression'
import { rankFor } from './rank'

const rep = (over: Partial<InterviewRep> & Pick<InterviewRep, 'sessionId' | 'startedAt'>): InterviewRep => ({
  round: 'technical',
  composite: 70,
  dimensions: {},
  ...over,
})

describe('interviewProgress', () => {
  it('is empty and unreadable with nothing in it', () => {
    const progress = interviewProgress([])
    expect(progress).toMatchObject({ attempts: 0, best: null, latest: null, readable: false })
    expect(progress.moved).toBeNull()
    expect(progressReading(progress)).toBeNull()
  })

  it('ignores an ungraded rep entirely', () => {
    const progress = interviewProgress([rep({ sessionId: 'a', startedAt: '2026-09-01T09:00:00Z', composite: null })])
    expect(progress.attempts).toBe(0)
  })

  it('refuses to call one score a trend', () => {
    const progress = interviewProgress([
      rep({ sessionId: 'a', startedAt: '2026-09-01T09:00:00Z', composite: 61, dimensions: { structure: 50 } }),
    ])
    expect(progress.attempts).toBe(1)
    expect(progress.best).toBe(61)
    expect(progress.readable).toBe(false)
    expect(progress.dimensions.find((row) => row.dimension === 'structure')?.delta).toBeNull()
    expect(TREND_MINIMUM).toBe(2)
  })

  it('sorts by time rather than trusting the order it was handed', () => {
    const progress = interviewProgress([
      rep({ sessionId: 'b', startedAt: '2026-09-04T09:00:00Z', composite: 78, dimensions: { structure: 80 } }),
      rep({ sessionId: 'a', startedAt: '2026-09-01T09:00:00Z', composite: 61, dimensions: { structure: 50 } }),
    ])
    expect(progress.latest).toBe(78)
    const structure = progress.dimensions.find((row) => row.dimension === 'structure')!
    expect(structure).toMatchObject({ first: 50, latest: 80, best: 80, delta: 30 })
  })

  it('keeps a best per round rather than one number for the whole run', () => {
    const progress = interviewProgress([
      rep({ sessionId: 'a', startedAt: '2026-09-01T09:00:00Z', round: 'recruiter', composite: 80 }),
      rep({ sessionId: 'b', startedAt: '2026-09-02T09:00:00Z', round: 'technical', composite: 55 }),
      rep({ sessionId: 'c', startedAt: '2026-09-03T09:00:00Z', round: 'technical', composite: 64 }),
    ])
    expect(progress.rounds).toEqual([
      { round: 'recruiter', label: 'Recruiter screen', attempts: 1, best: 80, latest: 80 },
      { round: 'technical', label: 'Technical', attempts: 2, best: 64, latest: 64 },
    ])
    expect(progress.best).toBe(80)
  })

  it('names both what moved and what did not', () => {
    const progress = interviewProgress([
      rep({
        sessionId: 'a',
        startedAt: '2026-09-01T09:00:00Z',
        composite: 60,
        dimensions: { structure: 40, specificity: 70, listening: 60 },
      }),
      rep({
        sessionId: 'b',
        startedAt: '2026-09-05T09:00:00Z',
        composite: 72,
        dimensions: { structure: 75, specificity: 66, listening: 62 },
      }),
    ])
    expect(progress.moved?.dimension).toBe('structure')
    expect(progress.lagging?.dimension).toBe('specificity')
    expect(progressReading(progress)).toBe('Structure is up across this run. Specifics has not moved.')
  })

  it('says so plainly when nothing has moved', () => {
    const progress = interviewProgress([
      rep({ sessionId: 'a', startedAt: '2026-09-01T09:00:00Z', composite: 60, dimensions: { structure: 60, close: 55 } }),
      rep({ sessionId: 'b', startedAt: '2026-09-05T09:00:00Z', composite: 58, dimensions: { structure: 58, close: 50 } }),
    ])
    expect(progressReading(progress)).toContain('Nothing has moved yet')
  })

  /** §07, and it matters more here than anywhere else in the product. */
  it('never mentions an outcome, a callback or a job', () => {
    const progress = interviewProgress([
      rep({ sessionId: 'a', startedAt: '2026-09-01T09:00:00Z', composite: 40, dimensions: { structure: 40 } }),
      rep({ sessionId: 'b', startedAt: '2026-09-05T09:00:00Z', composite: 95, dimensions: { structure: 95 } }),
    ])
    const line = (progressReading(progress) ?? '').toLowerCase()
    for (const banned of ['callback', 'job', 'offer', 'hired', 'pass', 'fail']) {
      expect(line).not.toContain(banned)
    }
  })

  it('maps all six dimensions onto columns that exist, with no duplicates', () => {
    const columns = INTERVIEW_DIMENSIONS.map((dimension) => DIMENSION_COLUMN[dimension])
    expect(columns).toEqual(['opening', 'curiosity', 'listening', 'composure', 'signal_reading', 'close'])
    expect(new Set(columns).size).toBe(columns.length)
  })
})

/**
 * §8's proof, as an assertion rather than an argument.
 *
 * The filter lives in the query (`syncLevel`, `fetchPersonas`, `fetchRepRecords`,
 * `recentScoresAtLevel`), so what can be tested here is the thing the filter is
 * protecting: that the dating arithmetic, fed a mixed history, produces
 * different answers depending on whether the interview reps were excluded. If
 * this test ever goes green with the interview reps included, the filter has
 * stopped mattering and something has gone very wrong.
 */
describe('a mixed-track history', () => {
  const datingReps = [
    { level: 1 as const, composite: 82 },
    { level: 1 as const, composite: 74 },
  ]
  // The landmine: an interviewer seeded at engine level 2 is UI tier 1's
  // neighbour, and a 90 against them looks exactly like a qualifying dating rep.
  const interviewReps = [
    { level: 2 as const, composite: 90 },
    { level: 2 as const, composite: 91 },
  ]

  it('opens a dating tier when the interview reps are counted, and not when they are filtered', () => {
    const filtered = qualifyingByLevel(datingReps)
    const unfiltered = qualifyingByLevel([...datingReps, ...interviewReps])

    expect(filtered[2] ?? 0).toBe(0)
    expect(unfiltered[2] ?? 0).toBe(UNLOCK_REPS)
    // And the rank rail moves with it, which is the half nobody would notice.
    expect(rankFor(filtered)).not.toBe(rankFor(unfiltered))
  })
})
