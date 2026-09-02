import { describe, expect, it } from 'vitest'
import {
  isKnownEventType,
  readAccountId,
  readUserId,
  resolvedPlan,
  shouldApply,
  toBillingEvent,
  type BillingEvent,
} from './events'

const USER = '11111111-2222-3333-4444-555555555555'
const ACCOUNT = 'biz_G4B33AGA0sWgzq'
const PERIOD_END = '2026-09-08T04:12:01.591Z'

/** The envelope Whop wraps every event in. */
function envelope(type: string, data: Record<string, unknown>, timestamp = '2026-09-01T17:03:24.291Z') {
  return { id: 'msg_1', type, api_version: 'v1', timestamp, account_id: ACCOUNT, data }
}

/**
 * A membership, as `membership.*` events send it: `data` IS the membership, and
 * plan, product and user are nested objects rather than bare ids.
 */
function membership(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mem_1',
    status: 'active',
    metadata: { user_id: USER },
    plan: { id: 'plan_pro_1' },
    product: { id: 'prod_nerve' },
    user: { id: 'user_buyer', email: 'buyer@nerve.test' },
    cancel_at_period_end: false,
    renewal_period_end: PERIOD_END,
    manage_url: 'https://whop.com/orders/mem_1',
    ...overrides,
  }
}

/** A payment, as `payment.*` events send it: the membership hangs off it. */
function payment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pay_1',
    status: 'succeeded',
    metadata: { user_id: USER },
    membership: { id: 'mem_1', status: 'active' },
    plan: { id: 'plan_pro_1' },
    product: { id: 'prod_nerve' },
    user: { id: 'user_buyer' },
    ...overrides,
  }
}

describe('a membership activating', () => {
  it('grants the plan the membership names', () => {
    const event = toBillingEvent(envelope('membership.activated', membership()), 1_000)
    expect(event).toMatchObject({
      type: 'membership.activated',
      intent: 'grant',
      status: 'active',
      userId: USER,
      providerCustomerId: 'user_buyer',
      providerSubscriptionId: 'mem_1',
      planId: 'plan_pro_1',
      currentPeriodEnd: PERIOD_END,
      cancelAtPeriodEnd: false,
      manageUrl: 'https://whop.com/orders/mem_1',
    })
  })

  it('reads a card-backed trial as trialing, not active', () => {
    // The 1 September bug, and the reason this case is mandatory. Under Creem a
    // trialling checkout arrived as `checkout.completed`, which mapped to
    // `active`, so every trialling account was told its plan RENEWS on the day
    // its card is actually first CHARGED. Whop states the status outright — so
    // the mapping is easier and there is no excuse for getting it wrong twice.
    const event = toBillingEvent(
      envelope('membership.activated', membership({ status: 'trialing' })),
      1_000,
    )
    expect(event?.status).toBe('trialing')
    // Still a grant: a trial is Pro from the moment it starts.
    expect(event?.intent).toBe('grant')
    expect(event?.currentPeriodEnd).toBe(PERIOD_END)
  })

  it('goes back to active when the first real charge lands', () => {
    const event = toBillingEvent(envelope('payment.succeeded', payment()), 1_000)
    expect(event?.status).toBe('active')
    expect(event?.intent).toBe('grant')
  })

  it('reads a payment on a still-trialling membership as trialing', () => {
    // A payment's own `status` is `succeeded`, which is not a membership status
    // at all — the membership's is one level down. Reading the wrong one would
    // put nonsense in the mirror, and reading a fixed `active` would resurrect
    // the 1 September bug through a different door.
    const event = toBillingEvent(
      envelope('payment.succeeded', payment({ membership: { id: 'mem_1', status: 'trialing' } })),
      1_000,
    )
    expect(event?.status).toBe('trialing')
  })

  it('finds the membership hanging off a payment', () => {
    const event = toBillingEvent(envelope('payment.succeeded', payment()), 1_000)
    expect(event?.providerSubscriptionId).toBe('mem_1')
    expect(event?.planId).toBe('plan_pro_1')
  })

  it('says nothing about the period when the event does not carry one', () => {
    // Only a membership has `renewal_period_end`. A renewal `payment.succeeded`
    // must report null so `applyBillingEvent` keeps the stored date, rather
    // than blanking the renewal line on every renewal.
    const event = toBillingEvent(envelope('payment.succeeded', payment()), 1_000)
    expect(event?.currentPeriodEnd).toBeNull()
    expect(event?.cancelAtPeriodEnd).toBeNull()
  })
})

