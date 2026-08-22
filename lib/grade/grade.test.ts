/**
 * Deterministic scorecard tests. No network — this is the 60% that must not
 * move when a model updates.
 */

import { describe, expect, it } from 'vitest'
import {
  computeDeterministicMetrics,
  bandScore,
  deterministicScore,
  clampSubScores,
  weakestTwo,
  composeScorecard,
} from './index'
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
  })
})

describe('band scoring', () => {
  it('gives full marks inside the target band', () => {
    expect(bandScore(0.45, { min: 0.4, max: 0.55 })).toBe(100)
    expect(bandScore(3.5, { max: 4 })).toBe(100)
    expect(bandScore(4, { min: 3 })).toBe(100)
  })

  it('falls off outside it, in both directions', () => {
    // Dominating and disappearing both fail; the band is the lesson (§07).
    expect(bandScore(0.9, { min: 0.4, max: 0.55 })!).toBeLessThan(100)
    expect(bandScore(0.1, { min: 0.4, max: 0.55 })!).toBeLessThan(100)
  })

  it('never goes negative', () => {
    expect(bandScore(500, { max: 4 })).toBe(0)
    expect(bandScore(0, { min: 3 })).toBe(0)
  })

  it('returns null for a metric that could not be measured', () => {
    expect(bandScore(null, { max: 4 })).toBeNull()
  })
})

describe('composite', () => {
  const judgement = {
    scores: { opening: 80, curiosity: 70, listening: 60, signalReading: 40, composure: 90, close: 50 },
    evidence: {},
    wentWell: 'He opened without hedging.',
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
