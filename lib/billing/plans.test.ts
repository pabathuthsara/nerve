import { describe, expect, it } from 'vitest'
import { OFFERS } from '@/lib/site/plans'
import {
  LIVE_API_BASE,
  SANDBOX_API_BASE,
  apiBase,
  billingEnvironmentRefusal,
  checkoutConfigured,
  isLiveBase,
  planForWhopPlan,
  planMap,
  rehearsing,
  takingRealPayments,
  whopPlanIdFor,
} from './plans'

const ENV = {
  WHOP_PLAN_PRO: 'plan_pro_1',
  WHOP_PLAN_PRO_WEEKLY: 'plan_pro_week_1',
  WHOP_PLAN_ELITE: 'plan_elite_1',
}

/** Everything a deployment needs to sell, minus the base URL. */
const WIRED = { ...ENV, WHOP_API_KEY: 'whop_key_abc', WHOP_ACCOUNT_ID: 'biz_1' }
const LIVE = { ...WIRED, WHOP_API_BASE: LIVE_API_BASE }
const SANDBOX = { ...WIRED, WHOP_API_BASE: SANDBOX_API_BASE }

describe('planMap', () => {
  it('maps each configured vendor plan to the plan it grants', () => {
    // Several vendor plans resolve to ONE of ours. That is the periods model:
    // a weekly Pro and a monthly Pro are the same entitlement, so nothing
    // downstream of here — applyBillingEvent, reps_per_day, the spend cap —
    // needs to know a billing period exists at all.
    expect(planMap(ENV)).toEqual({
      plan_pro_1: 'pro',
      plan_pro_week_1: 'pro',
      plan_elite_1: 'elite',
    })
  })

  it('leaves out a plan whose variable is unset or blank', () => {
    expect(planMap({ WHOP_PLAN_PRO: 'plan_pro_1' })).toEqual({ plan_pro_1: 'pro' })
    expect(planMap({ WHOP_PLAN_PRO: '   ' })).toEqual({})
  })

  it('trims a variable padded by a careless paste', () => {
    expect(planMap({ WHOP_PLAN_PRO: ' plan_pro_1 ' })).toEqual({ plan_pro_1: 'pro' })
  })
})

describe('planForWhopPlan', () => {
  const map = planMap(ENV)

  it('resolves a known plan', () => {
    expect(planForWhopPlan('plan_pro_1', map)).toBe('pro')
    expect(planForWhopPlan('plan_elite_1', map)).toBe('elite')
  })

  it('grants nothing for a plan no variable names', () => {
    // Fails closed on purpose: the other reading of a typo'd variable is free
    // Elite for anyone who finds the checkout link.
    expect(planForWhopPlan('plan_someone_elses', map)).toBeNull()
    expect(planForWhopPlan(null, map)).toBeNull()
  })

  it('grants nothing when nothing is configured', () => {
    expect(planForWhopPlan('plan_pro_1', planMap({}))).toBeNull()
  })
})

describe('whopPlanIdFor', () => {
  it('returns the configured vendor plan, monthly by default', () => {
    expect(whopPlanIdFor('pro', 'monthly', ENV)).toBe('plan_pro_1')
    expect(whopPlanIdFor('pro', undefined, ENV)).toBe('plan_pro_1')
  })

  it('resolves the weekly offer to its own vendor plan', () => {
    // The whole point of the period model: one Plan, several vendor plans.
    expect(whopPlanIdFor('pro', 'weekly', ENV)).toBe('plan_pro_week_1')
    expect(whopPlanIdFor('pro', 'weekly', ENV)).not.toBe(whopPlanIdFor('pro', 'monthly', ENV))
  })

  it('refuses a period a plan is not sold on', () => {
    // Elite is monthly only, and a checkout that silently opened a monthly
    // Elite for somebody who clicked weekly would be charging the wrong price.
    expect(() => whopPlanIdFor('elite', 'weekly', ENV)).toThrow('not sold by the week')
  })

  it('names the missing variable rather than failing quietly', () => {
    expect(() => whopPlanIdFor('elite', 'monthly', { WHOP_PLAN_PRO: 'plan_pro_1' })).toThrow(
      'WHOP_PLAN_ELITE is not set',
    )
  })
})

