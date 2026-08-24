/**
 * Deterministic scorecard tests. No network — this is the 60% that must not
 * move when a model updates.
 */

import { describe, expect, it } from 'vitest'
import {
  computeDeterministicMetrics,
  bandScore,
  deterministicScore,
  scoreDeterministic,
  clampSubScores,
  weakestTwo,
  composeScorecard,
} from './index'
import type { DeterministicMetrics, MetricBand } from './metrics'
import type { TranscriptTurn } from '@/lib/voice/types'

function convo(lines: [speaker: 'user' | 'agent', text: string, start: number, end: number][]): TranscriptTurn[] {
  return lines.map(([speaker, text, t_start, t_end]) => ({ speaker, text, t_start, t_end }))
}

const GOOD = convo([
  ['user', 'Sorry, is this place always this quiet?', 0, 3],
  ['agent', 'Pretty much. It is why I come.', 3.5, 6],
  ['user', 'What made you pick that one up?', 7, 10],
  ['agent', 'Read it twice already.', 10.5, 12],
  ['user', 'How did you get into crime writing in the first place?', 13, 17],
  ['agent', 'My sister, mostly.', 17.5, 19],
  ['user', 'Would you want to grab a coffee on Thursday?', 20, 23],
  ['agent', 'Mm. Maybe not.', 23.5, 25],
  ['user', 'Fair enough. Nice to meet you anyway.', 26, 29],
])

describe('deterministic metrics', () => {
  it('measures talk ratio from speaking time, not turn count', () => {
    const metrics = computeDeterministicMetrics(GOOD, 30)
    expect(metrics.talkRatio).not.toBeNull()
    expect(metrics.talkRatio!).toBeGreaterThan(0.5)
    expect(metrics.userTurns).toBe(5)
    expect(metrics.agentTurns).toBe(4)
  })

  it('separates open questions from closed ones', () => {
    const metrics = computeDeterministicMetrics(GOOD, 30)
    expect(metrics.openQuestions).toBe(2) // "What made you", "How did you"
    expect(metrics.closedQuestions).toBe(2) // "is this place always", "Would you want"
    expect(metrics.openClosedRatio).toBe(1)
  })

  it('finds the longest monologue', () => {
    const rambling = convo([
      ['user', 'so basically what happened was a very long story', 0, 30],
      ['agent', 'Right.', 31, 32],
    ])
    expect(computeDeterministicMetrics(rambling, 35).longestMonologue).toBe(30)
  })

  it('measures response latency from her finishing to him starting', () => {
    const metrics = computeDeterministicMetrics(GOOD, 30)
    // 7-6=1, 13-12=1, 20-19=1, 26-25=1
    expect(metrics.meanResponseLatency).toBeCloseTo(1, 5)
  })

  it('ignores a latency that is really a gap in the recording', () => {
    const gappy = convo([
      ['agent', 'Mm.', 0, 1],
      ['user', 'Sorry, I was miles away', 200, 203],
    ])
    expect(computeDeterministicMetrics(gappy, 210).meanResponseLatency).toBeNull()
  })

  it('recognises a specific plan but not a vague one', () => {
    expect(computeDeterministicMetrics(GOOD, 30).specificPlanOffered).toBe(true)
    const vague = convo([['user', 'we should hang out sometime', 0, 3]])
    expect(computeDeterministicMetrics(vague, 5).specificPlanOffered).toBe(false)
  })

  it('grades the ask, and leaves it unmeasured when he did not ask', () => {
    // §07 compares two ASKS — "Coffee Thursday?" beats "we should hang out
    // sometime". It does not compare asking with not asking, and it must not:
    // §16 rule 6 bans pressure closes, so a metric that docked him for reading
    // a closed person correctly would teach the one thing the product refuses.
    expect(computeDeterministicMetrics(GOOD, 30).planQuality).toBe(1)

    const vague = convo([
      ['user', 'This has been nice', 0, 2],
      ['user', 'we should hang out sometime', 3, 6],
    ])
    expect(computeDeterministicMetrics(vague, 8).planQuality).toBe(0.5)

    const neverAsked = convo([
      ['user', 'What are you reading?', 0, 2],
      ['user', 'Nice to meet you', 3, 5],
    ])
    expect(computeDeterministicMetrics(neverAsked, 8).planQuality).toBeNull()
  })

  it('does not read a goodbye as an attempted close', () => {
    // "See you" is how people leave. "See you again" is a proposal. Conflating
    // them would score every polite exit as an ask.
    const goodbye = convo([
      ['user', 'What are you reading?', 0, 2],
      ['user', 'See you', 3, 4],
    ])
    expect(computeDeterministicMetrics(goodbye, 6).planQuality).toBeNull()
  })

  it('grades the exit warm, trailed off, or pushed', () => {
    expect(computeDeterministicMetrics(GOOD, 30).exitQuality).toBe(1)

    const trailed = convo([
      ['user', 'What are you reading?', 0, 2],
      ['agent', 'A novel.', 3, 4],
      ['user', 'Right', 5, 6],
    ])
    expect(computeDeterministicMetrics(trailed, 8).exitQuality).toBe(0.5)

    const pushy = convo([
      ['agent', 'I should get on.', 0, 2],
      ['user', 'Come on, just one drink', 3, 5],
      ['user', 'Nice to meet you', 6, 8],
    ])
    expect(computeDeterministicMetrics(pushy, 10).exitQuality).toBe(0)
  })

  it('never lets the outcome decide which metrics are scored', () => {
    // THE RULE THIS CHANGE COULD HAVE BROKEN (§07). Gating the exit on
    // rejection would score a rejecting rep across seven metrics and a
    // receptive one across six — outcome deciding the composite's composition,
    // which is outcome scoring by the back door. The same conversation, ending
    // both ways, must be marked on the same metrics.
    const shared: [string, string, number, number][] = [
      ['user', 'Sorry, is this place always this quiet?', 0, 3],
      ['agent', 'Pretty much.', 3.5, 6],
      ['user', 'Would you want to grab a coffee on Thursday?', 7, 10],
    ]
    const rejected = convo([
      ...shared,
      ['agent', 'Mm. Maybe not.', 10.5, 12],
      ['user', 'Fair enough. Nice to meet you anyway.', 13, 16],
    ] as never)
    const accepted = convo([
      ...shared,
      ['agent', 'Yeah, go on then.', 10.5, 12],
      ['user', 'Great. Nice to meet you anyway.', 13, 16],
    ] as never)

    const keysOf = (t: typeof rejected) =>
      scoreDeterministic(computeDeterministicMetrics(t, 18))
        .breakdown.filter((entry) => entry.points !== null)
        .map((entry) => entry.key)
        .sort()

    expect(keysOf(rejected)).toEqual(keysOf(accepted))
  })

  it('recognises a clean exit, and refuses one that pushed', () => {
    expect(computeDeterministicMetrics(GOOD, 30).cleanExit).toBe(true)

    const pushy = convo([
      ['agent', 'I should get on.', 0, 2],
      ['user', 'Come on, just one drink', 3, 5],
      ['user', 'Nice to meet you', 6, 8],
    ])
    expect(computeDeterministicMetrics(pushy, 10).cleanExit).toBe(false)
  })

  it('survives an empty transcript without throwing', () => {
    const metrics = computeDeterministicMetrics([], 0)
    expect(metrics.talkRatio).toBeNull()
    expect(metrics.questionsAsked).toBe(0)
    expect(metrics.cleanExit).toBe(false)
    // Nothing to mark, rather than a zero for an ending that never happened.
    expect(metrics.exitQuality).toBeNull()
    expect(metrics.planQuality).toBeNull()
  })
})

