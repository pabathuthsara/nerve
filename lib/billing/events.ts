/**
 * Merchant-of-record events, normalised (§14).
 *
 * The provider's vocabulary stops here. Everything downstream reads a
 * `BillingEvent`, which names what happened to *access* rather than what
 * happened at the vendor — so swapping merchant of record is an adapter and a
 * migration, not a rewrite of the entitlement logic (§14). That claim was
 * tested on 1 September, when Creem declined the account: this file and its
 * table changed, and nothing downstream of it did.
 *
 * These are pure functions over a parsed payload, tested directly, for the
 * same reason `lib/data/rep-rules.ts` and `lib/safety/assess.ts` are: the
 * decision about whether somebody keeps a plan they paid for should be
 * arguable in a test file, not buried in a route handler.
 *
 * ── THE SHAPE WHOP ACTUALLY SENDS ────────────────────────────────────────
 *
 * The envelope is `{ id, type, timestamp, account_id, data }`, and `data` is
 * the full object the event is about. Which object that is varies, and this is
 * the whole reason the reads below are not simple field accesses:
 *
 *   `membership.*`   `data` IS the membership: `id` is the `mem_`, and the
 *                    plan, product and user arrive as **flat ids** —
 *                    `plan_id`, `product_id`, `user_id` — with the period on
 *                    `current_period_end`. Only these events carry a period.
 *   `payment.*`      `data` is the PAYMENT: `id` is a `pay_`, and the
 *                    membership hangs off it as `data.membership`. No period.
 *   `refund.created` `data` is the refund and everything useful — metadata,
 *   `dispute.created` membership, user — is one level down on `data.payment`.
 *   `invoice.past_due` `data.user` and `data.current_plan`, and `data.payment`
 *                    is a bare id.
 *
 * So the reads walk `data.payment ?? data` and then fall back to `data`, which
 * covers all four shapes without a branch per event type.
 *
 * ── AND THE SPEC IS NOT THE PAYLOAD ──────────────────────────────────────
 *
 * The two families disagree about how they name the same things, and the
 * OpenAPI specification documents only one of them. `payment.*` nests `plan`,
 * `user` and `membership` as objects, exactly as documented. **`membership.*`
 * does not**: it sends `plan_id`, `product_id`, `user_id` and
 * `current_period_end` as flat scalars, and carries no `renewal_period_end`,
 * no `plan` object and no `manage_url` at all.
 *
 * This was found the only way it could be — by reading the first real delivery
 * of a real purchase, on 2 September. Built against the specification alone,
 * `membership.activated` resolved no plan, failed closed, and was dropped;
 * `payment.succeeded` then created the row without a period, so the account got
 * Pro with no charge date on it. The subscription screen would have said
 * "nothing renews and nothing is charged" to somebody whose card was about to
 * be charged in seven days — §14's trial-ending-quietly failure exactly.
 *
 * So every id below is read in **both** spellings. `events.test.ts` pins the
 * real captured payloads of both events, verbatim, so this cannot regress into
 * whichever shape the next API version prefers.
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
  /** The provider's event id (`msg_…`). Used for the log, not for logic. */
  eventId: string | null
  /** Provider event name, kept verbatim so an unmapped one is still legible. */
  type: string
  intent: BillingIntent
  status: SubscriptionStatus
  /** When the provider says it happened, in epoch milliseconds. */
  occurredAt: number
  /** Supabase user id, when the payload carries one. */
  userId: string | null
  /** Whop's own user (`user_…`) — the buyer, not the account. */
  providerCustomerId: string | null
  /** The membership (`mem_…`). The subscription, in Whop's noun. */
  providerSubscriptionId: string | null
  /** The purchased `plan_…`, resolved to a plan by `lib/billing/plans.ts`. */
  planId: string | null
  /**
   * When the current period ends, or null when this event does not say.
   *
   * Null is meaningfully different from a date and `applyBillingEvent` treats
   * it that way: only membership events carry `renewal_period_end`, so a
   * renewal `payment.succeeded` arriving with nothing must leave the stored
   * date alone rather than blank the renewal line on the subscription screen.
   */
  currentPeriodEnd: string | null
  /**
   * Whether renewal is already scheduled to stop, or null when this event does
   * not say.
   *
   * Same reasoning as `currentPeriodEnd`, and the same bug avoided: only
   * membership events carry the flag, so a `payment.failed` arriving after a
   * cancellation must not read a missing field as `false` and quietly un-cancel
   * the subscription on the screen.
   */
  cancelAtPeriodEnd: boolean | null
  /** Whop's own page for the card and the invoices, when the payload has one. */
  manageUrl: string | null
}