describe('the mapping covers what is actually sold', () => {
  it('has a plan variable for every paid plan on the pricing page', () => {
    // Guards the drift where a fourth plan is authored in lib/site/plans.ts and
    // nobody adds the variable that would let anyone buy it.
    for (const offer of OFFERS) {
      expect(() => whopPlanIdFor(offer.plan, offer.period, ENV)).not.toThrow()
    }
  })
})

describe('the base URL is the whole environment discriminator', () => {
  it('defaults to live when nothing is set', () => {
    // Whop's keys carry no test/live prefix, so an unset base has to mean the
    // real host — the alternative is a deployment that quietly believes it is a
    // sandbox and refuses to sell.
    expect(apiBase({})).toBe(LIVE_API_BASE)
    expect(isLiveBase({})).toBe(true)
  })

  it('reads the sandbox host as not live', () => {
    expect(isLiveBase(SANDBOX)).toBe(false)
  })

  it('tolerates a trailing slash and a changed path', () => {
    // Matched on the host, so a paste with a trailing slash or a future path
    // change cannot turn a live deployment into one this file thinks is a
    // sandbox — which is the direction of this check that hands out real plans.
    expect(isLiveBase({ WHOP_API_BASE: 'https://api.whop.com/api/v1/' })).toBe(true)
    expect(isLiveBase({ WHOP_API_BASE: 'https://api.whop.com/api/v2' })).toBe(true)
    expect(apiBase({ WHOP_API_BASE: 'https://api.whop.com/api/v1/' })).toBe(LIVE_API_BASE)
  })

  it('treats an unparseable base as not live rather than guessing', () => {
    expect(isLiveBase({ WHOP_API_BASE: 'api.whop.com' })).toBe(false)
    expect(isLiveBase({ WHOP_API_BASE: 'https://api.whop.com.evil.test/api/v1' })).toBe(false)
  })
})

describe('checkoutConfigured', () => {
  it('is true only when every paid plan can actually be sold', () => {
    expect(checkoutConfigured(SANDBOX)).toBe(true)
  })

  it('refuses a half-configured deployment rather than selling one plan of two', () => {
    // A screen showing both plans with only one of them working is a support
    // ticket disguised as a feature.
    expect(checkoutConfigured({ ...SANDBOX, WHOP_PLAN_ELITE: undefined })).toBe(false)
    expect(checkoutConfigured({ ...SANDBOX, WHOP_API_KEY: undefined })).toBe(false)
    expect(checkoutConfigured({})).toBe(false)
  })

  it('refuses a deployment that cannot recognise its own account', () => {
    // Every event is checked against WHOP_ACCOUNT_ID before it is applied, so a
    // deployment without one has no business selling either.
    expect(checkoutConfigured({ ...SANDBOX, WHOP_ACCOUNT_ID: undefined })).toBe(false)
  })

  it('treats whitespace as unset, because a blank env var is a blank env var', () => {
    expect(checkoutConfigured({ ...SANDBOX, WHOP_API_KEY: '  ' })).toBe(false)
  })
})

describe('the sandbox never sells in production', () => {
  it('refuses a fully configured SANDBOX base on a production deployment', () => {
    // The failure this prevents is silent and total: the sandbox accepts any
    // card, emits the same correctly signed webhooks, and `applyBillingEvent`
    // grants a real paid plan against a payment that never happened.
    expect(checkoutConfigured({ ...SANDBOX, VERCEL_ENV: 'production' })).toBe(false)
    expect(checkoutConfigured({ ...SANDBOX, NODE_ENV: 'production' })).toBe(false)
  })

  it('allows the LIVE base in production', () => {
    expect(checkoutConfigured({ ...LIVE, VERCEL_ENV: 'production' })).toBe(true)
  })

  it('still allows the sandbox everywhere the sandbox belongs', () => {
    // A preview deployment is NODE_ENV=production too, and a preview is exactly
    // where the sandbox should be exercised — so VERCEL_ENV wins where it exists.
    expect(checkoutConfigured({ ...SANDBOX, VERCEL_ENV: 'preview', NODE_ENV: 'production' })).toBe(true)
    expect(checkoutConfigured({ ...SANDBOX, VERCEL_ENV: 'development' })).toBe(true)
    expect(checkoutConfigured(SANDBOX)).toBe(true)
  })

  it('refuses an unrecognised base in production rather than guessing', () => {
    expect(checkoutConfigured({ ...WIRED, WHOP_API_BASE: 'https://staging.whop.test/api/v1', VERCEL_ENV: 'production' }))
      .toBe(false)
  })
})

