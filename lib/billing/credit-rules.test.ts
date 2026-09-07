import { describe, expect, it } from 'vitest'
import { creditEffectFor, creditReference, grantExpiry } from './credit-rules'
import { toBillingEvent } from './events'
import { INTERVIEW_PACKS, PLAN_INTERVIEW_CREDITS, TRIAL_DAYS } from '@/lib/site/plans'

const USER = '11111111-2222-3333-4444-555555555555'
const ACCOUNT = 'biz_G4B33AGA0sWgzq'

function envelope(type: string, data: Record<string, unknown>, timestamp = '2026-09-07T10:00:00.000Z') {
  return { id: 'msg_1', type, api_version: 'v1', timestamp, account_id: ACCOUNT, data }
}

/**
 * A payment, in the shape the captured deliveries actually carry.
 *
 * Every field here is one the real `payment.succeeded` of 2 September has —
 * `data.membership.status`, `data.plan.id`, `data.metadata.user_id`,
 * `billing_reason` — rather than the flatter thing the specification suggests.
 * See `events.test.ts`, which pins that delivery verbatim.
 */
function payment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pay_1',
    status: 'paid',
    billing_reason: 'subscription_cycle',
    metadata: { user_id: USER },
    membership: { id: 'mem_1', status: 'active' },
    plan: { id: 'plan_pro_monthly' },
    product: { id: 'prod_nerve' },
    user: { id: 'user_buyer' },
    total: '19.0',
    ...overrides,
  }
}

const event = (type: string, data: Record<string, unknown>) => {
  const parsed = toBillingEvent(envelope(type, data), 1_000)
  if (!parsed) throw new Error(`${type} did not normalise`)
  return parsed
}

describe('a pack purchase', () => {
  const pack = INTERVIEW_PACKS.find((entry) => entry.id === 'pack5')!

  it('credits the pack once, on the payment', () => {
    const effect = creditEffectFor(event('payment.succeeded', payment({ id: 'pay_pack' })), { pack: 'pack5' })
    expect(effect).toEqual({
      kind: 'purchase',
      pack: 'pack5',
      credits: pack.credits,
      reference: 'pack:pay_pack',
    })
  })

  it('credits nothing on the membership event that arrives beside it', () => {
    /**
     * THE DOUBLE-GRANT THIS FILE EXISTS TO PREVENT.
     *
     * A one-time purchase emits `membership.activated` as well as
     * `payment.succeeded`, in the same second. Granting on both is the obvious
     * design and it hands out two packs for one charge.
     */
    const membership = {
      id: 'mem_pack',
      status: 'completed',
      metadata: { user_id: USER },
      plan_id: 'plan_pack_5',
      product_id: 'prod_nerve',
      user_id: 'user_buyer',
    }
    expect(creditEffectFor(event('membership.activated', membership), { pack: 'pack5' })).toBeNull()
  })

  it('never expires, because the database is what enforces that', () => {
    const effect = creditEffectFor(event('payment.succeeded', payment()), { pack: 'single' })
    // No `expiresAt` on a purchase effect at all — the field does not exist on
    // that variant, so `issueInterviewCredits` cannot be handed one by mistake
    // and the CHECK constraint is the second line rather than the first.
    expect(effect && 'expiresAt' in effect).toBe(false)
  })

  it('takes back what is left when the charge is reversed', () => {
    const refund = {
      id: 'ref_1',
      payment: { id: 'pay_pack', plan: { id: 'plan_pack_5' }, membership: { id: 'mem_pack' }, metadata: { user_id: USER } },
    }
    expect(creditEffectFor(event('refund.created', refund), { pack: 'pack5' })).toEqual({
      kind: 'revoke',
      pack: 'pack5',
      credits: pack.credits,
      reference: 'revoke:pay_pack',
    })
  })

  it('revokes on a chargeback as well as a refund', () => {
    const dispute = {
      id: 'dis_1',
      payment: { id: 'pay_pack', plan: { id: 'plan_pack_5' }, metadata: { user_id: USER } },
    }
    expect(creditEffectFor(event('dispute.created', dispute), { pack: 'pack12' })?.kind).toBe('revoke')
  })

  it('does nothing on a failed payment', () => {
    expect(creditEffectFor(event('payment.failed', payment({ status: 'open' })), { pack: 'single' })).toBeNull()
  })
})