/**
 * How each provider event maps to access.
 *
 * Two of these are product decisions rather than transcriptions:
 *
 *   `past_due` **keeps access**. Whop retries a failed payment twelve times
 *   over about three days and most recover; cutting somebody off at the first
 *   failed retry punishes a card that expired on a Tuesday. The status is
 *   recorded so dunning can see it, and `membership.deactivated` is what
 *   actually revokes.
 *
 *   `dispute.created` **revokes immediately**, unlike a refund's grace. A
 *   chargeback is money already clawed back and, per §14, an account that
 *   keeps its plan through a dispute is the pattern that gets a merchant
 *   account closed.
 *
 * `readStatus` marks the events whose payload is allowed to refine the status.
 * See `narrowStatus` for why that is a short list.
 */
const INTENTS: Record<
  string,
  { intent: BillingIntent; status: SubscriptionStatus; readStatus?: boolean }
> = {
  // The primary grant. Fires at trial start carrying `trialing`, and again
  // when a membership comes back — so the status is read, never assumed.
  'membership.activated': { intent: 'grant', status: 'active', readStatus: true },
  // Renewals, and the trial's first real charge.
  'payment.succeeded': { intent: 'grant', status: 'active', readStatus: true },
  // Whop hands us one of §8's three trial mitigations for free.
  'membership.trial_ending_soon': { intent: 'record', status: 'trialing', readStatus: true },
  // Scheduled, not done: they keep what they paid for until the period ends.
  'membership.cancel_at_period_end_changed': { intent: 'record', status: 'active', readStatus: true },
  'membership.deactivated': { intent: 'revoke', status: 'canceled' },
  'payment.failed': { intent: 'record', status: 'past_due' },
  'invoice.past_due': { intent: 'record', status: 'past_due' },
  'refund.created': { intent: 'revoke', status: 'canceled' },
  'dispute.created': { intent: 'revoke', status: 'canceled' },
}