describe('a scheduled cancellation', () => {
  it('records rather than revokes, and keeps access', () => {
    // They keep what they paid for until the period actually ends. The
    // revocation is `membership.deactivated`, days or weeks later.
    const event = toBillingEvent(
      envelope('membership.cancel_at_period_end_changed', membership({ cancel_at_period_end: true })),
      1_000,
    )
    expect(event?.intent).toBe('record')
    expect(event?.cancelAtPeriodEnd).toBe(true)
    expect(event?.status).toBe('active')
  })

  it('keeps a trial trialing while it is being cancelled', () => {
    // Somebody cancelling on day three of a trial is still on a trial, and the
    // screen has to keep saying "your card is charged on the 8th unless you
    // cancel" rather than switching to "renews".
    const event = toBillingEvent(
      envelope('membership.cancel_at_period_end_changed', membership({ status: 'trialing', cancel_at_period_end: true })),
      1_000,
    )
    expect(event?.status).toBe('trialing')
  })

  it('reads a reversed cancellation as false rather than as silence', () => {
    const event = toBillingEvent(
      envelope('membership.cancel_at_period_end_changed', membership({ cancel_at_period_end: false })),
      1_000,
    )
    expect(event?.cancelAtPeriodEnd).toBe(false)
  })

  it('reads Whop`s pending `canceling` state as still having access', () => {
    const event = toBillingEvent(
      envelope('membership.cancel_at_period_end_changed', membership({ status: 'canceling', cancel_at_period_end: true })),
      1_000,
    )
    expect(event?.status).toBe('active')
    expect(event?.intent).toBe('record')
  })
})

describe('what each event does to access', () => {
  const intentOf = (type: string, data: Record<string, unknown>) =>
    toBillingEvent(envelope(type, data), 1_000)?.intent

  it('grants on activation and on a successful payment', () => {
    expect(intentOf('membership.activated', membership())).toBe('grant')
    expect(intentOf('payment.succeeded', payment())).toBe('grant')
  })

  it('revokes when the membership actually ends', () => {
    expect(intentOf('membership.deactivated', membership({ status: 'expired' }))).toBe('revoke')
  })

  it('revokes on a refund and on a dispute, because the money is gone (§14)', () => {
    expect(intentOf('refund.created', { id: 'ref_1', payment: payment() })).toBe('revoke')
    expect(intentOf('dispute.created', { id: 'dis_1', payment: payment(), plan: { id: 'plan_pro_1' } })).toBe('revoke')
  })

  it('keeps access through past_due, because the provider is still retrying', () => {
    // The product decision this file exists to make arguable: a card that
    // failed once is not a cancelled account. Whop retries twelve times over
    // roughly three days, and most of those recover.
    expect(intentOf('payment.failed', payment({ status: 'failed' }))).toBe('record')
    expect(intentOf('invoice.past_due', { id: 'inv_1', user: { id: 'user_buyer' }, current_plan: { id: 'plan_pro_1' } }))
      .toBe('record')
    expect(toBillingEvent(envelope('payment.failed', payment()), 1_000)?.status).toBe('past_due')
  })

  it('records the trial warning Whop hands us for free', () => {
    // One of §8's three mitigations, delivered rather than built.
    const event = toBillingEvent(
      envelope('membership.trial_ending_soon', membership({ status: 'trialing' })),
      1_000,
    )
    expect(event?.intent).toBe('record')
    expect(event?.status).toBe('trialing')
  })

  it('never lets the payload talk a revocation out of revoking', () => {
    // The load-bearing limit. A dispute is money already clawed back; a payload
    // still calling the membership active or trialing changes nothing (§14).
    const disputed = toBillingEvent(
      envelope('dispute.created', {
        id: 'dis_1',
        payment: payment({ membership: { id: 'mem_1', status: 'trialing' } }),
        plan: { id: 'plan_pro_1' },
      }),
      1_000,
    )
    expect(disputed?.intent).toBe('revoke')
    expect(disputed?.status).toBe('canceled')

    const dunning = toBillingEvent(
      envelope('payment.failed', payment({ membership: { id: 'mem_1', status: 'trialing' } })),
      1_000,
    )
    expect(dunning?.status).toBe('past_due')
  })
})

describe('the shapes that hide the useful fields one level down', () => {
  it('attributes a refund through the payment it reverses', () => {
    // A refund carries no metadata of its own; the payment it reverses does.
    const event = toBillingEvent(envelope('refund.created', { id: 'ref_1', payment: payment() }), 1_000)
    expect(event?.userId).toBe(USER)
    expect(event?.providerSubscriptionId).toBe('mem_1')
    expect(event?.providerCustomerId).toBe('user_buyer')
    expect(event?.planId).toBe('plan_pro_1')
  })

  it('attributes a dispute by provider ids when there is no metadata at all', () => {
    // A dispute's payment carries the membership and the user but no metadata,
    // so `resolveUserId` in apply.ts falls back to the mirror. That fallback is
    // only reachable if these two ids survive the parse.
    const event = toBillingEvent(
      envelope('dispute.created', {
        id: 'dis_1',
        payment: { id: 'pay_1', membership: { id: 'mem_1' }, user: { id: 'user_buyer' } },
        plan: { id: 'plan_pro_1' },
      }),
      1_000,
    )
    expect(event?.userId).toBeNull()
    expect(event?.providerSubscriptionId).toBe('mem_1')
    expect(event?.providerCustomerId).toBe('user_buyer')
    expect(event?.planId).toBe('plan_pro_1')
  })

  it('reads an invoice, which names the plan under a different key again', () => {
    const event = toBillingEvent(
      envelope('invoice.past_due', {
        id: 'inv_1',
        user: { id: 'user_buyer' },
        current_plan: { id: 'plan_pro_1' },
        payment: { id: 'pay_1' },
      }),
      1_000,
    )
    expect(event?.planId).toBe('plan_pro_1')
    expect(event?.providerCustomerId).toBe('user_buyer')
    // It names no membership, which is why apply.ts keeps the stored one.
    expect(event?.providerSubscriptionId).toBeNull()
  })
})

