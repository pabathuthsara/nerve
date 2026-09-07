/**
 * The one trajectory dial that is a function of REP LENGTH.
 *
 * `Trajectory.maxGainPerTurn`'s own documentation says it: it is not about who
 * she is, it is about how many turns there are. The dating arm re-sized it once,
 * when the rep went from two minutes to three, and the note records why — below
 * roughly warmth 48 the cap clips every strong turn, so the total a good run can
 * bank is `cap × turns`, and a longer rep is a uniformly easier rep unless the
 * cap comes down with it.
 *
 * The interview arm cannot solve that by fixing the length, because **length is
 * a property of the round** (§5.7): a five-minute screener and a twenty-five
 * minute deep technical are the same character against the same fixed
 * `INTERVIEW_THRESHOLD` of 70. Left alone, the screener would be unreachable and
 * the deep technical would be a formality.
 *
 * So the authored number is the twenty-minute round's, and this scales it by
 * how many exchanges the chosen round actually has room for. Nothing else in
 * the trajectory moves: gain, decay, decayPerTurn, the ceilings and the start
 * are who she is, and a round does not change any of them.
 *
 * **`lib/warmth/levels.ts` is not opened and `levelTrajectory` is read, never
 * edited** (rule 19, §5.10). This is applied by the interview live page to the
 * persona it hands the hook, so it is a value the transport is given rather
 * than a rule the engine learned.
 */

import type { Trajectory } from '@/lib/voice/types'
import { roundType, type RoundTypeId } from '@/lib/data/interview-credits'

/**
 * How long one exchange takes, in an interview.
 *
 * §6 measured 14.0 turns in 172 seconds on the dating arm — about 12 seconds an
 * exchange. An interview exchange is far longer: a two-sentence question, a
 * real answer, a follow-up. §6's own projection is "~22 exchanges" over twenty
 * minutes, which is 55 seconds each, and that is the number used here rather
 * than a guess.
 */
export const INTERVIEW_EXCHANGE_MS = 55_000

/** The round the authored `maxGainPerTurn` numbers were written against. */
export const REFERENCE_ROUND: RoundTypeId = 'technical'

export function expectedExchanges(round: RoundTypeId): number {
  return Math.max(4, Math.round(roundType(round).durationMs / INTERVIEW_EXCHANGE_MS))
}

/**
 * The trajectory for this interviewer, in this round.
 *
 * Clamped rather than left open at both ends. A five-minute screener would
 * otherwise want a 4x multiplier, which makes a single good answer worth
 * thirteen points and turns the meter into a coin toss; and the longest round
 * would shave the cap far enough that a strong candidate could not clear 70 at
 * all. Between 0.7x and 2.2x, every round is winnable and none is a formality.
 */
export const MIN_GAIN_SCALE = 0.7
export const MAX_GAIN_SCALE = 2.2

export function interviewTrajectory(base: Trajectory, round: RoundTypeId): Trajectory {
  const scale = Math.min(
    MAX_GAIN_SCALE,
    Math.max(MIN_GAIN_SCALE, expectedExchanges(REFERENCE_ROUND) / expectedExchanges(round)),
  )
  return {
    ...base,
    // One place, one decimal. Two multipliers producing a number with a tail of
    // noise on it is the thing `scoreFast` rounds for, and for the same reason.
    maxGainPerTurn: Math.round(base.maxGainPerTurn * scale * 10) / 10,
  }
}