describe('a subscription grant', () => {
  it('grants the plan its allotment on the payment that bought the period', () => {
    const effect = creditEffectFor(event('payment.succeeded', payment()), {
      plan: 'pro',
      periodEnd: '2026-10-07T10:00:00.000Z',
    })
    expect(effect).toMatchObject({
      kind: 'grant',
      plan: 'pro',
      credits: PLAN_INTERVIEW_CREDITS.pro,
      reference: 'grant:pay_1',
      expiresAt: '2026-10-07T10:00:00.000Z',
    })
  })

  it('grants Elite four', () => {
    expect(
      creditEffectFor(event('payment.succeeded', payment()), { plan: 'elite', periodEnd: '2099-01-01T00:00:00.000Z' }),
    ).toMatchObject({ credits: PLAN_INTERVIEW_CREDITS.elite })
  })

  it('grants nothing on membership.activated, so a trial gets one credit and not two', () => {
    /**
     * MEASURED, NOT ASSUMED. The captured `payment.succeeded` from the first
     * live purchase carries `total: "0.0"` and `billing_reason:
     * "subscription_create"` — Whop emits a real payment event for the $0
     * authorisation that starts a card-backed trial, alongside
     * `membership.activated`. Granting on both would double every trial.
     */
    const membership = {
      id: 'mem_1',
      status: 'trialing',
      metadata: { user_id: USER },
      plan_id: 'plan_pro_monthly',
      current_period_end: '2026-09-14T10:00:00.000Z',
    }
    expect(creditEffectFor(event('membership.activated', membership), { plan: 'pro' })).toBeNull()
  })

  it('gives a trialling payment the trial length when the period is not known yet', () => {
    // The two events race and the payment can win, in which case the mirror has
    // no period on it. A grant with no expiry is the one thing only a purchase
    // may be.
    const now = new Date('2026-09-07T10:00:00.000Z')
    const effect = creditEffectFor(
      event('payment.succeeded', payment({ total: '0.0', membership: { id: 'mem_1', status: 'trialing' } })),
      { plan: 'pro', periodEnd: null, now },
    )
    expect(effect).toMatchObject({
      expiresAt: new Date(now.getTime() + TRIAL_DAYS * 86_400_000).toISOString(),
    })
  })

  it('grants nothing on free', () => {
    expect(creditEffectFor(event('payment.succeeded', payment()), { plan: 'free' })).toBeNull()
  })

  it('grants nothing on an event that moved no money', () => {
    expect(creditEffectFor(event('membership.trial_ending_soon', {
      id: 'mem_1', status: 'trialing', metadata: { user_id: USER }, plan_id: 'plan_pro_monthly',
    }), { plan: 'pro' })).toBeNull()
  })

  it('is idempotent under replay, because the key is the payment', () => {
    // Whop redelivers an unacknowledged event twelve times across seventy-one
    // hours, carrying the same `pay_`. Eleven of those collide on the ledger's
    // unique index rather than granting eleven months of interviews.
    const first = creditEffectFor(event('payment.succeeded', payment()), { plan: 'pro', periodEnd: '2099-01-01T00:00:00.000Z' })
    const retry = creditEffectFor(event('payment.succeeded', payment()), { plan: 'pro', periodEnd: '2099-01-01T00:00:00.000Z' })
    expect(first?.reference).toBe(retry?.reference)
  })

  it('gives each renewal its own key, so a second month is a second credit', () => {
    const september = creditEffectFor(event('payment.succeeded', payment({ id: 'pay_sept' })), { plan: 'pro', periodEnd: '2099-01-01T00:00:00.000Z' })
    const october = creditEffectFor(event('payment.succeeded', payment({ id: 'pay_oct' })), { plan: 'pro', periodEnd: '2099-01-01T00:00:00.000Z' })
    expect(september?.reference).not.toBe(october?.reference)
  })
})

