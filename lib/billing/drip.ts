/**
 * The monthly interview-credit drip on a long billing period (LAUNCH-GAP D22).
 *
 * ── WHY A CRON EXISTS FOR SOMETHING THE WEBHOOK ALREADY DOES ─────────────
 *
 * Credits are granted on `payment.succeeded` — "one payment, one period, one
 * grant" — and that rule holds the product together for as long as a period is
 * a week or a month. The year breaks it in both directions at once. A yearly
 * plan pays ONCE, so the webhook fires once; granting the whole year's credits
 * on that single event would put twenty-four of them in an account on day one,
 * which lifts `voice_daily_cap_cents` from 300c to 2,460c for twelve months
 * (§19's "a shared dial is reached through DATA") and hands the lot to a
 * card-backed trial that has paid $0 and can cancel on day six.
 *
 * So the offer says what one grant is worth (`interviewCredits`) and how many
 * of them the period gets (`creditGrants`). The webhook still writes the first,
 * on the payment, exactly as it does for every other offer. This file works out
 * which of the remaining ones are owed.
 *
 * ── EVERYTHING HERE IS PURE, AND THAT IS THE POINT ───────────────────────
 *
 * The route is a loop and a database call; the arithmetic is here, where it can
 * be tested without a subscription, a clock or a network. The same reason
 * `rep-rules.ts` is not inside the hook.
 */

import type { PlanOffer } from '@/lib/site/plans'

const DAY_MS = 24 * 60 * 60 * 1000

/** One drip: which slot it is, and when what it hands over runs out. */
export interface Drip {
  /**
   * Which grant of the period this is, counting the webhook's as zero.
   *
   * It is part of the ledger reference, which is what makes a re-run harmless:
   * the unique index refuses the second write of `drip:<user>:<end>:3` rather
   * than the cron having to remember whether it has run today.
   */
  index: number
  /** ISO. When this drip's credits expire, which is when the next one lands. */
  expiresAt: string
}

/**
 * How long one grant covers, in milliseconds.
 *
 * Derived from the offer rather than assumed to be a month, so an offer that
 * ever drips at another cadence cannot silently keep this one.
 */
export function grantWindowMs(offer: PlanOffer): number {
  return (offer.billingDays / offer.creditGrants) * DAY_MS
}

/**
 * The drips owed on a subscription, given when its period started.
 *
 * **Every drip the period has reached, not just the newest one.** A cron that
 * granted only the current month would lose a month permanently to one failed
 * run, and a paid customer silently receiving less than they bought is the
 * failure mode this whole file is insurance against. Re-issuing an old index is
 * free — the ledger reference collides and nothing is written — so the cheap,
 * self-healing answer is to name them all and let the database decide which are
 * new.
 *
 * Index 0 is never returned: that one belongs to `payment.succeeded`, and
 * writing it here would double-grant on a plan the webhook has already served.
 */
export function dripsOwed(input: {
  offer: PlanOffer
  /** ISO or Date. The start of the period now running. */
  periodStart: string | Date
  now?: Date
}): Drip[] {
  const { offer } = input
  if (offer.creditGrants <= 1 || offer.interviewCredits <= 0) return []

  const start = new Date(input.periodStart).getTime()
  if (!Number.isFinite(start)) return []

  const now = (input.now ?? new Date()).getTime()
  const window = grantWindowMs(offer)
  if (window <= 0) return []

  /**
   * Floor, so a drip lands when its month has fully elapsed rather than at the
   * moment the previous one is issued. Clamped to the last slot the period
   * actually has: a subscription that outlives its `current_period_end` without
   * a renewal event must not keep minting credits off a stale anchor.
   */
  const elapsed = Math.floor((now - start) / window)
  const last = Math.min(elapsed, offer.creditGrants - 1)

  const drips: Drip[] = []
  for (let index = 1; index <= last; index += 1) {
    drips.push({
      index,
      // Expires when the next drip lands, which is what makes the balance
      // use-it-or-lose-it and keeps the spend ceiling where a month leaves it.
      expiresAt: new Date(start + (index + 1) * window).toISOString(),
    })
  }
  return drips
}

/**
 * The ledger's idempotency key for one drip.
 *
 * Carries the period end as well as the index so that next year's third month
 * is a different row from this year's. Without it a renewed subscription would
 * collide with its own history and silently grant nothing for a second year.
 */
export function dripReference(input: { periodEnd: string; index: number }): string {
  return `drip:${input.periodEnd}:${input.index}`
}
