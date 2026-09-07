/**
 * The rules an INTERVIEW rep runs by.
 *
 * A new file beside `rep-rules.ts` rather than a parameter added to it, which
 * is rule 19's whole shape: `DATING_DURATION_MS`, `ARM_THRESHOLD`,
 * `KEEP_THRESHOLD`, `WRAP_UP_MS` and `resultReading`'s dating arm are Tier 0
 * and are not opened. What this file adds is the three things an interview does
 * differently — when it winds down, when a credit is owed back, and how the
 * result reads — and it reads the shared arithmetic rather than restating it.
 *
 * Pure functions with tests, the `rep-rules.ts` pattern. Change them here,
 * never in the hook, the action or the screen.
 */

import { resultReading, type ResultReading } from './rep-rules'
import { roundType, type RoundTypeId } from './interview-credits'

/**
 * THE WIND-DOWN IS "DO YOU HAVE ANY QUESTIONS FOR ME?", AND THIRTY SECONDS IS
 * NOT ENOUGH TIME TO ANSWER IT.
 *
 * `WRAP_UP_MS` is thirty seconds because a dating rep's closing beat is one
 * line — she leaves, or she offers her number, and either way she is finishing.
 * The interview's closing beat is a QUESTION, put to the candidate, and it is a
 * beat people lose offers on. It needs long enough to ask it, hear two
 * questions back and answer them.
 *
 * Proportional rather than flat, because a five-minute screener and a
 * twenty-five-minute deep technical cannot share a number: 30 seconds is 10% of
 * one and 2% of the other. Fifteen percent of the round, floored so the
 * screener still gets a real close and capped so a long round does not spend
 * two minutes winding down.
 */
export const INTERVIEW_WRAP_UP_FRACTION = 0.15
export const INTERVIEW_WRAP_UP_MIN_MS = 45_000
export const INTERVIEW_WRAP_UP_MAX_MS = 120_000

export function interviewWrapUpMs(round: RoundTypeId): number {
  const duration = roundType(round).durationMs
  return Math.round(
    Math.min(INTERVIEW_WRAP_UP_MAX_MS,
      Math.max(INTERVIEW_WRAP_UP_MIN_MS, duration * INTERVIEW_WRAP_UP_FRACTION)),
  )
}

/**
 * Time to hand her the closing beat.
 *
 * `shouldWrapUp` is the dating arm's and is not touched — `WRAP_UP_MS` is baked
 * into it, and rule 19 makes that constant Tier 0 in practice. This is the same
 * shape against the round's own number, which is what B7 asks for: the beat
 * fires with enough time left to actually answer it.
 */
export function interviewShouldWrapUp(input: {
  msRemaining: number
  alreadyWrapped: boolean
  round: RoundTypeId
}): boolean {
  if (input.alreadyWrapped) return false
  return input.msRemaining <= interviewWrapUpMs(input.round)
}

/** How long this round runs. §5.7 — length is a property of the round. */
export function interviewDurationMs(round: RoundTypeId): number {
  return roundType(round).durationMs
}

/* ------------------------------------------------------------------ *
 * When a credit is owed back
 * ------------------------------------------------------------------ */

/**
 * How a rep ended, in the vocabulary `sessions.ended_by` already stores.
 */
export type EndedBy = 'user' | 'character' | 'cap' | 'error'

export interface CreditabilityInput {
  endedBy: EndedBy
  /** Did the rep hear the user say anything at all? */
  heardUser: boolean
}

/**
 * Is the credit owed back?
 *
 * ── WHY THE BINARY TEST IS THE WRONG TEST FOR A LONG REP ─────────────────
 *
 * `finishSession` credits a dating rep back only when `heardUser` is false —
 * when the rep produced *literally nothing*. At three minutes that is right:
 * everything else is a rep the user had, and the quota resets tonight.
 *
 * At twenty minutes on a $9 item it is not. A rep that dies at minute fourteen
 * has heard the user, keeps the money and returns nothing, and `INTERVIEW-PLAN`
 * §7.1 is the entry that says so. So the interview arm adds a **completion**
 * test beside the empty-rep one, and keeps both:
 *
 *   · **the transport failed** — creditable at any point. The user did not get
 *     the thing they paid for, and 11% of reps hit a provider error (§7);
 *   · **nothing was heard** — still creditable, still for the muted-headset
 *     case, which is a different failure and deserves the same answer.
 *
 * And what is NOT creditable: a rep the user ended, and a rep that ran its
 * clock. Ending at 18:00 of 20:00 is a rep somebody had and chose to leave, and
 * refunding it would make the credit a rental.
 *
 * **The dating arm never reaches this function.** `heardUser` there means what
 * it has always meant, in the branch it has always meant it in.
 */
export function interviewCreditable(input: CreditabilityInput): boolean {
  if (input.endedBy === 'error') return true
  return !input.heardUser
}

/**
 * Why the credit came back, for the ledger row and for the result screen.
 *
 * Named rather than inferred, because "the connection failed" and "we could not
 * hear you" send a user to two different fixes, and a single "refunded" would
 * send them to neither.
 */
export function creditRefundReason(input: CreditabilityInput): 'provider' | 'silent' | null {
  if (input.endedBy === 'error') return 'provider'
  if (!input.heardUser) return 'silent'
  return null
}

/* ------------------------------------------------------------------ *
 * Reading the result
 * ------------------------------------------------------------------ */

export interface InterviewResultReading extends ResultReading {
  /** Did the impression clear the bar the callback is decided on? */
  cleared: boolean
}

/**
 * The interview's reading of a finished rep.
 *
 * The ARITHMETIC is `resultReading`'s, unchanged and unforked — `close`,
 * `lateSurge` and `nearMiss` mean the same things against
 * `INTERVIEW_THRESHOLD` that they mean against `ARM_THRESHOLD`, and a second
 * implementation of them would be a second thing to keep in step. What this
 * adds is the one question that has no dating equivalent: whether the
 * impression cleared.
 *
 * §07 is unchanged and matters MORE here: a candidate who does not get the
 * callback can score 92, and "did you get the job" is the thing every
 * competitor scores. `cleared` is a reading of the impression meter and is
 * worth zero points, exactly as `won` is.
 */
export function interviewResultReading(input: {
  decisionWarmth: number | null
  finalWarmth: number
  won: boolean
}): InterviewResultReading {
  const reading = resultReading({ ...input, interview: true })
  return { ...reading, cleared: input.won || reading.warmth >= reading.threshold }
}

/**
 * The word for what happened, in interview vocabulary.
 *
 * **The result screen never says "number".** That is the dating rep's ending
 * and this track does not have one; a screen that borrowed the word would be
 * describing a thing that did not happen. `interview-rules.test.ts` asserts it
 * on every branch rather than trusting the author.
 */
export function interviewOutcomeLine(reading: InterviewResultReading): string {
  if (reading.cleared) return 'They would take the next call.'
  if (reading.lateSurge) return 'You found it after they had decided.'
  if (reading.nearMiss) return 'Close. Not quite a callback.'
  return 'They were not convinced.'
}
