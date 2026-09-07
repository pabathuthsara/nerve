/**
 * The interview band table, and the thing it exists to stop.
 *
 * Sixty percent of the composite is the deterministic half, and until this
 * table existed an interview was scored against bands written about a
 * three-minute conversation with a stranger in a shop. Four of the eight scored
 * correct interview behaviour at or near zero. These tests are that claim,
 * measured, plus the guard that the dating table did not move to accommodate
 * any of it.
 */

import { describe, expect, it } from 'vitest'
import { INTERVIEW_METRIC_BANDS } from './metrics'
import { METRIC_BANDS, bandScore, scoreMetrics, type DeterministicMetrics } from '../metrics'
import { rubricForTrack } from '../track'

/** A rep a candidate did WELL: they held the floor, answered at length, asked back. */
const GOOD_CANDIDATE: DeterministicMetrics = {
  talkRatio: 0.68,
  questionsAsked: 2,
  questionsPer3Min: 0.4,
  openQuestions: 2,
  closedQuestions: 0,
  openClosedRatio: null,
  fillerRate: 2.1,
  longestMonologue: 58,
  meanResponseLatency: 2.2,
  specificPlanOffered: false,
  planQuality: null,
  cleanExit: false,
  exitQuality: 0.5,
  userTurns: 18,
  agentTurns: 18,
  sessionSeconds: 1_180,
}

const scored = (metrics: DeterministicMetrics, bands: readonly typeof METRIC_BANDS[number][]) =>
  Object.fromEntries(scoreMetrics(metrics, bands).map((row) => [row.key, row]))

describe('the defect this table exists for', () => {
  /**
   * `INTERVIEW-TECHNICAL-PLAN.md` §11, measured rather than asserted. A
   * candidate talking 68% of the time is a candidate doing it right — she asks
   * a two-sentence question and is quiet — and the dating band targets 40–55%.
   */
  it('scores a good candidate at zero on the dating talk-ratio band', () => {
    expect(scored(GOOD_CANDIDATE, METRIC_BANDS).talkRatio?.points).toBe(0)
    expect(scored(GOOD_CANDIDATE, INTERVIEW_METRIC_BANDS).talkRatio?.points).toBeGreaterThan(90)
  })

  it('scores the same candidate at zero on the dating question bands', () => {
    // Two questions in a twenty-minute interview is the close, done correctly.
    // The dating band wants three to eight per THREE MINUTES.
    // Not literally zero — 0.4 questions per three minutes lands 12 out of 100
    // on a band that wants three. The point is that it is a near-zero for
    // behaviour that is correct.
    expect(scored(GOOD_CANDIDATE, METRIC_BANDS).questionsPer3Min?.points).toBeLessThan(20)
    expect(scored(GOOD_CANDIDATE, INTERVIEW_METRIC_BANDS).questionsAsked?.points).toBe(100)
  })

  it('scores a real answer as a monologue on the dating band', () => {
    // A 58-second answer to "walk me through something you built" is a good
    // answer. The dating band's ceiling is 22 seconds.
    expect(scored(GOOD_CANDIDATE, METRIC_BANDS).longestMonologue?.points).toBe(0)
    expect(scored(GOOD_CANDIDATE, INTERVIEW_METRIC_BANDS).longestMonologue?.points).toBeGreaterThan(80)
  })

  it('adds up to a deterministic half that is wrong by more than half', () => {
    const dating = scoreMetrics(GOOD_CANDIDATE, METRIC_BANDS)
      .map((row) => row.points).filter((points): points is number => points !== null)
    const interview = scoreMetrics(GOOD_CANDIDATE, INTERVIEW_METRIC_BANDS)
      .map((row) => row.points).filter((points): points is number => points !== null)
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
    expect(mean(dating)).toBeLessThan(40)
    expect(mean(interview)).toBeGreaterThan(85)
  })
})

describe('the interview bands', () => {
  it('drops the two metrics no interview can produce', () => {
    const keys = INTERVIEW_METRIC_BANDS.map((band) => band.key)
    // `planQuality` is "Coffee Thursday?" and `exitQuality` is "warm, no push".
    // Both come back null on every interview, and a permanently blank row reads
    // as a measurement that failed rather than one that does not apply.
    expect(keys).not.toContain('planQuality')
    expect(keys).not.toContain('exitQuality')
    expect(keys).toEqual([
      'talkRatio', 'longestMonologue', 'fillerRate', 'meanResponseLatency', 'questionsAsked',
    ])
  })

  it('fails a candidate who said almost nothing', () => {
    const passive = { ...GOOD_CANDIDATE, talkRatio: 0.3, longestMonologue: 9 }
    const rows = scored(passive, INTERVIEW_METRIC_BANDS)
    expect(rows.talkRatio?.verdict).toBe('below')
    // The floor is the point: under-answering is the common interview mistake
    // and the dating table, which has no minimum here, cannot see it at all.
    expect(rows.longestMonologue?.verdict).toBe('below')
    expect(rows.longestMonologue?.points).toBeLessThan(50)
  })

  it('fails a candidate who never let her speak', () => {
    const rows = scored({ ...GOOD_CANDIDATE, talkRatio: 0.94, longestMonologue: 210 }, INTERVIEW_METRIC_BANDS)
    expect(rows.talkRatio?.verdict).toBe('above')
    expect(rows.longestMonologue?.verdict).toBe('above')
  })

  it('gives no marks for asking nothing back, and full marks for asking twice', () => {
    const band = INTERVIEW_METRIC_BANDS.find((entry) => entry.key === 'questionsAsked')!
    expect(bandScore(0, band)).toBe(0)
    expect(bandScore(1, band)).toBe(88)
    expect(bandScore(2, band)).toBe(100)
  })

  it('lets a candidate take a beat before a hard answer', () => {
    const band = INTERVIEW_METRIC_BANDS.find((entry) => entry.key === 'meanResponseLatency')!
    const dating = METRIC_BANDS.find((entry) => entry.key === 'meanResponseLatency')!
    // 2.4s is "considered" in an interview and "effort" on a date, and the
    // rubric explicitly says asking for a moment to think is composure.
    expect(bandScore(2.4, band)).toBeGreaterThan(80)
    expect(bandScore(2.4, dating)).toBeLessThan(60)
  })
})

describe('the seam', () => {
  it('hands each track its own table and its own measured block', () => {
    expect(rubricForTrack('dating').metricBands).toBe(METRIC_BANDS)
    expect(rubricForTrack('interview').metricBands).toBe(INTERVIEW_METRIC_BANDS)
  })

  it('never tells an interview grader a dating target', () => {
    const block = rubricForTrack('interview').renderMetrics(GOOD_CANDIDATE)
    expect(block).not.toContain('40-55%')
    expect(block).not.toContain('< 22')
    expect(block).not.toContain('< 1.8')
    // Two dating booleans that no interview can produce.
    expect(block).not.toContain('specific plan offered')
    expect(block).not.toContain('clean exit')
    expect(block).toContain('target 55-78%')
  })

  /**
   * Rule 19. `scoreMetrics` with no band table is the dating table, and every
   * existing caller reaches the numbers it always reached — the whole reason
   * the argument is optional rather than required.
   */
  it('leaves the dating arm on the table it has always used', () => {
    expect(scoreMetrics(GOOD_CANDIDATE)).toEqual(scoreMetrics(GOOD_CANDIDATE, METRIC_BANDS))
    expect(rubricForTrack('dating').renderMetrics(GOOD_CANDIDATE)).toContain('target 40-55%')
  })
})
