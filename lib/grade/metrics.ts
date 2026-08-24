/**
 * The deterministic 60% of the Composure Score (§07).
 *
 * Computed locally from the transcript. These carry the majority precisely
 * because they are stable — the same performance scoring 62 on Tuesday and 81
 * on Thursday would destroy the credibility of the entire progression system.
 *
 * Nothing here touches a model or a network. It is the half of the scorecard
 * that cannot drift when a model updates.
 */

import type { TranscriptTurn } from '@/lib/voice/types'
import { fillerCount, isOpenQuestion } from '@/lib/warmth/fast'

export interface DeterministicMetrics {
  /** Share of total speaking time that was his. Target band 40-55%. */
  talkRatio: number | null
  questionsAsked: number
  /** Per three minutes, which is the unit §07 states the target in. */
  questionsPer3Min: number | null
  openQuestions: number
  closedQuestions: number
  /** Target >= 2:1. Null when he asked no closed questions. */
  openClosedRatio: number | null
  /** Per minute of his speaking time. Target < 4. */
  fillerRate: number | null
  /** Seconds. Target < 22 — catches the anxious over-explaining spiral. */
  longestMonologue: number
  /** Seconds between her finishing and him starting. Target < 1.8. */
  meanResponseLatency: number | null
  /** "Coffee Thursday?" beats "we should hang out sometime". */
  specificPlanOffered: boolean
  /**
   * The same judgement, graded, because §07 scores this one and a boolean
   * cannot be scored without punishing the wrong thing.
   *
   * `null` when he proposed nothing at all — which is NOT a failure. Reading a
   * closed person correctly and declining to push is good play, and §16 rule 6
   * bans pressure closes outright; a metric that docked him for not asking
   * would teach exactly the behaviour the product refuses to teach. §07's own
   * gloss is a comparison between two ASKS — "Coffee Thursday?" beats "we
   * should hang out sometime" — so what is scored is how well he asked, on the
   * reps where he asked.
   *
   * 1 specific · 0.5 vague · null no attempt.
   */
  planQuality: number | null
  /** Left warmly without pushing. Only meaningful after a knock-back. */
  cleanExit: boolean
  /**
   * How he left, graded. `null` when he barely spoke at all.
   *
   * Deliberately NOT conditioned on how the rep went. Gating it on rejection
   * would make the composite's own composition depend on the outcome — a
   * rejecting rep scored across seven metrics and a receptive one across six —
   * which is §07's cardinal rule broken by the back door. Every rep has an
   * ending and leaving well is process, so every rep with a real conversation
   * in it gets marked on it.
   *
   * 1 warm farewell · 0.5 trailed off · 0 pushed.
   */
  exitQuality: number | null
  userTurns: number
  agentTurns: number
  sessionSeconds: number
}

