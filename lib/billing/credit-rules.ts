/**
 * What a billing event does to the interview credit balance (INTERVIEW-PLAN
 * D3, D4).
 *
 * Pure functions over a normalised `BillingEvent`, tested directly — the same
 * shape and the same reason as `lib/billing/events.ts`: the decision about
 * whether somebody gets the interviews they paid for should be arguable in a
 * test file rather than buried in a route handler.
 *
 * ── EVERYTHING KEYS ON THE PAYMENT, AND THAT IS A MEASUREMENT ────────────
 *
 * The obvious design grants on `membership.activated` and tops up on
 * `payment.succeeded`. It double-grants, and the only way to know that was to
 * read a real delivery. Rule 14, again.
 *
 * The captured `payment.succeeded` from the first live purchase (2 September,
 * `pay_PjRU2V3WOafQJ9`, pinned in `events.test.ts`) carries **`total: "0.0"`,
 * `status: "paid"`, `billing_reason: "subscription_create"`** — Whop emits a
 * real payment event for the £0 authorisation that starts a card-backed trial,
 * in the same second as `membership.activated`. So a design that granted on
 * both would have handed two credits to every trial on day zero, and the
 * specification says nothing about it.
 *
 * So: **one payment, one period, one grant.** `payment.succeeded` is the only
 * event that adds credits, its `pay_…` is the idempotency key, and
 * `membership.activated` adds nothing at all. That covers every shape without a
 * branch per case:
 *
 *   trial start        `pay_` at $0        → one credit for the trial period
 *   the day-7 charge   a second `pay_`     → one credit for the first month
 *   a renewal          a further `pay_`    → one credit for that month
 *   weekly, no trial   one `pay_` at $7    → one credit for that week
 *   a pack             one `pay_` at $9    → the pack's credits, never expiring
 *
 * ── AND THE TWO EXPIRY RULES ARE ONE FIELD ───────────────────────────────
 *
 * §5.5: a purchase never expires and survives cancellation; a grant dies at the
 * end of the period that handed it out. Both are `expiresAt` — null on a
 * purchase, the period boundary on a grant — and the database CHECK refuses a
 * purchase that carries one, so the rule cannot be broken by a caller.
 */

import { INTERVIEW_PACKS, PLAN_INTERVIEW_CREDITS, TRIAL_DAYS, offersFor } from '@/lib/site/plans'
import type { PackId } from '@/lib/site/plans'
import type { Plan } from '@/lib/data/types'
import type { BillingEvent } from './events'

/** What an event does to the balance. Null when it does nothing. */
export type CreditEffect =
  /** A pack was bought. Credits that never expire. */
  | { kind: 'purchase'; pack: PackId; credits: number; reference: string }
  /** A subscription paid for a period. Credits that die with it. */
  | { kind: 'grant'; plan: Plan; credits: number; reference: string; expiresAt: string }
  /** A pack was refunded or charged back. Take back what is left of it. */
  | { kind: 'revoke'; pack: PackId; credits: number; reference: string }
  /** The subscription ended. Unspent GRANTED credits go; purchased ones stay. */
  | { kind: 'void-grants'; reference: string }

/**
 * The idempotency key for anything a payment causes.
 *
 * The payment id, because Whop mints one per charge and replays the same one:
 * a webhook redelivered twelve times over seventy-one hours collides on the
 * ledger's unique index eleven times. Falls back to the event id, and then to
 * the membership plus the timestamp, so an event with no payment on it still
 * has a key that is stable across retries rather than a new row each time.
 */
export function creditReference(prefix: string, event: BillingEvent): string {
  const key =
    event.paymentId
    ?? event.eventId
    ?? `${event.providerSubscriptionId ?? 'unknown'}:${event.occurredAt}`
  return `${prefix}:${key}`
}

/**
 * When a granted credit dies.
 *
 * The period the payment bought, which is what "part of the month you paid for"
 * means. Three inputs and a deliberate order:
 *
 *   the period end the provider states, when it is still in the future — the
 *   membership event carries it and it is the authority;
 *   the trial's length, when the payment says the membership is trialling and
 *   the period is not known yet (the two events race, and the payment can win);
 *   otherwise the plan's own billing period from `OFFERS`, counted from now.
 *
 * The fallbacks exist because delivery order is not guaranteed and a grant with
 * no expiry would be a grant that never dies — which is the one thing §5.5 says
 * only a purchase may do.
 */
