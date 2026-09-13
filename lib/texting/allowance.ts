/**
 * How many texting conversations an account may start today.
 *
 * ── THE UNIT SOLD IS THE UNIT DELIVERED ──────────────────────────────────
 *
 * A conversation, not a message. The alternative — a daily message counter —
 * cuts somebody off mid-thread, which is §05's "nothing may interrupt a live
 * rep" applied to the one surface where it would be cruellest: a character
 * stops answering because a number ran out, and the user cannot tell that from
 * her having lost interest, which is the exact signal the section teaches.
 *
 * So **the gate is on STARTING a thread.** A thread that has begun always runs
 * to its own ending, however many messages that takes.
 *
 * ── WHY THE COUNT IS A READ AND NOT A COUNTER ────────────────────────────
 *
 * `entitlements.reps_used_today` is a stored counter and it has to be, because
 * a rep is an event with no row of its own until it finishes. A thread has a
 * row from the moment it starts, so the count is a `select` over `started_at`
 * — nothing to increment, nothing to reset at midnight, and no write path to
 * get wrong.
 *
 * That is also why `texting_threads` has **no delete policy**. The original
 * `text_threads` argued that rule 11 did not reach it because "nobody would pay
 * to change what they themselves typed", and that was true right up until the
 * day a thread became a quota. Start fresh ENDS a thread; it never removes one.
 *
 * Pure and isomorphic, like `day.ts` and for the same reason: the Server Action
 * that opens a thread and the line on the roster that says how many are left
 * have to agree, and one implementation is the only way to guarantee it.
 */

import { localDay } from '@/lib/data/day'

/** What free gets. One real conversation a day. */
export const FREE_THREADS_PER_DAY = 1

/**
 * What a paid plan gets.
 *
 * Not `Infinity`, and not a separate "unlimited" flag. Forty conversations a
 * day is roughly fifty cents of tokens and about eight hours of typing; it is a
 * runaway guard on a stuck client rather than a limit on a person, and the copy
 * says unlimited because for any human it is (`TEXTING-PLAN.md` §13).
 */
export const PAID_THREADS_PER_DAY = 40

export interface TextingAllowanceInput {
  /** `entitlements.texting_threads_per_day`. */
  threadsPerDay: number
  /** Threads whose `started_at` falls in the account's own local day. */
  startedToday: number
}

export interface TextingAllowance {
  /** How many more conversations may be started today. */
  remaining: number
  /** Whether a new conversation may be started at all. */
  mayStart: boolean
  /** The plan's daily number, for the copy that names it. */
  perDay: number
}

export function textingAllowance(input: TextingAllowanceInput): TextingAllowance {
  const perDay = Math.max(0, Math.floor(input.threadsPerDay))
  const used = Math.max(0, Math.floor(input.startedToday))
  const remaining = Math.max(0, perDay - used)
  return { remaining, mayStart: remaining > 0, perDay }
}

/**
 * The refusal, in one place.
 *
 * Three surfaces need this sentence — the roster card, the Server Action and
 * the thread screen — and `creditRefusal` is the precedent: the interview track
 * had three hand-written strings for one refusal and two of them only knew
 * about the screener case.
 *
 * It never says "upgrade" and never names a price. The card that surrounds it
 * carries the offer, because a refusal that sells is a refusal somebody reads
 * as a trick.
 */
export function textingRefusal(allowance: TextingAllowance): string {
  if (allowance.perDay <= 0) {
    return 'Texting is not open on this account.'
  }
  if (allowance.perDay === 1) {
    return 'That is today’s conversation. A new one opens tomorrow.'
  }
  return `That is all ${allowance.perDay} of today’s conversations. New ones open tomorrow.`
}

/** Whether a thread's `started_at` counts against today. */
export function startedOnDay(
  startedAt: string,
  timeZone: string | null | undefined,
  now: Date,
): boolean {
  return localDay(new Date(startedAt), timeZone) === localDay(now, timeZone)
}