/** A concrete plan names a time, a day, or an occasion. Vagueness does not count. */
const SPECIFIC_PLAN =
  /\b(tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|this week|next week|at \d|around \d|\d\s?(am|pm)|o'?clock)\b/i
const PLAN_VERB =
  /\b(coffee|drink|dinner|lunch|meet|see you|come along|go for|grab)\b/i

/**
 * He proposed seeing her again, in any form — the gate on whether the ask is
 * marked at all.
 *
 * Deliberately narrower than a farewell. "See you" is how people say goodbye;
 * "see you again" is a proposal, and conflating them would score every polite
 * exit as an attempted close.
 */
const PLAN_PROPOSAL =
  /\b(coffee|a drink|drinks|dinner|lunch|hang out|meet up|catch up|go for|grab (a|some)|see you again|do this again)\b/i

const FAREWELL =
  /\b(nice to meet you|good to meet you|nice talking|enjoy the rest|have a good|take care|see you|all the best|good luck|no worries|fair enough|no problem)\b/i
const PUSHY =
  /\b(come on|just one|why not|are you sure|give me a chance|just give me|please|at least)\b/i

function speakingSeconds(turns: readonly TranscriptTurn[]): number {
  return turns.reduce((sum, turn) => sum + Math.max(0, turn.t_end - turn.t_start), 0)
}

export function computeDeterministicMetrics(
  transcript: readonly TranscriptTurn[],
  sessionSeconds: number,
): DeterministicMetrics {
  const user = transcript.filter((turn) => turn.speaker === 'user')
  const agent = transcript.filter((turn) => turn.speaker === 'agent')

  const userSeconds = speakingSeconds(user)
  const agentSeconds = speakingSeconds(agent)
  const totalSpoken = userSeconds + agentSeconds

  // Questions. §07 tracks open vs closed separately because "yes/no questions
  // are where conversations go to die".
  let openQuestions = 0
  let closedQuestions = 0
  for (const turn of user) {
    if (isOpenQuestion(turn.text)) openQuestions += 1
    else if (turn.text.includes('?')) closedQuestions += 1
  }
  const questionsAsked = openQuestions + closedQuestions

  const fillers = user.reduce((sum, turn) => sum + fillerCount(turn.text), 0)

  // Response latency: her finishing to him starting. Only pairs where she
  // actually spoke before him count.
  const latencies: number[] = []
  for (let i = 0; i < transcript.length - 1; i += 1) {
    const current = transcript[i]
    const next = transcript[i + 1]
    if (current?.speaker === 'agent' && next?.speaker === 'user') {
      const gap = next.t_start - current.t_end
      if (gap >= 0 && gap < 30) latencies.push(gap)
    }
  }

  const lastUser = user[user.length - 1]
  const farewell = lastUser ? FAREWELL.test(lastUser.text) : false
  const pushedAtTheEnd = user.slice(-2).some((turn) => PUSHY.test(turn.text))

  // Whether he asked at all, and then how well. The two questions are separate
  // because only the second one is scored — see `planQuality`.
  const proposed = user.some((turn) => PLAN_PROPOSAL.test(turn.text))
  const specificPlanOffered = user.some(
    (turn) => SPECIFIC_PLAN.test(turn.text) && PLAN_VERB.test(turn.text),
  )

  return {
    talkRatio: totalSpoken > 0 ? userSeconds / totalSpoken : null,
    questionsAsked,
    questionsPer3Min: sessionSeconds > 0 ? (questionsAsked / sessionSeconds) * 180 : null,
    openQuestions,
    closedQuestions,
    openClosedRatio: closedQuestions > 0 ? openQuestions / closedQuestions : null,
    fillerRate: userSeconds > 0 ? (fillers / userSeconds) * 60 : null,
    longestMonologue: user.reduce(
      (longest, turn) => Math.max(longest, turn.t_end - turn.t_start),
      0,
    ),
    meanResponseLatency:
      latencies.length > 0
        ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length
        : null,
    specificPlanOffered,
    planQuality: proposed ? (specificPlanOffered ? 1 : 0.5) : null,
    cleanExit: farewell && !pushedAtTheEnd,
    // Two user turns is the floor for marking an ending. Below that there was
    // no conversation to leave, and §15 does not score a session under twenty
    // seconds anyway.
    exitQuality: user.length < 2 ? null : pushedAtTheEnd ? 0 : farewell ? 1 : 0.5,
    userTurns: user.length,
    agentTurns: agent.length,
    sessionSeconds: Math.round(sessionSeconds * 10) / 10,
  }
}

/* ------------------------------------------------------------------ *
 * Band scoring
 * ------------------------------------------------------------------ */

/**
 * A §07 target band, and how far outside it is still worth partial credit.
 *
 * Round 9 scored 96 on a session with three metrics outside band, because the
 * old scorer had no upper bounds and a falloff measured against the band's own
 * width. Fourteen questions in three minutes read as "well above the minimum of
 * three" and took full marks. Fourteen questions in three minutes is an
 * interrogation.
 */
export interface MetricBand {
  key: keyof DeterministicMetrics
  label: string
  /** Inclusive lower bound of the target. */
  min?: number
  /** Inclusive upper bound of the target. */
  max?: number
  /**
   * Distance outside the band at which the metric scores zero.
   *
   * Explicit per metric rather than derived from the band width. A band's width
   * says how tolerant the *target* is, not how bad it is to miss — those are
   * different questions and conflating them is what produced the round-9 score.
   */
  tolerance: number
  /** How the value is rendered in the audit line. */
  format: (value: number) => string
  /**
   * Overrides the computed target string in the audit line.
   *
   * For the two metrics §07 states as booleans, whose scale is a judgement
   * rather than a quantity: "≥ 1" is arithmetically true and tells a user
   * nothing, and §07's whole argument for the deterministic half is that a
   * composite can be taken apart rather than trusted.
   */
  target?: string
}

/**
 * Marks at the exact edge of the band.
 *
 * Not 100. "The band is the lesson" (§07) — the middle of the band is the
 * target and its boundary is borderline by definition, so sitting on the line
 * should not read as a perfect performance. It also keeps the curve continuous:
 * without it a value one thousandth outside the band would fall off a cliff
 * from 100.
 */
const EDGE_SCORE = 88

export interface MetricScore {
  key: string
  label: string
  /** The target, rendered for the audit line. */
  band: string
  value: number | null
  /** 0-100, or null when the session gave nothing to measure. */
  points: number | null
  verdict: 'inside' | 'below' | 'above' | 'unmeasured'
}

/**
 * Full marks in the middle, tapering to EDGE_SCORE at the boundary, then
 * falling to zero across `tolerance`. Symmetric: overshooting a target is a
 * miss in exactly the way undershooting is.
 */
export function bandScore(value: number | null, band: MetricBand): number | null {
  if (value === null || !Number.isFinite(value)) return null
  const { min, max, tolerance } = band

  const below = min !== undefined && value < min
  const above = max !== undefined && value > max
  if (below) return falloff(min - value, tolerance)
  if (above) return falloff(value - max, tolerance)

  // Inside. Distance from the nearest edge, as a share of the room available
  // to move away from it, decides how far above EDGE_SCORE it lands.
  const headroom = insideHeadroom(value, band)
  return Math.round(EDGE_SCORE + (100 - EDGE_SCORE) * headroom)
}

function falloff(distance: number, tolerance: number): number {
  const span = Math.max(tolerance, 1e-6)
  return Math.max(0, Math.round(EDGE_SCORE * (1 - distance / span)))
}

/** 0 at the boundary, 1 comfortably inside. */
function insideHeadroom(value: number, band: MetricBand): number {
  const { min, max, tolerance } = band
  if (min !== undefined && max !== undefined) {
    const half = (max - min) / 2
    if (half <= 0) return 1
    const centre = (min + max) / 2
    return Math.max(0, Math.min(1, 1 - Math.abs(value - centre) / half))
  }
  // One-sided: full marks once clear of the boundary by the tolerance.
  const edge = min !== undefined ? value - min : (max as number) - value
  return Math.max(0, Math.min(1, edge / Math.max(tolerance, 1e-6)))
}

/**
 * The §07 deterministic bands, in one place so the scorecard, the dev panel and
 * any future calibration harness read the same numbers.
 */
export const METRIC_BANDS: readonly MetricBand[] = [
  {
    key: 'talkRatio',
    label: 'talk ratio',
    min: 0.4,
    max: 0.55,
    // Dominating and disappearing both fail; 15 points either side of the band
    // is the difference between a conversation and a monologue.
    tolerance: 0.12,
    format: (value) => `${Math.round(value * 100)}%`,
  },
  {
    key: 'questionsPer3Min',
    label: 'questions / 3 min',
    min: 3,
    // THE ROUND-9 FIX. §07 only ever stated a floor, so an interrogation took
    // full marks. Eight in three minutes is one roughly every twenty seconds,
    // which is already brisk; past that he is running a survey.
    max: 8,
    tolerance: 3,
    format: (value) => value.toFixed(1),
  },
  {
    key: 'openClosedRatio',
    label: 'open : closed',
    min: 2,
    tolerance: 1,
    format: (value) => `${value.toFixed(2)}:1`,
  },
  {
    key: 'fillerRate',
    label: 'fillers / min',
    max: 4,
    tolerance: 4,
    format: (value) => value.toFixed(1),
  },
  {
    key: 'longestMonologue',
    label: 'longest monologue',
    max: 22,
    tolerance: 15,
    format: (value) => `${value.toFixed(1)}s`,
  },
  {
    key: 'meanResponseLatency',
    label: 'response latency',
    max: 1.8,
    tolerance: 1.5,
    format: (value) => `${value.toFixed(2)}s`,
  },
  // The two §07 metrics that were computed and never scored until 24 Aug.
  // Both are graded 0-1 rather than boolean; see `planQuality` and
  // `exitQuality` for why each is allowed to be unmeasured.
  {
    key: 'planQuality',
    label: 'the ask',
    min: 1,
    // A vague ask lands at 44 rather than 0. He did the hard part — he asked —
    // and the lesson is that "sometime" is not a plan, not that asking was a
    // mistake.
    tolerance: 1,
    target: 'specific',
    format: (value) => (value >= 1 ? 'specific' : 'vague'),
  },
  {
    key: 'exitQuality',
    label: 'the exit',
    min: 1,
    tolerance: 1,
    target: 'warm, no push',
    format: (value) => (value >= 1 ? 'warm' : value > 0 ? 'trailed off' : 'pushed'),
  },
]

/** Human-readable target, for the audit line. */
export function describeBand(band: MetricBand): string {
  const { min, max, format } = band
  if (band.target !== undefined) return band.target
  if (min !== undefined && max !== undefined) return `${format(min)}–${format(max)}`
  if (min !== undefined) return `≥ ${format(min)}`
  if (max !== undefined) return `≤ ${format(max)}`
  return '—'
}

/**
 * Every metric scored against its band, with the working shown.
 *
 * Band, actual value and points awarded, per metric, so a composite can be
 * audited instead of trusted. A 96 that nobody can take apart is worse than a
 * 73 that anyone can.
 */
export function scoreMetrics(metrics: DeterministicMetrics): MetricScore[] {
  return METRIC_BANDS.map((band) => {
    const raw = metrics[band.key]
    const value = typeof raw === 'number' ? raw : null
    const points = bandScore(value, band)
    return {
      key: band.key,
      label: band.label,
      band: describeBand(band),
      value,
      points,
      verdict:
        value === null || points === null
          ? ('unmeasured' as const)
          : band.min !== undefined && value < band.min
            ? ('below' as const)
            : band.max !== undefined && value > band.max
              ? ('above' as const)
              : ('inside' as const),
    }
  })
}
