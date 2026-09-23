/**
 * S1 at a desk: the pairs are what they claim to be, the measured half cannot
 * see the ending, and the verdict catches each shape a leak can take.
 *
 * The half of the test that needs a model — does the GRADER move? — is
 * `npm run grade:invariance`, which spends a few cents. Everything it relies
 * on being true before it spends them is asserted here.
 */

import { describe, expect, it } from 'vitest'
import { composeScorecard } from '../index'
import { computeDeterministicMetrics } from '../metrics'
import { SUB_SCORE_KEYS, type SubScores } from '../types'
import { CALIBRATION_TRANSCRIPTS } from './transcripts'
import { MAX_DRIFT } from './fixtures'
import {
  CUT_SECONDS,
  ENDINGS,
  OUTCOME_BIAS_TOLERANCE,
  OUTCOME_PAIRS,
  OUTCOME_TOLERANCE,
  invarianceReport,
  type GradedVariant,
  type PairOutcome,
} from './outcome-pairs'

describe('the pairs', () => {
  it('cover the collected reps with both kinds of ending', () => {
    expect(OUTCOME_PAIRS.length).toBeGreaterThanOrEqual(CALIBRATION_TRANSCRIPTS.length - 1)
    expect(new Set(OUTCOME_PAIRS.map((pair) => pair.kind))).toEqual(new Set(['offer', 'ask']))
    expect(new Set(OUTCOME_PAIRS.map((pair) => pair.id)).size).toBe(OUTCOME_PAIRS.length)
    // Alternating, so the first few (`--limit`) already test both.
    expect(OUTCOME_PAIRS.slice(0, 2).map((pair) => pair.kind)).toEqual(['offer', 'ask'])
  })

  it('differ in her last line and nothing else', () => {
    for (const pair of OUTCOME_PAIRS) {
      expect(pair.number.length, pair.id).toBe(pair.leaves.length)
      const last = pair.number.length - 1
      for (let index = 0; index < last; index += 1) {
        expect(pair.number[index], `${pair.id} turn ${index}`).toEqual(pair.leaves[index])
      }
      const [yes, no] = [pair.number[last]!, pair.leaves[last]!]
      expect(yes.speaker).toBe('agent')
      expect(no.speaker).toBe('agent')
      expect([yes.t_start, yes.t_end]).toEqual([no.t_start, no.t_end])
      expect(yes.text).not.toBe(no.text)
    }
  })

  it('are cut before the rep’s own ending, so the new one does not argue with it', () => {
    for (const pair of OUTCOME_PAIRS) {
      const kept = pair.number.slice(0, pair.kind === 'ask' ? -2 : -1)
      expect(Math.max(...kept.map((turn) => turn.t_end)), pair.id).toBeLessThanOrEqual(CUT_SECONDS)
    }
  })

  it('give him the same words both times, and a clean ask when he asks', () => {
    for (const pair of OUTCOME_PAIRS.filter((entry) => entry.kind === 'ask')) {
      const his = pair.number[pair.number.length - 2]!
      expect(his).toMatchObject({ speaker: 'user', text: ENDINGS.ask.his })
    }
  })

  it('never have her speak a digit (rule 3)', () => {
    for (const ending of [ENDINGS.offer.number, ENDINGS.offer.leaves, ENDINGS.ask.number, ENDINGS.ask.leaves]) {
      expect(ending).not.toMatch(/\d/)
    }
  })

  it('look identical to the measured sixty percent', () => {
    for (const pair of OUTCOME_PAIRS) {
      expect(computeDeterministicMetrics(pair.number, pair.sessionSeconds), pair.id)
        .toEqual(computeDeterministicMetrics(pair.leaves, pair.sessionSeconds))
    }
  })

  it('compose to the same composite from the same judgement, whatever the grader called the outcome', () => {
    // Rule 2 on the arithmetic side: the recorded outcome is carried and is
    // worth zero, so a receptive ending and a rejecting one with the same six
    // numbers are the same number.
    const judgement = {
      scores: { opening: 70, curiosity: 64, listening: 58, signalReading: 61, composure: 72, close: 55 },
      evidence: {},
      wentWell: 'You kept it light.',
      memoryLine: null,
    }
    for (const pair of OUTCOME_PAIRS) {
      const yes = composeScorecard({ transcript: pair.number, sessionSeconds: pair.sessionSeconds, judgement, outcome: 'receptive', model: 'm' })
      const no = composeScorecard({ transcript: pair.leaves, sessionSeconds: pair.sessionSeconds, judgement, outcome: 'rejecting', model: 'm' })
      expect(yes.composite, pair.id).toBe(no.composite)
      expect(yes.metricScores, pair.id).toEqual(no.metricScores)
    }
  })
})

describe('the verdict', () => {
  const six = (value: number, over: Partial<SubScores> = {}): SubScores => ({
    ...Object.fromEntries(SUB_SCORE_KEYS.map((key) => [key, value])) as unknown as SubScores,
    ...over,
  })
  const variant = (composite: number, scores: SubScores = six(60)): GradedVariant => ({ composite, subScores: scores })
  const outcome = (id: string, number: GradedVariant, leaves: GradedVariant): PairOutcome =>
    ({ id, kind: 'offer', number, leaves })

  it('states a tolerance derived from the calibration noise', () => {
    // Five points of noise on the judged mean, times its 40%, plus a point of
    // rounding. If MAX_DRIFT moves, this moves with it rather than drifting apart.
    expect(MAX_DRIFT).toBe(5)
    expect(OUTCOME_TOLERANCE).toBe(3)
    expect(OUTCOME_BIAS_TOLERANCE).toBe(1.5)
  })

  it('passes identical grades', () => {
    const report = invarianceReport([outcome('a', variant(70), variant(70))])
    expect(report.ok).toBe(true)
    expect(report.pairs[0]?.composite).toBe(0)
  })

  it('passes noise that cancels', () => {
    const report = invarianceReport([
      outcome('a', variant(71, six(62)), variant(69, six(59))),
      outcome('b', variant(68, six(58)), variant(70, six(61))),
      outcome('c', variant(70), variant(70)),
    ])
    expect(report.ok).toBe(true)
    expect(report.meanComposite).toBe(0)
  })

  it('fails a pair whose composite moved with the ending', () => {
    const report = invarianceReport([outcome('a', variant(75, six(72)), variant(70, six(60)))])
    expect(report.ok).toBe(false)
    expect(report.failures[0]).toContain('composite moved +5')
  })

  it('fails a leak on close alone, which the composite barely sees', () => {
    // Fifteen points on one judged dimension is 2.5 on the judged mean and one
    // on the composite — inside the composite gate, and exactly the leak the
    // report suspects.
    const report = invarianceReport([outcome('a', variant(71, six(60, { close: 75 })), variant(70, six(60)))])
    expect(report.pairs[0]?.composite).toBe(1)
    expect(report.pairs[0]?.worst).toEqual({ dimension: 'close', delta: 15 })
    expect(report.ok).toBe(false)
  })

  it('fails a lean that every pair shares, even when each is inside the tolerance', () => {
    const report = invarianceReport([
      outcome('a', variant(72), variant(70)),
      outcome('b', variant(73), variant(71)),
      outcome('c', variant(69), variant(67)),
    ])
    expect(report.pairs.every((pair) => pair.ok)).toBe(true)
    expect(report.ok).toBe(false)
    expect(report.failures.at(-1)).toContain('leaned +2')
  })
})