describe('the envelope', () => {
  it('reads an ISO timestamp into epoch milliseconds', () => {
    // Whop sends ISO 8601. The seconds-versus-milliseconds coercion Creem
    // needed went with Creem.
    const event = toBillingEvent(envelope('membership.activated', membership(), '2026-09-01T17:03:24.291Z'), 1_000)
    expect(event?.occurredAt).toBe(Date.parse('2026-09-01T17:03:24.291Z'))
  })

  it('falls back to the arrival time when the timestamp is missing or unparseable', () => {
    const missing = { id: 'msg_1', type: 'membership.activated', account_id: ACCOUNT, data: membership() }
    expect(toBillingEvent(missing, 4_242)?.occurredAt).toBe(4_242)
    expect(toBillingEvent(envelope('membership.activated', membership(), 'tuesday'), 4_242)?.occurredAt).toBe(4_242)
  })

  it('reads the account under either name Whop has used for it', () => {
    // A webhook pinned to 2026-08-14 or later sends `account_id`; one pinned
    // earlier, or with no pin at all, still sends `company_id`. Reading only the
    // new name would make the route refuse every event from an unpinned webhook.
    expect(readAccountId(envelope('membership.activated', membership()))).toBe(ACCOUNT)
    expect(readAccountId({ id: 'msg_1', type: 'x', company_id: ACCOUNT, data: {} })).toBe(ACCOUNT)
    expect(readAccountId({ id: 'msg_1', type: 'x', data: {} })).toBeNull()
    expect(readAccountId(null)).toBeNull()
  })

  it('ignores an event it does not act on', () => {
    expect(toBillingEvent(envelope('chat.message.created', { id: 'msg_x' }), 1_000)).toBeNull()
    expect(isKnownEventType('chat.message.created')).toBe(false)
    expect(isKnownEventType('membership.activated')).toBe(true)
  })

  it('ignores a payload with no type at all', () => {
    expect(toBillingEvent({ data: {} }, 1_000)).toBeNull()
    expect(toBillingEvent(null, 1_000)).toBeNull()
    expect(toBillingEvent('membership.activated', 1_000)).toBeNull()
  })
})

describe('readUserId', () => {
  it('reads metadata off the object itself', () => {
    expect(readUserId({ metadata: { user_id: USER } })).toBe(USER)
  })

  it('reads metadata off a nested payment or membership', () => {
    expect(readUserId({ payment: { metadata: { user_id: USER } } })).toBe(USER)
    expect(readUserId({ membership: { metadata: { user_id: USER } } })).toBe(USER)
  })

  it('returns null rather than guessing when there is no metadata', () => {
    expect(readUserId({})).toBeNull()
    expect(readUserId({ metadata: {} })).toBeNull()
    expect(readUserId({ metadata: { user_id: '' } })).toBeNull()
    expect(readUserId({ metadata: 'nope' })).toBeNull()
  })
})

describe('shouldApply', () => {
  it('applies anything when nothing is stored', () => {
    expect(shouldApply(null, 1)).toBe(true)
  })

  it('applies a newer event', () => {
    expect(shouldApply(1_000, 2_000)).toBe(true)
  })

  it('drops a retry that arrives after a newer event has landed', () => {
    // Whop does not guarantee order and retries for about seventy-one hours.
    // The failure this prevents: a delayed payment.succeeded retry reinstating
    // a plan that a later dispute.created already revoked.
    expect(shouldApply(2_000, 1_000)).toBe(false)
  })

  it('re-applies an identical timestamp, because applying is idempotent', () => {
    // A redelivery carries the same `webhook-id` and the same timestamp, and
    // upserting the same row twice grants the same plan twice.
    expect(shouldApply(1_000, 1_000)).toBe(true)
  })
})

describe('resolvedPlan', () => {
  const event = (intent: BillingEvent['intent']): BillingEvent => ({
    eventId: 'msg_1',
    type: 't',
    intent,
    status: 'active',
    occurredAt: 0,
    userId: USER,
    providerCustomerId: null,
    providerSubscriptionId: null,
    planId: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: null,
    manageUrl: null,
  })

  it('lands a grant on whatever was purchased', () => {
    expect(resolvedPlan(event('grant'), 'elite')).toBe('elite')
  })

  it('lands every revocation on free', () => {
    expect(resolvedPlan(event('revoke'), 'elite')).toBe('free')
  })

  it('moves nothing on a record-only event', () => {
    expect(resolvedPlan(event('record'), 'pro')).toBeNull()
  })

  it('grants nothing when the plan did not map', () => {
    expect(resolvedPlan(event('grant'), null)).toBeNull()
  })
})
