/**
 * Merchant-of-record events, normalised (§14).
 *
 * The provider's vocabulary stops here. Everything downstream reads a
 * `BillingEvent`, which names what happened to *access* rather than what
 * happened at the vendor — so swapping merchant of record is an adapter and a
 * migration, not a rewrite of the entitlement logic (§14).
 *
 * These are pure functions over a parsed payload, tested directly, for the
 * same reason `lib/data/rep-rules.ts` and `lib/safety/assess.ts` are: the
 * decision about whether somebody keeps a plan they paid for should be
 * arguable in a test file, not buried in a route handler.
 */

import type { Plan } from '@/lib/data/types'

/** What the event does to access. */
export type BillingIntent =
  /** Grant or extend the plan. */
  | 'grant'
  /** Take access away now. */
  | 'revoke'
  /** Note the state, change nothing about access. */
  | 'record'

/** Mirrors the `status` check on `public.subscriptions`. */
export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'incomplete'

export interface BillingEvent {
  /** The provider's event id, where it sends one. Used for the log, not for logic. */
  eventId: string | null
  /** Provider event name, kept verbatim so an unmapped one is still legible. */
  type: string
  intent: BillingIntent
  status: SubscriptionStatus
  /** When the provider says it happened, in epoch milliseconds. */
  occurredAt: number
  /** Supabase user id, when the payload carries one. */
  userId: string | null
  providerCustomerId: string | null
  providerSubscriptionId: string | null
  /** The purchased product, resolved to a plan by `lib/billing/plans.ts`. */
  productId: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
}

/**
 * How each provider event maps to access.
 *
 * Two of these are product decisions rather than transcriptions:
 *
 *   `past_due` **keeps access**. The merchant of record retries a failed
 *   payment four times over six hours and most recover; cutting somebody off
 *   at the first failed retry punishes a card that expired on a Tuesday. The
 *   status is recorded so dunning can see it, and `expired` is what actually
 *   revokes.
 *
 *   `dispute.created` **revokes immediately**, unlike a refund's grace. A
 *   chargeback is money already clawed back and, per §14, an account that
 *   keeps its plan through a dispute is the pattern that gets a merchant
 *   account closed.
 */
const INTENTS: Record<string, { intent: BillingIntent; status: SubscriptionStatus }> = {
  'checkout.completed': { intent: 'grant', status: 'active' },
  'subscription.active': { intent: 'grant', status: 'active' },
  'subscription.paid': { intent: 'grant', status: 'active' },
  'subscription.trialing': { intent: 'grant', status: 'trialing' },
  'subscription.update': { intent: 'grant', status: 'active' },
  // Scheduled, not done: they keep what they paid for until the period ends.
  'subscription.scheduled_cancel': { intent: 'record', status: 'active' },
  'subscription.past_due': { intent: 'record', status: 'past_due' },
  'subscription.unpaid': { intent: 'record', status: 'past_due' },
  'subscription.canceled': { intent: 'revoke', status: 'canceled' },
  'subscription.expired': { intent: 'revoke', status: 'canceled' },
  'subscription.paused': { intent: 'revoke', status: 'canceled' },
  'refund.created': { intent: 'revoke', status: 'canceled' },
  'dispute.created': { intent: 'revoke', status: 'canceled' },
}

/** Events we understand. Anything else is acknowledged and ignored. */
export function isKnownEventType(type: string): boolean {
  return type in INTENTS
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** Reads `field` as a string, or as `{ id }` when the provider expanded it. */
function idOf(value: unknown): string | null {
  if (typeof value === 'string') return value || null
  const record = asRecord(value)
  const id = record?.['id']
  return typeof id === 'string' && id ? id : null
}

function stringOf(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

/**
 * Digs the Supabase user id out of wherever this event carries it.
 *
 * `metadata.user_id` is what `createCheckout` sets and what the subscription
 * keeps across renewals. The nested lookups matter because a renewal event is
 * shaped differently from the checkout that created it — the subscription is
 * top-level on one and nested on the other.
 */
export function readUserId(data: Record<string, unknown>): string | null {
  const candidates = [
    asRecord(data['metadata']),
    asRecord(asRecord(data['subscription'])?.['metadata']),
    asRecord(asRecord(data['checkout'])?.['metadata']),
    asRecord(asRecord(data['order'])?.['metadata']),
  ]
  for (const metadata of candidates) {
    const value = metadata?.['user_id']
    if (typeof value === 'string' && value) return value
  }
  return null
}

/**
 * Turns a verified payload into a `BillingEvent`, or null when the event is one
 * we do not act on.
 *
 * Returning null rather than throwing is deliberate: an unrecognised event is
 * a 200 and a shrug, because the alternative is the provider retrying a
 * `license.created` five times and then emailing about a failing endpoint.
 */
export function toBillingEvent(payload: unknown, receivedAt: number): BillingEvent | null {
  const root = asRecord(payload)
  if (!root) return null

  const type = stringOf(root['type']) ?? stringOf(root['eventType'])
  if (!type) return null

  const mapped = INTENTS[type]
  if (!mapped) return null

  const data = asRecord(root['object']) ?? asRecord(root['data']) ?? {}
  // On a checkout the subscription hangs off the payload; on a subscription
  // event the payload is the subscription.
  const subscription = asRecord(data['subscription']) ?? data

  const createdAt = root['created_at']
  const occurredAt =
    typeof createdAt === 'number'
      // Providers send seconds or milliseconds depending on the event. Anything
      // below this threshold is seconds — it is the year 2001 in milliseconds.
      ? (createdAt < 1e12 ? createdAt * 1000 : createdAt)
      : receivedAt

  return {
    eventId: stringOf(root['id']),
    type,
    intent: mapped.intent,
    status: mapped.status,
    occurredAt,
    userId: readUserId(data),
    providerCustomerId: idOf(subscription['customer']) ?? idOf(data['customer']),
    providerSubscriptionId:
      idOf(data['subscription']) ?? (subscription === data ? idOf(data['id']) : null),
    productId: idOf(subscription['product']) ?? idOf(data['product']),
    currentPeriodEnd: stringOf(subscription['current_period_end_date']),
    cancelAtPeriodEnd: type === 'subscription.scheduled_cancel',
  }
}

/**
 * Whether an arriving event should be applied over what is already stored.
 *
 * The provider retries an unacknowledged event at 30 seconds, 5 minutes, 30
 * minutes and 6 hours, and a retry can land *after* a newer event has already
 * been applied. Without this, a delayed `subscription.paid` retry can reinstate
 * a plan that a later `dispute.created` revoked.
 *
 * Equal timestamps re-apply. Applying is idempotent, and refusing them would
 * drop the second of two events genuinely issued in the same second.
 */
export function shouldApply(storedOccurredAt: number | null, incomingOccurredAt: number): boolean {
  if (storedOccurredAt === null) return true
  return incomingOccurredAt >= storedOccurredAt
}

/** The plan an event leaves the account on. Revocation always lands on free. */
export function resolvedPlan(event: BillingEvent, purchased: Plan | null): Plan | null {
  if (event.intent === 'revoke') return 'free'
  if (event.intent === 'record') return null
  return purchased
}