describe('band scoring', () => {
  const band = (over: Partial<MetricBand>): MetricBand => ({
    key: 'talkRatio',
    label: 'test',
    tolerance: 1,
    format: String,
    ...over,
  })

  it('gives full marks in the middle of the target band', () => {
    expect(bandScore(0.475, band({ min: 0.4, max: 0.55, tolerance: 0.12 }))).toBe(100)
    expect(bandScore(0, band({ max: 4, tolerance: 4 }))).toBe(100)
    expect(bandScore(10, band({ min: 3, tolerance: 1 }))).toBe(100)
  })

  it('does not give full marks for sitting exactly on the boundary', () => {
    // The band is the lesson (§07): its edge is borderline by definition, and
    // round 9 handed 100 to a talk ratio of exactly 0.55.
    const edge = bandScore(0.55, band({ min: 0.4, max: 0.55, tolerance: 0.12 }))
    expect(edge).toBeLessThan(100)
    expect(edge).toBeGreaterThan(80)
  })

  it('falls off outside it, in both directions', () => {
    const talk = band({ min: 0.4, max: 0.55, tolerance: 0.12 })
    expect(bandScore(0.9, talk)!).toBeLessThan(50)
    expect(bandScore(0.1, talk)!).toBeLessThan(50)
  })

  it('penalises an interrogation, which the old floor-only band did not', () => {
    const questions = band({ key: 'questionsPer3Min', min: 3, max: 8, tolerance: 3 })
    // Round 9's actual value. It used to score 100 against a bare "min: 3".
    expect(bandScore(14.3, questions)).toBe(0)
    expect(bandScore(5.5, questions)).toBe(100)
    // Still penalised for asking too few.
    expect(bandScore(1, questions)!).toBeLessThan(50)
  })

  it('never goes negative', () => {
    expect(bandScore(500, band({ max: 4, tolerance: 4 }))).toBe(0)
    expect(bandScore(0, band({ min: 3, tolerance: 1 }))).toBe(0)
  })

  it('returns null for a metric that could not be measured', () => {
    expect(bandScore(null, band({ max: 4 }))).toBeNull()
  })
})

