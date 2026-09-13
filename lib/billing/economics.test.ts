import { describe, expect, it } from 'vitest'
import {
  AFFILIATE_RATES,
  COST_PER_CREDIT_USD,
  COST_PER_REP_USD,
  marginAt,
  maxCommissionPercent,
  maxCostToServe,
  netOfFees,
  tightestOffer,
} from './economics'
import { OFFERS, offerFor, type PlanOffer } from '@/lib/site/plans'

const YEARLY = offerFor('pro', 'yearly') as PlanOffer

/**
 * ── THE ONE THAT MATTERS ─────────────────────────────────────────────────
 *
 * Everything else in this file is arithmetic about arithmetic. This is the
 * promise: whatever we sell, at whatever commission we pay, a customer who
 * consumes every rep and every credit their plan allows still leaves us above
 * zero. It is asserted rather than reasoned about because the reasoning was
 * done by hand twice and was wrong once.
 */
describe('no sale can lose money', () => {
  for (const offer of OFFERS) {
    for (const [who, rate] of Object.entries(AFFILIATE_RATES)) {
      it(`${offer.plan} ${offer.period} clears its cost at the ${who} rate (${rate}%)`, () => {
        expect(marginAt(offer, rate)).toBeGreaterThan(0)
      })
    }
  }

  it('holds even with no affiliate at all, which is the easy direction', () => {
    for (const offer of OFFERS) expect(marginAt(offer, 0)).toBeGreaterThan(0)
  })

  /**
   * The guard on the rates themselves. A rate raised past what the tightest
   * rung can carry fails HERE, naming the offer, rather than in a voice bill.
   */
  it('keeps every commission rate under what the tightest offer can pay', () => {
    const tightest = tightestOffer()
    for (const rate of Object.values(AFFILIATE_RATES)) {
      expect(rate).toBeLessThan(maxCommissionPercent(tightest))
    }
  })

  /**
   * The year is the binding constraint and is expected to be. If this ever
   * stops being true, something else has become tighter and the comment on
   * `AFFILIATE_RATES.member` is describing the wrong offer.
   */
  it('names the year as the rung with the least room', () => {
    expect(tightestOffer()).toBe(YEARLY)
  })
})

describe('the arithmetic the rates were chosen from', () => {
  it('takes the merchant of record fixed cut plus a percentage', () => {
    // $149 − $0.37 − 5% = $141.18
    expect(netOfFees(149)).toBeCloseTo(141.18, 2)
  })

  /**
   * The omission that made 35% look safe: a hand calculation of reps × $0.08
   * leaves out the twenty-four interview credits the year also grants.
   */
  it('counts granted interview credits, not just voice reps', () => {
    const voiceOnly = 3 * 365 * COST_PER_REP_USD
    expect(maxCostToServe(YEARLY)).toBeGreaterThan(voiceOnly)
    expect(maxCostToServe(YEARLY)).toBeCloseTo(voiceOnly + 24 * COST_PER_CREDIT_USD, 2)
  })

  it('puts the year’s ceiling at 32.6%, which is why 35 was refused', () => {
    expect(maxCommissionPercent(YEARLY)).toBeCloseTo(32.6, 1)
    expect(marginAt(YEARLY, 30)).toBeGreaterThan(0)
    expect(marginAt(YEARLY, 35)).toBeLessThan(0)
  })

  /**
   * The 50% the account actually shipped with, kept as a test rather than a
   * memory. It was not a near miss.
   */
  it('records that the rate this replaced was deeply underwater', () => {
    expect(marginAt(YEARLY, 50)).toBeLessThan(-20)
  })
})