describe('a subscription lapsing', () => {
  const deactivated = {
    id: 'mem_1',
    status: 'expired',
    metadata: { user_id: USER },
    plan_id: 'plan_pro_monthly',
  }

  it('voids granted credits and names only the grant source', () => {
    /**
     * §5.5, and the sentence the terms will be quoted on: "a user who cancels
     * keeps every credit they paid for and loses only the ones this month's
     * subscription was handing them." The void names `grants` and nothing else,
     * which is that promise expressed as an argument rather than a comment —
     * `applyBillingEvent` passes `source: 'grant'` and no other source can be
     * reached from here.
     */
    const effect = creditEffectFor(event('membership.deactivated', deactivated), { plan: 'free' })
    expect(effect).toEqual({ kind: 'void-grants', reference: 'void:msg_1' })
  })

  it('voids on a dispute too, which revokes immediately', () => {
    expect(creditEffectFor(event('dispute.created', {
      id: 'dis_1', payment: { id: 'pay_1', plan: { id: 'plan_pro_monthly' }, metadata: { user_id: USER } },
    }), { plan: 'free' })).toMatchObject({ kind: 'void-grants' })
  })

  it('leaves the balance alone while a payment is merely retrying', () => {
    // `past_due` keeps access — Whop retries twelve times over three days and
    // most recover. Voiding the month's credits at the first failed retry would
    // punish a card that expired on a Tuesday.
    expect(creditEffectFor(event('payment.failed', payment({ status: 'open' })), { plan: 'pro' })).toBeNull()
  })
})

describe('grantExpiry', () => {
  const now = new Date('2026-09-07T10:00:00.000Z')

  it('prefers the period the provider states', () => {
    expect(grantExpiry({ plan: 'pro', periodEnd: '2026-10-01T00:00:00.000Z', trialing: false, now }))
      .toBe('2026-10-01T00:00:00.000Z')
  })

  it('ignores a period that has already passed, rather than issuing a dead credit', () => {
    // The renewal case: `payment.succeeded` carries no period and the mirror
    // still holds the old one, which is now. A grant born expired is a credit
    // somebody paid for and cannot spend.
    const expiry = grantExpiry({ plan: 'pro', periodEnd: '2026-09-06T00:00:00.000Z', trialing: false, now })
    expect(Date.parse(expiry)).toBeGreaterThan(now.getTime())
  })

  it('falls back to the longest period the plan is sold on', () => {
    // Pro is sold by the week and by the month and the payload does not say
    // which. Erring short would expire a monthly subscriber's credit
    // twenty-three days early; erring long costs at most one interview on an
    // account that has already been charged.
    expect(grantExpiry({ plan: 'pro', periodEnd: null, trialing: false, now }))
      .toBe(new Date(now.getTime() + 30 * 86_400_000).toISOString())
  })

  it('never returns null, because only a purchase may live forever', () => {
    for (const plan of ['pro', 'elite'] as const) {
      expect(grantExpiry({ plan, periodEnd: null, trialing: false, now })).toMatch(/^\d{4}-/)
    }
  })
})

describe('creditReference', () => {
  it('falls back through the ids that survive a retry', () => {
    const base = event('payment.succeeded', payment())
    expect(creditReference('grant', base)).toBe('grant:pay_1')
    expect(creditReference('grant', { ...base, paymentId: null })).toBe('grant:msg_1')
    expect(creditReference('grant', { ...base, paymentId: null, eventId: null }))
      .toBe(`grant:mem_1:${base.occurredAt}`)
  })
})
