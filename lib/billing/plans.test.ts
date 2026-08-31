import { describe, expect, it } from 'vitest'
import { PUBLIC_PLANS } from '@/lib/site/plans'
import { billingEnvironmentRefusal, checkoutConfigured, planForProduct, productForPlan, productMap, rehearsing, takingRealPayments } from './plans'

const ENV = {
  CREEM_PRODUCT_PRO: 'prod_pro_1',
  CREEM_PRODUCT_ELITE: 'prod_elite_1',
}

describe('productMap', () => {
  it('maps each configured product to its plan', () => {
    expect(productMap(ENV)).toEqual({ prod_pro_1: 'pro', prod_elite_1: 'elite' })
  })

  it('leaves out a plan whose variable is unset or blank', () => {
    expect(productMap({ CREEM_PRODUCT_PRO: 'prod_pro_1' })).toEqual({ prod_pro_1: 'pro' })
    expect(productMap({ CREEM_PRODUCT_PRO: '   ' })).toEqual({})
  })

  it('trims a variable padded by a careless paste', () => {
    expect(productMap({ CREEM_PRODUCT_PRO: ' prod_pro_1 ' })).toEqual({ prod_pro_1: 'pro' })
  })
})

describe('planForProduct', () => {
  const map = productMap(ENV)

  it('resolves a known product', () => {
    expect(planForProduct('prod_pro_1', map)).toBe('pro')
    expect(planForProduct('prod_elite_1', map)).toBe('elite')
  })

  it('grants nothing for a product no variable names', () => {
    // Fails closed on purpose: the other reading of a typo'd variable is free
    // Elite for anyone who finds the checkout link.
    expect(planForProduct('prod_someone_elses', map)).toBeNull()
    expect(planForProduct(null, map)).toBeNull()
  })

  it('grants nothing when nothing is configured', () => {
    expect(planForProduct('prod_pro_1', productMap({}))).toBeNull()
  })
})

describe('productForPlan', () => {
  it('returns the configured product', () => {
    expect(productForPlan('pro', ENV)).toBe('prod_pro_1')
  })

  it('names the missing variable rather than failing quietly', () => {
    expect(() => productForPlan('elite', { CREEM_PRODUCT_PRO: 'prod_pro_1' })).toThrow(
      'CREEM_PRODUCT_ELITE is not set',
    )
  })
})

describe('the mapping covers what is actually sold', () => {
  it('has a product variable for every paid plan on the pricing page', () => {
    // Guards the drift where a fourth plan is authored in lib/site/plans.ts and
    // nobody adds the variable that would let anyone buy it.
    const paid = PUBLIC_PLANS.filter((plan) => plan.id !== 'free').map((plan) => plan.id)
    for (const plan of paid) {
      expect(() => productForPlan(plan as 'pro' | 'elite', ENV)).not.toThrow()
    }
  })
})

describe('checkoutConfigured', () => {
  it('is true only when every paid plan can actually be sold', () => {
    const full = { CREEM_API_KEY: 'creem_test_abc', CREEM_PRODUCT_PRO: 'prod_a', CREEM_PRODUCT_ELITE: 'prod_b' }
    expect(checkoutConfigured(full)).toBe(true)
  })

  it('refuses a half-configured deployment rather than selling one plan of two', () => {
    // A screen showing both plans with only one of them working is a support
    // ticket disguised as a feature.
    expect(checkoutConfigured({ CREEM_API_KEY: 'creem_test_abc', CREEM_PRODUCT_PRO: 'prod_a' })).toBe(false)
    expect(checkoutConfigured({ CREEM_PRODUCT_PRO: 'prod_a', CREEM_PRODUCT_ELITE: 'prod_b' })).toBe(false)
    expect(checkoutConfigured({})).toBe(false)
  })

  it('treats whitespace as unset, because a blank env var is a blank env var', () => {
    expect(checkoutConfigured({ CREEM_API_KEY: '  ', CREEM_PRODUCT_PRO: 'prod_a', CREEM_PRODUCT_ELITE: 'prod_b' }))
      .toBe(false)
  })
})

describe('a test key never sells in production', () => {
  const LIVE = { CREEM_API_KEY: 'creem_live_abc', CREEM_PRODUCT_PRO: 'prod_a', CREEM_PRODUCT_ELITE: 'prod_b' }
  const TEST = { CREEM_API_KEY: 'creem_test_abc', CREEM_PRODUCT_PRO: 'prod_a', CREEM_PRODUCT_ELITE: 'prod_b' }

  it('refuses a fully configured TEST key on a production deployment', () => {
    // The failure this prevents is silent and total: the sandbox accepts any
    // card, emits the same correctly signed webhooks, and `applyBillingEvent`
    // grants a real paid plan against a payment that never happened.
    expect(checkoutConfigured({ ...TEST, VERCEL_ENV: 'production' })).toBe(false)
    expect(checkoutConfigured({ ...TEST, NODE_ENV: 'production' })).toBe(false)
  })

  it('allows a LIVE key in production', () => {
    expect(checkoutConfigured({ ...LIVE, VERCEL_ENV: 'production' })).toBe(true)
  })

  it('still allows a test key everywhere a test key belongs', () => {
    // A preview deployment is NODE_ENV=production too, and a preview is exactly
    // where the sandbox should be exercised — so VERCEL_ENV wins where it exists.
    expect(checkoutConfigured({ ...TEST, VERCEL_ENV: 'preview', NODE_ENV: 'production' })).toBe(true)
    expect(checkoutConfigured({ ...TEST, VERCEL_ENV: 'development' })).toBe(true)
    expect(checkoutConfigured(TEST)).toBe(true)
  })

  it('refuses an unrecognised key prefix in production rather than guessing', () => {
    expect(checkoutConfigured({ ...TEST, CREEM_API_KEY: 'sk_something', VERCEL_ENV: 'production' })).toBe(false)
  })
})

