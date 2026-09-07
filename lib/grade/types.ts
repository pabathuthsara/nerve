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

/**
 * THE SEVENTH DIMENSION (INTERVIEW-TECHNICAL-PLAN §8.4).
 *
 * Nullable, and populated only on an interview rep that actually probed. Null
 * is load-bearing in two places: a behavioural round has no accuracy score and
 * its composite is the existing six, and an interview where the grader
 * abstained on everything has no reading either — which is not the same as a
 * bad one.
 *
 * It is deliberately NOT a member of `SubScores`. That interface is the six
 * §07 dimensions, every one of them non-null, and it is read by
 * `clampSubScores`, `weakestTwo`, the `scores` insert and the focus plan — a
 * seventh required member would put "technical accuracy" in a dating rep's
 * focus and in the library's card targets, neither of which has anything to say
 * about it.
 */
export interface AccuracyLayer {
  /** 0-100, or null when nothing could be judged. */
  score: number | null
  /** How many probe answers the verdict counted. The denominator, stated. */
  scored: number
  /** How many probes were put to them at all. */
  asked: number
  correct: number
  incomplete: number
  wrong: number
  /**
   * One line per answer that was not right: what they said, and what is true.
   *
   * **Not a lesson** (§10.7). Nerve is a gym, not a course, and a course is a
   * different product with different obligations.
   */
  notes: {
    index: number
    verdict: 'INCOMPLETE' | 'WRONG'
    question: string
    quote: string
    correction: string
  }[]
  /** The one sentence that separates the two numbers (§8.5). */
  reading: string | null
}

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
  /**
   * Whether the answers were actually right (§8).
   *
   * **Absent on every dating rep and on every behavioural interview round**, and
   * absent is what keeps the composite where it was: `composeScorecard` reads
   * the six when this is missing or its `score` is null, which is the identical
   * arithmetic `dating-arm.test.ts` pins.
   */
  accuracy?: AccuracyLayer | null
}

export const DETERMINISTIC_WEIGHT = 0.6
export const JUDGEMENT_WEIGHT = 0.4