/** Whop's membership status enum, narrowed onto the one this database stores. */
function narrowStatus(raw: string | null): SubscriptionStatus | null {
  switch (raw) {
    case 'trialing':
      return 'trialing'
    case 'active':
    // A membership scheduled to cancel still HAS access, which is the whole
    // point of `cancel_at_period_end`. `canceling` is a pending state, not an
    // ended one, and reading it as canceled would cut somebody off from the
    // days they have already paid for.
    case 'canceling':
      return 'active'
    case 'past_due':
      return 'past_due'
    case 'canceled':
    case 'expired':
    case 'completed':
      return 'canceled'
    case 'drafted':
    case 'unresolved':
      return 'incomplete'
    default:
      return null
  }
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

/** Reads `field` as a string, or as `{ id }` when the provider nested it. */
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
 * The account the event belongs to, as the envelope names it.
 *
 * Both spellings are read because Whop renamed the field: a webhook pinned to
 * `2026-08-14` or later sends `account_id`, and one pinned earlier — or with no
 * pin at all — still sends `company_id`. Reading only the new name would make
 * the route's account check refuse every event from an unpinned webhook, which
 * is a silent outage rather than a loud one.
 */
export function readAccountId(payload: unknown): string | null {
  const root = asRecord(payload)
  if (!root) return null
  return stringOf(root['account_id']) ?? stringOf(root['company_id'])
}

/**
 * The membership status, read from wherever this event's shape keeps it.
 *
 * Deliberately not `data.status`. On a payment event that field is the
 * PAYMENT's status — `succeeded`, `failed` — and reading it as a membership
 * status would silently produce nonsense; the membership's own status hangs off
 * `data.membership`. On a membership event `data` is the membership and the
 * field is the right one.
 */
function membershipStatus(data: Record<string, unknown>, type: string): string | null {
  const nested = asRecord(data['membership'])
  if (nested) return stringOf(nested['status'])
  if (type.startsWith('membership.')) return stringOf(data['status'])
  return null
}

/**
 * Digs the Supabase user id out of wherever this event carries it.
 *
 * `metadata.user_id` is what `createCheckout` sets on the checkout
 * configuration, and Whop copies that metadata onto both the payment and the
 * membership — so one lookup covers every event that has it at all. The nested
 * `payment` lookup is for refunds, where the refund itself carries no metadata
 * and the payment it reverses does.
 */
export function readUserId(data: Record<string, unknown>): string | null {
  const candidates = [
    asRecord(data['metadata']),
    asRecord(asRecord(data['payment'])?.['metadata']),
    asRecord(asRecord(data['membership'])?.['metadata']),
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
 * a 200 and a shrug, because the alternative is Whop retrying a
 * `chat.message.created` twelve times over three days and then disabling the
 * endpoint for consecutive failures.
 */
export function toBillingEvent(payload: unknown, receivedAt: number): BillingEvent | null {
  const root = asRecord(payload)
  if (!root) return null

  const type = stringOf(root['type'])
  if (!type) return null

  const mapped = INTENTS[type]
  if (!mapped) return null

  const data = asRecord(root['data']) ?? {}
  // Refunds and disputes describe a payment; everything useful is one level
  // down on it. For every other shape this is `data` itself.
  const subject = asRecord(data['payment']) ?? data

  // ISO 8601, always. The seconds-versus-milliseconds coercion Creem needed is
  // gone with Creem.
  const parsed = Date.parse(stringOf(root['timestamp']) ?? '')
  const occurredAt = Number.isNaN(parsed) ? receivedAt : parsed

  const payloadStatus = mapped.readStatus ? narrowStatus(membershipStatus(data, type)) : null

  return {
    eventId: stringOf(root['id']),
    type,
    intent: mapped.intent,
    status: payloadStatus ?? mapped.status,
    occurredAt,
    userId: readUserId(data),
    // `user` (payment shape) or `user_id` (membership shape). Never
    // `metadata.user_id`, which is OUR id and is read by `readUserId`.
    providerCustomerId:
      idOf(subject['user']) ?? stringOf(subject['user_id'])
      ?? idOf(data['user']) ?? stringOf(data['user_id']) ?? idOf(data['member']),
    providerSubscriptionId:
      idOf(subject['membership']) ?? stringOf(subject['membership_id'])
      ?? (type.startsWith('membership.') ? stringOf(data['id']) : null),
    planId:
      idOf(subject['plan']) ?? stringOf(subject['plan_id'])
      ?? idOf(data['plan']) ?? stringOf(data['plan_id']) ?? idOf(data['current_plan']),
    // Only a membership carries a period, and it spells it `current_period_end`
    // in the shape actually sent and `renewal_period_end` in the one the
    // specification documents. Null on payment, refund, dispute and invoice
    // events, where `applyBillingEvent` keeps the stored date instead.
    currentPeriodEnd:
      stringOf(data['renewal_period_end']) ?? stringOf(data['current_period_end']),
    cancelAtPeriodEnd:
      typeof data['cancel_at_period_end'] === 'boolean' ? data['cancel_at_period_end'] : null,
    manageUrl: stringOf(data['manage_url']),
  }
}

/**
 * Whether an arriving event should be applied over what is already stored.
 *
 * Whop delivers at least once, does not guarantee order, and retries an
 * unacknowledged event twelve times across roughly seventy-one hours — so a
 * retry can land *after* a newer event has already been applied. Without this,
 * a delayed `payment.succeeded` retry can reinstate a plan that a later
 * `dispute.created` revoked.
 *
 * Equal timestamps re-apply. Applying is idempotent, and refusing them would
 * drop the second of two events genuinely issued in the same millisecond.
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
