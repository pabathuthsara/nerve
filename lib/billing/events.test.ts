import { describe, expect, it } from 'vitest'
import {
  isKnownEventType,
  readUserId,
  resolvedPlan,
  shouldApply,
  toBillingEvent,
  type BillingEvent,
} from './events'

const USER = '11111111-2222-3333-4444-555555555555'

function payload(type: string, object: Record<string, unknown> = {}, createdAt?: number) {
  return {
    id: 'evt_1',
    type,
    ...(createdAt === undefined ? {} : { created_at: createdAt }),
    object: {
      id: 'sub_1',
      customer: 'cust_1',
      product: 'prod_pro',
      metadata: { user_id: USER },
      current_period_end_date: '2026-09-30T12:32:00.755Z',
      ...object,
    },
  }
}

describe('toBillingEvent', () => {
  it('reads a subscription.paid into a grant', () => {
    const event = toBillingEvent(payload('subscription.paid'), 1_000)
    expect(event).toMatchObject({
      type: 'subscription.paid',
      intent: 'grant',
      status: 'active',
      userId: USER,
      providerCustomerId: 'cust_1',
      providerSubscriptionId: 'sub_1',
      productId: 'prod_pro',
      currentPeriodEnd: '2026-09-30T12:32:00.755Z',
    })
  })

  it('ignores an event it does not act on', () => {
    expect(toBillingEvent(payload('license.created'), 1_000)).toBeNull()
    expect(isKnownEventType('license.created')).toBe(false)
  })

  it('ignores a payload with no type at all', () => {
    expect(toBillingEvent({ object: {} }, 1_000)).toBeNull()
    expect(toBillingEvent(null, 1_000)).toBeNull()
    expect(toBillingEvent('subscription.paid', 1_000)).toBeNull()
  })

  it('expands a nested customer or product object', () => {
    const event = toBillingEvent(
      payload('subscription.active', { customer: { id: 'cust_2' }, product: { id: 'prod_elite' } }),
      1_000,
    )
    expect(event?.providerCustomerId).toBe('cust_2')
    expect(event?.productId).toBe('prod_elite')
  })

  it('finds the subscription hanging off a checkout', () => {
    const event = toBillingEvent(
      {
        id: 'evt_2',
        type: 'checkout.completed',
        object: {
          id: 'ch_1',
          metadata: { user_id: USER },
          subscription: {
            id: 'sub_9',
            customer: 'cust_9',
            product: 'prod_pro',
            current_period_end_date: '2026-10-01T00:00:00.000Z',
          },
        },
      },
      1_000,
    )
    expect(event?.providerSubscriptionId).toBe('sub_9')
    expect(event?.providerCustomerId).toBe('cust_9')
    expect(event?.currentPeriodEnd).toBe('2026-10-01T00:00:00.000Z')
  })

  it('treats a second-precision created_at as seconds', () => {
    // 1788178846 is a plausible epoch in seconds; as milliseconds it is 1970.
    const event = toBillingEvent(payload('subscription.paid', {}, 1_788_178_846), 1_000)
    expect(event?.occurredAt).toBe(1_788_178_846_000)
  })

  it('keeps a millisecond created_at as it is', () => {
    const event = toBillingEvent(payload('subscription.paid', {}, 1_788_178_846_000), 1_000)
    expect(event?.occurredAt).toBe(1_788_178_846_000)
  })

  it('falls back to the arrival time when the payload has no timestamp', () => {
    expect(toBillingEvent(payload('subscription.paid'), 4_242)?.occurredAt).toBe(4_242)
  })
})

describe('what each event does to access', () => {
  const intentOf = (type: string) => toBillingEvent(payload(type), 1_000)?.intent

  it('grants on the paid and active events', () => {
    expect(intentOf('subscription.paid')).toBe('grant')
    expect(intentOf('subscription.active')).toBe('grant')
    expect(intentOf('subscription.trialing')).toBe('grant')
    expect(intentOf('checkout.completed')).toBe('grant')
  })

  it('revokes on expiry, cancellation and pause', () => {
    expect(intentOf('subscription.expired')).toBe('revoke')
    expect(intentOf('subscription.canceled')).toBe('revoke')
    expect(intentOf('subscription.paused')).toBe('revoke')
  })

  it('revokes on a dispute, because a chargeback is money already gone (§14)', () => {
    expect(intentOf('dispute.created')).toBe('revoke')
    expect(intentOf('refund.created')).toBe('revoke')
  })

  it('keeps access through past_due, because the provider is still retrying', () => {
    // The product decision this file exists to make arguable: a card that
    // failed once is not a cancelled account.
    expect(intentOf('subscription.past_due')).toBe('record')
    expect(intentOf('subscription.unpaid')).toBe('record')
    expect(toBillingEvent(payload('subscription.past_due'), 1_000)?.status).toBe('past_due')
  })

  it('keeps access on a scheduled cancel until the period actually ends', () => {
    const event = toBillingEvent(payload('subscription.scheduled_cancel'), 1_000)
    expect(event?.intent).toBe('record')
    expect(event?.cancelAtPeriodEnd).toBe(true)
    expect(event?.status).toBe('active')
  })
})

describe('readUserId', () => {
  it('reads metadata off the object itself', () => {
    expect(readUserId({ metadata: { user_id: USER } })).toBe(USER)
  })

  it('reads metadata off a nested subscription, checkout or order', () => {
    expect(readUserId({ subscription: { metadata: { user_id: USER } } })).toBe(USER)
    expect(readUserId({ checkout: { metadata: { user_id: USER } } })).toBe(USER)
    expect(readUserId({ order: { metadata: { user_id: USER } } })).toBe(USER)
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
    // The failure this prevents: a delayed subscription.paid retry reinstating
    // a plan that a later dispute.created already revoked.
    expect(shouldApply(2_000, 1_000)).toBe(false)
  })

  it('re-applies an identical timestamp, because applying is idempotent', () => {
    expect(shouldApply(1_000, 1_000)).toBe(true)
  })
})

describe('resolvedPlan', () => {
  const event = (intent: BillingEvent['intent']): BillingEvent => ({
    eventId: 'evt_1',
    type: 't',
    intent,
    status: 'active',
    occurredAt: 0,
    userId: USER,
    providerCustomerId: null,
    providerSubscriptionId: null,
    productId: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
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

  it('grants nothing when the product did not map', () => {
    expect(resolvedPlan(event('grant'), null)).toBeNull()
  })
})