describe('production refuses to grant plans from a non-live environment', () => {
  it('lets any environment through outside production', () => {
    // Local and preview deployments are where the sandbox is meant to be
    // exercised, so nothing is refused there.
    expect(billingEnvironmentRefusal({ CREEM_API_KEY: 'creem_test_abc' })).toBeNull()
    expect(billingEnvironmentRefusal({ CREEM_API_KEY: 'creem_test_abc', VERCEL_ENV: 'preview' })).toBeNull()
    expect(billingEnvironmentRefusal({})).toBeNull()
  })

  it('refuses a test key in production', () => {
    // The hole this closes: the webhook only checks the signature, and the test
    // host signs its events too. A test-mode webhook aimed at production with
    // the test secret in its environment would grant real plans for payments
    // made with a fake card — and test mode has public hosted payment links.
    expect(billingEnvironmentRefusal({ CREEM_API_KEY: 'creem_test_abc', VERCEL_ENV: 'production' }))
      .toMatch(/non-live/)
  })

  it('refuses production with no key at all rather than assuming live', () => {
    expect(billingEnvironmentRefusal({ VERCEL_ENV: 'production' })).toMatch(/no CREEM_API_KEY/)
  })

  it('allows a live key in production', () => {
    expect(billingEnvironmentRefusal({ CREEM_API_KEY: 'creem_live_abc', VERCEL_ENV: 'production' })).toBeNull()
  })
})

describe('the sanctioned rehearsal on a production domain', () => {
  const TEST_PROD = {
    CREEM_API_KEY: 'creem_test_abc',
    CREEM_PRODUCT_PRO: 'prod_a',
    CREEM_PRODUCT_ELITE: 'prod_b',
    VERCEL_ENV: 'production',
  }

  it('is off unless something explicitly turns it on', () => {
    // The safe default is the absence of a variable. Nobody reaches this state
    // by copying a key from one environment to another.
    expect(rehearsing({})).toBe(false)
    expect(rehearsing({ CREEM_TEST_MODE_IN_PRODUCTION: '' })).toBe(false)
    expect(rehearsing({ CREEM_TEST_MODE_IN_PRODUCTION: '0' })).toBe(false)
    expect(rehearsing({ CREEM_TEST_MODE_IN_PRODUCTION: 'false' })).toBe(false)
    expect(checkoutConfigured(TEST_PROD)).toBe(false)
    expect(billingEnvironmentRefusal(TEST_PROD)).toMatch(/non-live/)
  })

  it('opens both gates when it is on, and only then', () => {
    const on = { ...TEST_PROD, CREEM_TEST_MODE_IN_PRODUCTION: '1' }
    expect(rehearsing(on)).toBe(true)
    expect(checkoutConfigured(on)).toBe(true)
    expect(billingEnvironmentRefusal(on)).toBeNull()
    for (const truthy of ['1', 'true', 'TRUE', 'on']) {
      expect(rehearsing({ CREEM_TEST_MODE_IN_PRODUCTION: truthy }), truthy).toBe(true)
    }
  })

  it('never claims to be taking real money while it is on', () => {
    // What the banner keys off. A rehearsal is theatre however production the
    // domain is, and the screen has to admit that to whoever finds it.
    expect(takingRealPayments({ ...TEST_PROD, CREEM_TEST_MODE_IN_PRODUCTION: '1' })).toBe(false)
    expect(takingRealPayments({ CREEM_API_KEY: 'creem_test_abc' })).toBe(false)
    expect(takingRealPayments({})).toBe(false)
    expect(takingRealPayments({ CREEM_API_KEY: 'creem_live_abc' })).toBe(true)
  })

  it('does not weaken the live path it exists alongside', () => {
    // Turning the flag on must not make a LIVE deployment behave differently,
    // or the rehearsal switch becomes a thing nobody remembers to remove.
    const liveWithFlag = { CREEM_API_KEY: 'creem_live_abc', CREEM_PRODUCT_PRO: 'a', CREEM_PRODUCT_ELITE: 'b', VERCEL_ENV: 'production', CREEM_TEST_MODE_IN_PRODUCTION: '1' }
    expect(checkoutConfigured(liveWithFlag)).toBe(true)
    expect(billingEnvironmentRefusal(liveWithFlag)).toBeNull()
    expect(takingRealPayments(liveWithFlag)).toBe(true)
  })
})
