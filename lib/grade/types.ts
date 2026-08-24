/**
 * The §07 scorecard.
 *
 * Produced ONCE, after the session, from the full transcript. Never from live
 * warmth events — the live scorer runs a small model against single exchanges
 * under a latency budget, and baking that noise into a stored grade would put
 * it in the user's permanent progression record.
 */

import type { DeterministicMetrics, MetricScore } from './metrics'

/** The six the user actually sees (§07). */
export interface SubScores {
  opening: number
  curiosity: number
  listening: number
  signalReading: number
  composure: number
  close: number
}

export const SUB_SCORE_KEYS: readonly (keyof SubScores)[] = [
  'opening',
  'curiosity',
  'listening',
  'signalReading',
  'composure',
  'close',
]

export interface JudgementLayer {
  scores: SubScores
  /** One per sub-score, quoting the transcript. Grounding, not decoration. */
  evidence: Partial<Record<keyof SubScores, string>>
  /** Named before anything critical. A user who feels flayed does not return. */
  wentWell: string
  /**
   * What she would still have in mind on a return visit (§08), already past
   * `lib/grade/memory.ts`. Null is the normal case and means she brings
   * nothing up — never an invented line.
   */
  memoryLine: string | null
}

export interface Scorecard {
  /** 0-100 composite: 60% deterministic, 40% judgement (§07). */
  composite: number
  subScores: SubScores
  /** The two weakest, surfaced as the focus for the next rep. */
  focus: (keyof SubScores)[]
  wentWell: string
  evidence: Partial<Record<keyof SubScores, string>>
  metrics: DeterministicMetrics
  /** Deterministic component of the composite, 0-100. */
  deterministicScore: number
  /** Band, actual value and points awarded, per metric. The audit trail. */
  metricScores: MetricScore[]
  /** Stamped so a stored grade stays auditable across model changes (§04). */
  model: string
  gradedAt: string
  /**
   * Outcome is recorded and contributes ZERO points (§07). A clean rep that
   * ends in rejection can score 92.
   */
  outcome: 'receptive' | 'neutral' | 'rejecting' | 'unknown'
  /**
   * One line she would still have in mind next time (§08), filtered.
   *
   * Carried on the scorecard because grading is already the one pass over the
   * full transcript — a second model call to produce a sentence would be a
   * second thing to audit and a second thing to pay for. It contributes
   * nothing to the composite.
   */
  memoryLine: string | null
}

export const DETERMINISTIC_WEIGHT = 0.6
export const JUDGEMENT_WEIGHT = 0.4