export function grantExpiry(input: {
  plan: Plan
  periodEnd: string | null
  trialing: boolean
  now?: Date
}): string {
  const now = input.now ?? new Date()
  const stated = input.periodEnd ? Date.parse(input.periodEnd) : NaN
  if (Number.isFinite(stated) && stated > now.getTime()) return new Date(stated).toISOString()

  const days = input.trialing ? TRIAL_DAYS : billingDaysFor(input.plan)
  return new Date(now.getTime() + days * 86_400_000).toISOString()
}

/**
 * The longest period this plan is sold on, in days.
 *
 * The longest rather than the shortest: the two Pro offers are a week and a
 * month, the payload does not say which was bought when the period end is
 * missing, and erring short would expire a monthly subscriber's credit
 * twenty-three days early. Erring long costs at most one extra interview on an
 * account that has already been charged, and the account's own
 * `membership.deactivated` voids it the moment they stop paying.
 */
function billingDaysFor(plan: Plan): number {
  const offers = offersFor(plan)
  if (offers.length === 0) return 30
  return Math.max(...offers.map((offer) => offer.billingDays))
}

/**
 * What this event does to the balance.
 *
 * `pack` is resolved by the caller from the environment (`packForWhopPlan`),
 * because the vendor's ids are configuration and this file is a rule.
 */
export function creditEffectFor(
  event: BillingEvent,
  context: {
    /** The pack this event's plan buys, when it buys one. */
    pack?: PackId | null
    /** The plan this event's subscription grants, when it grants one. */
    plan?: Plan | null
    /** The period end already known for this account, if any. */
    periodEnd?: string | null
    now?: Date
  } = {},
): CreditEffect | null {
  const pack = context.pack ?? null

  if (pack) {
    const authored = INTERVIEW_PACKS.find((entry) => entry.id === pack)
    if (!authored) return null

    // Money moved. A one-time plan's `payment.succeeded` is the only thing that
    // puts purchased credits in an account.
    if (event.type === 'payment.succeeded') {
      return {
        kind: 'purchase',
        pack,
        credits: authored.credits,
        reference: creditReference('pack', event),
      }
    }

    /**
     * Money came back, so the interviews do too.
     *
     * A refund and a chargeback both land here, and both take back **what is
     * left** rather than what was sold — the caller clamps it. Somebody who
     * bought five, used three and then disputed the charge keeps nothing they
     * have not already had; a ledger that went to minus two would put a debt in
     * front of their next purchase, which is not a thing we sell.
     */
    if (event.intent === 'revoke') {
      return {
        kind: 'revoke',
        pack,
        credits: authored.credits,
        reference: creditReference('revoke', event),
      }
    }

    // Everything else about a pack — the membership activating, a failed
    // retry — changes no balance. A pack is not a subscription and has no
    // access to take away.
    return null
  }

  const plan = context.plan ?? null

  if (event.intent === 'revoke') {
    /**
     * §5.5's sentence the terms will be quoted on.
     *
     * "Unspent granted credits are voided when a subscription lapses, and
     * purchased credits are untouched by cancellation." Both halves are in the
     * one word `grants`: the void names the source, so a pack bought in March
     * survives a subscription cancelled in June.
     */
    return { kind: 'void-grants', reference: creditReference('void', event) }
  }

  if (event.type !== 'payment.succeeded' || !plan || plan === 'free') return null

  const credits = PLAN_INTERVIEW_CREDITS[plan]
  if (credits <= 0) return null

  return {
    kind: 'grant',
    plan,
    credits,
    reference: creditReference('grant', event),
    expiresAt: grantExpiry({
      plan,
      periodEnd: context.periodEnd ?? event.currentPeriodEnd,
      // The payment's own view of the membership, narrowed by `toBillingEvent`.
      // A $0 trial authorisation says `trialing` here and a real charge does
      // not, which is how the trial's credit gets the trial's length.
      trialing: event.status === 'trialing',
      ...(context.now ? { now: context.now } : {}),
    }),
  }
}
