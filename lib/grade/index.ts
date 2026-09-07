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
  type MetricBand,
  type MetricScore,
} from './metrics'
import {
  DETERMINISTIC_WEIGHT,
  JUDGEMENT_WEIGHT,
  SUB_SCORE_KEYS,
  type AccuracyLayer,
  type JudgementLayer,
  type Scorecard,
  type SubScores,
} from './types'

export * from './types'
export * from './metrics'
export * from './memory'

/**
 * The deterministic 60%, and the working behind it.
 *
 * Returns the per-metric breakdown as well as the mean, because a composite
 * nobody can take apart is worse than a lower one anybody can. Round 9 returned
 * 96 for a session with three metrics outside band and there was no way to see
 * which line was lying.
 */
export function scoreDeterministic(
  metrics: DeterministicMetrics,
  /** The band table. Omitted is the dating table, unchanged (§07). */
  bands?: readonly MetricBand[],
): {
  score: number
  breakdown: MetricScore[]
} {
  const breakdown = bands ? scoreMetrics(metrics, bands) : scoreMetrics(metrics)
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

export function deterministicScore(
  metrics: DeterministicMetrics,
  bands?: readonly MetricBand[],
): number {
  return scoreDeterministic(metrics, bands).score
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

/**
 * The judgement mean — six dimensions, or seven (INTERVIEW-TECHNICAL-PLAN §8.4).
 *
 * **This is the one place this plan touches shared judgement, and it branches
 * rather than edits.** No accuracy layer, or one that abstained on everything,
 * and the arithmetic is byte-identical to what it was: the mean of the six.
 * Every dating rep reaches that branch, always, because nothing on that arm
 * produces an accuracy layer at all — `dating-arm.test.ts` pins it, and pins
 * that the seventh slot stays absent there.
 *
 * When it IS present, accuracy is one dimension among seven and is weighted
 * exactly like the rest. It is not a multiplier and it is not a gate: §07's
 * position that a clean interview ending in a no can score 92 survives
 * unchanged, and so does its mirror — knowing everything and explaining none of
 * it still scores badly, because six of the seven are about the explaining.
 */
export function judgementMeanOf(
  scores: SubScores,
  accuracy?: AccuracyLayer | null,
): number {
  const six = SUB_SCORE_KEYS.reduce((sum, key) => sum + scores[key], 0)
  const seventh = accuracy?.score
  return typeof seventh === 'number'
    ? (six + seventh) / (SUB_SCORE_KEYS.length + 1)
    : six / SUB_SCORE_KEYS.length
}

export function composeScorecard(params: {
  transcript: Parameters<typeof computeDeterministicMetrics>[0]
  sessionSeconds: number
  judgement: JudgementLayer
  outcome: Scorecard['outcome']
  model: string
  /** The seventh dimension, on an interview rep that probed. Absent otherwise. */
  accuracy?: AccuracyLayer | null
  /**
   * The deterministic band table.
   *
   * Omitted is the §07 dating table, which is what every dating rep gets and
   * what A0 pins. The interview arm passes its own, because four of the dating
   * bands score correct interview behaviour at zero — see
   * `lib/grade/interview/metrics.ts`.
   */
  bands?: readonly MetricBand[]
}): Scorecard {
  const metrics = computeDeterministicMetrics(params.transcript, params.sessionSeconds)
  const { score: deterministic, breakdown } = scoreDeterministic(metrics, params.bands)

  const judgementMean = judgementMeanOf(params.judgement.scores, params.accuracy)

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
    // Passed through, never re-derived. The filter runs once, in the route, so
    // there is exactly one place where a line is judged fit to store.
    memoryLine: params.judgement.memoryLine,
    // Absent stays absent rather than becoming an explicit null: a dating
    // scorecard has no accuracy key at all, which is what makes "the seventh
    // slot is not on this path" assertable rather than merely true.
    ...(params.accuracy ? { accuracy: params.accuracy } : {}),
  }
}