describe('the round-9 regression', () => {
  /** The three metrics that were outside band while the score came back 96. */
  const ROUND_9: DeterministicMetrics = {
    talkRatio: 0.55,
    questionsAsked: 14,
    questionsPer3Min: 14.3,
    openQuestions: 8,
    closedQuestions: 5.13,
    openClosedRatio: 1.56,
    fillerRate: 1,
    longestMonologue: 8,
    meanResponseLatency: 1.0,
    specificPlanOffered: false,
    planQuality: null,
    cleanExit: true,
    exitQuality: 1,
    userTurns: 14,
    agentTurns: 14,
    sessionSeconds: 176,
  }

  it('no longer scores that session in the nineties', () => {
    const { score } = scoreDeterministic(ROUND_9)
    expect(score).toBeLessThan(80)
    expect(score).toBeGreaterThan(55)
  })

  it('shows its working, per metric', () => {
    const { breakdown } = scoreDeterministic(ROUND_9)
    const byKey = Object.fromEntries(breakdown.map((entry) => [entry.key, entry]))

    expect(byKey['questionsPer3Min']).toMatchObject({
      band: '3.0–8.0',
      value: 14.3,
      points: 0,
      verdict: 'above',
    })
    expect(byKey['openClosedRatio']?.verdict).toBe('below')
    expect(byKey['openClosedRatio']?.points).toBeLessThan(60)
    // Every metric reports a band, a value and points, measured or not.
    for (const entry of breakdown) {
      expect(typeof entry.band).toBe('string')
      expect(entry).toHaveProperty('value')
      expect(entry).toHaveProperty('points')
    }
  })
})

describe('composite', () => {
  const judgement = {
    scores: { opening: 80, curiosity: 70, listening: 60, signalReading: 40, composure: 90, close: 50 },
    evidence: {},
    wentWell: 'He opened without hedging.',
    memoryLine: 'Still looking for the blue one.',
  }

  it('weights deterministic 60 / judgement 40 (§07)', () => {
    const card = composeScorecard({
      transcript: GOOD,
      sessionSeconds: 30,
      judgement,
      outcome: 'rejecting',
      model: 'test',
    })
    const judgementMean = (80 + 70 + 60 + 40 + 90 + 50) / 6
    const expected = Math.round(card.deterministicScore * 0.6 + judgementMean * 0.4)
    expect(card.composite).toBe(expected)
  })

  it('scores the process, never the outcome (§07)', () => {
    // The single most important property. Same transcript, same judgement,
    // opposite result — the composite must not move.
    const rejecting = composeScorecard({
      transcript: GOOD, sessionSeconds: 30, judgement, outcome: 'rejecting', model: 'test',
    })
    const receptive = composeScorecard({
      transcript: GOOD, sessionSeconds: 30, judgement, outcome: 'receptive', model: 'test',
    })
    expect(rejecting.composite).toBe(receptive.composite)
    expect(rejecting.outcome).not.toBe(receptive.outcome)
  })

  it('surfaces the two weakest as the focus for the next rep', () => {
    expect(weakestTwo(judgement.scores)).toEqual(['signalReading', 'close'])
  })

  it('stamps the model so a stored grade stays auditable', () => {
    const card = composeScorecard({
      transcript: GOOD, sessionSeconds: 30, judgement, outcome: 'neutral', model: 'gpt-4.1',
    })
    expect(card.model).toBe('gpt-4.1')
    expect(card.gradedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('always names something that went well', () => {
    const card = composeScorecard({
      transcript: GOOD, sessionSeconds: 30, judgement, outcome: 'rejecting', model: 'test',
    })
    // A user who feels flayed after their third rep never comes back (§07).
    expect(card.wentWell).toBeTruthy()
  })

  it('carries the memory line through without letting it near the score', () => {
    // §08's continuity line rides on the grade because grading is already the
    // one pass over the full transcript. It must cost the composite nothing.
    const withMemory = composeScorecard({
      transcript: GOOD, sessionSeconds: 30, judgement, outcome: 'neutral', model: 'test',
    })
    const without = composeScorecard({
      transcript: GOOD,
      sessionSeconds: 30,
      judgement: { ...judgement, memoryLine: null },
      outcome: 'neutral',
      model: 'test',
    })
    expect(withMemory.memoryLine).toBe('Still looking for the blue one.')
    expect(without.memoryLine).toBeNull()
    expect(withMemory.composite).toBe(without.composite)
  })

  it('rejects a judgement layer missing a sub-score', () => {
    expect(clampSubScores({ opening: 50 })).toBeNull()
    expect(clampSubScores({ ...judgement.scores, close: 'good' })).toBeNull()
    expect(clampSubScores(judgement.scores)).toEqual(judgement.scores)
  })

  it('clamps sub-scores into range', () => {
    expect(clampSubScores({ ...judgement.scores, opening: 900 })?.opening).toBe(100)
    expect(clampSubScores({ ...judgement.scores, opening: -50 })?.opening).toBe(0)
  })

  it('produces a deterministic score that does not depend on a model', () => {
    const a = deterministicScore(computeDeterministicMetrics(GOOD, 30))
    const b = deterministicScore(computeDeterministicMetrics(GOOD, 30))
    expect(a).toBe(b)
    expect(a).toBeGreaterThan(0)
  })
})
