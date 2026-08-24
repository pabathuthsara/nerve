/**
 * The baseline rep, and the week-four re-test (§08).
 *
 * "The very first session is framed as a measurement, not a test. It is re-run
 * at week four and the two are shown side by side. This makes session one
 * valuable in itself and plants a retention hook four weeks deep on day one."
 *
 * The rules are here rather than in the screen because two of them are easy to
 * get quietly wrong: which rep counts as the re-test, and when the offer is
 * allowed to appear. Both are pure, and both are tested.
 */

import { daysBetween, localDay } from './day'

/** Four weeks. The hook is planted on day one and cashed on day 28 (§08). */
export const RETEST_AFTER_DAYS = 28

export interface BaselineRep {
  sessionId: string
  personaId: string
  score: number
  /** ISO, when the baseline rep was taken. */
  takenAt: string
}

interface GradedRep {
  id: string
  personaId: string
  startedAt: string
  compositeScore: number | null
}

/**
 * How many local days have passed since the baseline.
 *
 * The user's own day, not UTC. A Colombo user four weeks in should not be told
 * to wait another five and a half hours because a server is behind them.
 */
export function daysSinceBaseline(
  takenAt: string,
  now: Date,
  timezone: string | null,
): number {
  return daysBetween(localDay(new Date(takenAt), timezone), localDay(now, timezone))
}

/**
 * Is the re-test on offer?
 *
 * At day 28 and not before — §08 is specific, and an offer that creeps forward
 * is a measurement taken against a different amount of practice.
 *
 * It stays on offer after day 28 rather than expiring. Somebody who does not
 * open the app on day 28 has not forfeited the only interesting comparison in
 * the product.
 */
export function retestDue(input: {
  baseline: BaselineRep | null
  retest: GradedRep | null
  now: Date
  timezone: string | null
}): boolean {
  if (!input.baseline) return false
  // Already done. The comparison is the reward; the offer has served its turn.
  if (input.retest) return false
  return daysSinceBaseline(input.baseline.takenAt, input.now, input.timezone) >= RETEST_AFTER_DAYS
}

/**
 * The rep that counts as the re-test.
 *
 * Derived rather than stored, which saves a column and cannot drift: it is the
 * FIRST graded rep against the baseline character taken on or after day 28.
 *
 * First rather than best, deliberately. A re-test you can re-roll until the
 * number flatters you is not a measurement, and §07's whole argument is that
 * the number has to be worth believing.
 */
export function findRetest(input: {
  baseline: BaselineRep | null
  sessions: readonly GradedRep[]
  timezone: string | null
}): GradedRep | null {
  const { baseline } = input
  if (!baseline) return null

  const eligible = input.sessions.filter((session) =>
    session.id !== baseline.sessionId
    && session.personaId === baseline.personaId
    && session.compositeScore !== null
    && daysSinceBaseline(baseline.takenAt, new Date(session.startedAt), input.timezone) >= RETEST_AFTER_DAYS)

  // Oldest first: the first qualifying attempt is the measurement.
  return [...eligible].sort((a, b) => a.startedAt.localeCompare(b.startedAt))[0] ?? null
}

export interface SubScorePair {
  key: string
  label: string
  then: number
  now: number
}

export interface BaselineComparison {
  thenScore: number
  nowScore: number
  /** Now minus then. Negative is shown as readily as positive. */
  delta: number
  subScores: SubScorePair[]
  daysApart: number
}

/**
 * The two scorecards, side by side.
 *
 * Sub-scores are matched by key rather than by position, so a change to the
 * order of the six cannot silently compare curiosity against composure.
 * Anything present in one and missing from the other is dropped: a half-filled
 * row reads as a collapse to zero.
 */
export function compareToBaseline(input: {
  thenScore: number
  nowScore: number
  thenSubScores: readonly { key: string; label: string; value: number }[]
  nowSubScores: readonly { key: string; label: string; value: number }[]
  daysApart: number
}): BaselineComparison {
  const now = new Map(input.nowSubScores.map((entry) => [entry.key, entry]))

  const subScores: SubScorePair[] = []
  for (const before of input.thenSubScores) {
    const after = now.get(before.key)
    if (!after) continue
    subScores.push({ key: before.key, label: before.label, then: before.value, now: after.value })
  }

  return {
    thenScore: input.thenScore,
    nowScore: input.nowScore,
    delta: input.nowScore - input.thenScore,
    subScores,
    daysApart: input.daysApart,
  }
}

/**
 * The line over the comparison, hand-written per case (§02 rule 12).
 *
 * It has to be able to say "you got worse" without flinching. A product that
 * only has copy for the flattering direction is a product whose measurement
 * nobody should trust — and §16 does not let us paper over it with a claim.
 */
export function baselineVerdict(comparison: BaselineComparison): string {
  const { delta, thenScore, nowScore, daysApart } = comparison
  if (delta >= 15) {
    return `${thenScore} to ${nowScore} in ${daysApart} days. That is not a better mood, it is a different skill level.`
  }
  if (delta >= 5) {
    return `${thenScore} to ${nowScore}. Four weeks of reps, and it shows in the parts that are hardest to fake.`
  }
  if (delta > 0) {
    return `${thenScore} to ${nowScore}. A small move, in the right direction, on a number that is hard to move.`
  }
  if (delta === 0) {
    return `${thenScore} then, ${nowScore} now. Flat — worth looking at which sub-scores moved underneath it.`
  }
  return `${thenScore} to ${nowScore}. Down. One rep is one day; look at the sub-scores and at what you have been avoiding.`
}
