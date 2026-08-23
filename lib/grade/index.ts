/**
 * Composing the scorecard: 60% deterministic, 40% judgement (§07).
 *
 * Pure. The model call happens in the route; this takes its output and the
 * local metrics and produces the stored record.
 */

import {
  computeDeterministicMetrics,
  scoreMetrics,
  type DeterministicMetrics,
  type MetricScore,
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
 * The deterministic 60%, and the working behind it.
 *
 * Returns the per-metric breakdown as well as the mean, because a composite
 * nobody can take apart is worse than a lower one anybody can. Round 9 returned
 * 96 for a session with three metrics outside band and there was no way to see
 * which line was lying.
 */
export function scoreDeterministic(metrics: DeterministicMetrics): {
  score: number
  breakdown: MetricScore[]
} {
  const breakdown = scoreMetrics(metrics)
  const scored = breakdown
    .map((entry) => entry.points)
    .filter((points): points is number => points !== null)
  return {
    score: scored.length === 0
      ? 0
      : Math.round(scored.reduce((sum, points) => sum + points, 0) / scored.length),
    breakdown,
  }
}

export function deterministicScore(metrics: DeterministicMetrics): number {
  return scoreDeterministic(metrics).score
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
  const { score: deterministic, breakdown } = scoreDeterministic(metrics)

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
    metricScores: breakdown,
    model: params.model,
    gradedAt: new Date().toISOString(),
    outcome: params.outcome,
  }
}
