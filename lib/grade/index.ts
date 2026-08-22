/**
 * Composing the scorecard: 60% deterministic, 40% judgement (§07).
 *
 * Pure. The model call happens in the route; this takes its output and the
 * local metrics and produces the stored record.
 */

import {
  bandScore,
  computeDeterministicMetrics,
  type DeterministicMetrics,
} from './metrics'
import {
  DETERMINISTIC_WEIGHT,
  JUDGEMENT_WEIGHT,
  SUB_SCORE_KEYS,
  type JudgementLayer,
  type Scorecard,
  type SubScores,
} from './types'

export * from './types'
export * from './metrics'

/**
 * The §07 target bands, in one place so the scorecard and any future
 * calibration harness read the same numbers.
 */
export function deterministicScore(metrics: DeterministicMetrics): number {
  const parts: (number | null)[] = [
    bandScore(metrics.talkRatio, { min: 0.4, max: 0.55 }),
    bandScore(metrics.questionsPer3Min, { min: 3 }),
    bandScore(metrics.openClosedRatio, { min: 2 }),
    bandScore(metrics.fillerRate, { max: 4 }),
    bandScore(metrics.longestMonologue, { max: 22 }),
    bandScore(metrics.meanResponseLatency, { max: 1.8 }),
  ]
  const scored = parts.filter((part): part is number => part !== null)
  if (scored.length === 0) return 0
  return Math.round(scored.reduce((sum, part) => sum + part, 0) / scored.length)
}

export function clampSubScores(raw: unknown): SubScores | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  const out = {} as SubScores
  for (const key of SUB_SCORE_KEYS) {
    const score = value[key]
    if (typeof score !== 'number' || !Number.isFinite(score)) return null
    out[key] = Math.max(0, Math.min(100, Math.round(score)))
  }
  return out
}

/** The two weakest sub-scores become the focus for the next rep (§07). */
export function weakestTwo(scores: SubScores): (keyof SubScores)[] {
  return [...SUB_SCORE_KEYS]
    .sort((a, b) => scores[a] - scores[b])
    .slice(0, 2)
}

export function composeScorecard(params: {
  transcript: Parameters<typeof computeDeterministicMetrics>[0]
  sessionSeconds: number
  judgement: JudgementLayer
  outcome: Scorecard['outcome']
  model: string
}): Scorecard {
  const metrics = computeDeterministicMetrics(params.transcript, params.sessionSeconds)
  const deterministic = deterministicScore(metrics)

  const judgementMean =
    SUB_SCORE_KEYS.reduce((sum, key) => sum + params.judgement.scores[key], 0) /
    SUB_SCORE_KEYS.length

  return {
    composite: Math.round(
      deterministic * DETERMINISTIC_WEIGHT + judgementMean * JUDGEMENT_WEIGHT,
    ),
    subScores: params.judgement.scores,
    focus: weakestTwo(params.judgement.scores),
    wentWell: params.judgement.wentWell,
    evidence: params.judgement.evidence,
    metrics,
    deterministicScore: deterministic,
    model: params.model,
    gradedAt: new Date().toISOString(),
    outcome: params.outcome,
  }
}