describe('production refuses to grant plans from a non-live environment', () => {
  it('lets any environment through outside production', () => {
    // Local and preview deployments are where the sandbox is meant to be
    // exercised, so nothing is refused there.
    expect(billingEnvironmentRefusal(SANDBOX)).toBeNull()
    expect(billingEnvironmentRefusal({ ...SANDBOX, VERCEL_ENV: 'preview' })).toBeNull()
    expect(billingEnvironmentRefusal({})).toBeNull()
  })

  it('refuses a sandbox base in production', () => {
    // The hole this closes: the webhook only checks the signature, and the
    // sandbox signs its events too. A sandbox webhook aimed at production with
    // the sandbox secret in its environment would grant real plans for payments
    // made with a fake card — and the sandbox has public hosted checkout pages.
    expect(billingEnvironmentRefusal({ ...SANDBOX, VERCEL_ENV: 'production' }))
      .toMatch(/not the live Whop API/)
  })

  it('refuses production with no key at all rather than assuming live', () => {
    expect(billingEnvironmentRefusal({ VERCEL_ENV: 'production' })).toMatch(/no WHOP_API_KEY/)
  })

  it('allows the live base in production', () => {
    expect(billingEnvironmentRefusal({ ...LIVE, VERCEL_ENV: 'production' })).toBeNull()
  })
})

describe('the sanctioned rehearsal on a production domain', () => {
  const SANDBOX_PROD = { ...SANDBOX, VERCEL_ENV: 'production' }

  it('is off unless something explicitly turns it on', () => {
    // The safe default is the absence of a variable. Nobody reaches this state
    // by copying a key from one environment to another.
    expect(rehearsing({})).toBe(false)
    expect(rehearsing({ WHOP_TEST_MODE_IN_PRODUCTION: '' })).toBe(false)
    expect(rehearsing({ WHOP_TEST_MODE_IN_PRODUCTION: '0' })).toBe(false)
    expect(rehearsing({ WHOP_TEST_MODE_IN_PRODUCTION: 'false' })).toBe(false)
    expect(checkoutConfigured(SANDBOX_PROD)).toBe(false)
    expect(billingEnvironmentRefusal(SANDBOX_PROD)).toMatch(/not the live Whop API/)
  })

  it('opens both gates when it is on, and only then', () => {
    const on = { ...SANDBOX_PROD, WHOP_TEST_MODE_IN_PRODUCTION: '1' }
    expect(rehearsing(on)).toBe(true)
    expect(checkoutConfigured(on)).toBe(true)
    expect(billingEnvironmentRefusal(on)).toBeNull()
    for (const truthy of ['1', 'true', 'TRUE', 'on']) {
      expect(rehearsing({ WHOP_TEST_MODE_IN_PRODUCTION: truthy }), truthy).toBe(true)
    }
  })

  it('never claims to be taking real money while it is on', () => {
    // What the banner keys off. A rehearsal is theatre however production the
    // domain is, and the screen has to admit that to whoever finds it.
    expect(takingRealPayments({ ...SANDBOX_PROD, WHOP_TEST_MODE_IN_PRODUCTION: '1' })).toBe(false)
    expect(takingRealPayments(SANDBOX)).toBe(false)
    expect(takingRealPayments({})).toBe(false)
    expect(takingRealPayments(LIVE)).toBe(true)
  })

  it('does not weaken the live path it exists alongside', () => {
    // Turning the flag on must not make a LIVE deployment behave differently,
    // or the rehearsal switch becomes a thing nobody remembers to remove.
    const liveWithFlag = { ...LIVE, VERCEL_ENV: 'production', WHOP_TEST_MODE_IN_PRODUCTION: '1' }
    expect(checkoutConfigured(liveWithFlag)).toBe(true)
    expect(billingEnvironmentRefusal(liveWithFlag)).toBeNull()
    expect(takingRealPayments(liveWithFlag)).toBe(true)
  })
})
