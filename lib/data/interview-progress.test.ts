import { describe, expect, it } from 'vitest'
import {
  ACCURACY_EMPTY,
  DIMENSION_COLUMN,
  INTERVIEW_DIMENSIONS,
  TREND_MINIMUM,
  accuracyReading,
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


/**
 * Technical accuracy across the run.
 *
 * It has been a scored column since 7 September and reached exactly one screen
 * — the standout card on a single interview's scorecard. Nothing aggregated it,
 * because `INTERVIEW_DIMENSIONS` is six and `/progress` filters to the dating
 * track, so the one question this track is uniquely able to answer could only
 * be answered one scorecard at a time.
 *
 * The assertions below are all about the same discipline: it is a claim about
 * what somebody KNOWS, so nothing here may invent a data point.
 */
describe('technical accuracy across the run', () => {
  const at = (day: number) => `2026-09-${String(day).padStart(2, '0')}T09:00:00Z`

  it('is null when nothing has produced a reading', () => {
    // The common case, and not a failure: a screener, a recruiter screen and a
    // final round have `probeShare: 0` and never test fundamentals.
    const progress = interviewProgress([
      rep({ sessionId: 'a', startedAt: at(1), round: 'screener' }),
      rep({ sessionId: 'b', startedAt: at(2), round: 'recruiter' }),
    ])
    expect(progress.accuracy).toBeNull()
    expect(accuracyReading(progress.accuracy)).toBeNull()
    expect(ACCURACY_EMPTY).toContain('technical')
  })

  it('reads only the rounds that actually returned one', () => {
    /**
     * The property that matters most. A round that did not probe did not score
     * nought on fundamentals — it did not ask about them. Zero-filling would
     * put a 0 on the chart, and carrying the last value forward would claim a
     * measurement nobody took.
     */
    const progress = interviewProgress([
      rep({ sessionId: 'a', startedAt: at(1), round: 'technical', technicalAccuracy: 60 }),
      rep({ sessionId: 'b', startedAt: at(2), round: 'screener', technicalAccuracy: null }),
      rep({ sessionId: 'c', startedAt: at(3), round: 'technical', technicalAccuracy: 74 }),
    ])
    expect(progress.accuracy).toEqual({ attempts: 2, first: 60, latest: 74, best: 74, delta: 14 })
    // Three interviews in the run, two readings. The panel says both, because
    // a trend off two points needs its own denominator stated.
    expect(progress.attempts).toBe(3)
    expect(accuracyReading(progress.accuracy)).toContain('2 rounds')
  })

  it('holds no delta off a single reading', () => {
    // Same rule as `TREND_MINIMUM` on the other six: one number is a baseline,
    // and calling it a direction is a lie about what it means.
    const progress = interviewProgress([
      rep({ sessionId: 'a', startedAt: at(1), technicalAccuracy: 55 }),
    ])
    expect(progress.accuracy?.delta).toBeNull()
    expect(accuracyReading(progress.accuracy)).toContain('One reading')
  })

  it('reads in the order the interviews happened, not the order they arrived', () => {
    const progress = interviewProgress([
      rep({ sessionId: 'c', startedAt: at(3), technicalAccuracy: 80 }),
      rep({ sessionId: 'a', startedAt: at(1), technicalAccuracy: 50 }),
    ])
    expect(progress.accuracy).toMatchObject({ first: 50, latest: 80, delta: 30 })
  })

  it('says so when it went down', () => {
    // A harder round after an easier one legitimately lowers it, and a panel
    // that only ever reports improvement is a panel nobody believes.
    const progress = interviewProgress([
      rep({ sessionId: 'a', startedAt: at(1), technicalAccuracy: 78 }),
      rep({ sessionId: 'b', startedAt: at(2), technicalAccuracy: 61 }),
    ])
    expect(accuracyReading(progress.accuracy)).toContain('Down 17')
  })

  it('ignores an ungraded rep, whatever it carries', () => {
    const progress = interviewProgress([
      rep({ sessionId: 'a', startedAt: at(1), composite: null, technicalAccuracy: 90 }),
    ])
    expect(progress.accuracy).toBeNull()
  })

  it('never becomes a seventh behavioural dimension', () => {
    /**
     * The mapping `rubric.test.ts` walks pairs every `InterviewDimension` with
     * a grade key AND a `scores` column. Technical accuracy has a column and no
     * grade key — the judge returns it separately — so adding it to the list
     * would break that pairing, and averaging "was it true" into "what moved
     * most" would put two different kinds of claim on one scale.
     */
    expect(INTERVIEW_DIMENSIONS).not.toContain('technicalAccuracy')
    expect(Object.values(DIMENSION_COLUMN)).not.toContain('technical_accuracy')
    const progress = interviewProgress([
      rep({ sessionId: 'a', startedAt: at(1), technicalAccuracy: 20 }),
      rep({ sessionId: 'b', startedAt: at(2), technicalAccuracy: 90 }),
    ])
    // A seventy-point jump in accuracy must not be what `moved` reports.
    expect(progress.moved?.dimension as string | undefined).not.toBe('technicalAccuracy')
  })
})
