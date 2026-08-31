import { describe, expect, it } from 'vitest'
import { PUBLIC_PLANS } from '@/lib/site/plans'
import { checkoutConfigured, planForProduct, productForPlan, productMap } from './plans'

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
