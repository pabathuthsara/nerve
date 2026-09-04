import { describe, expect, it } from 'vitest'
import {
  BILLING_PERIODS,
  OFFERS,
  CHECKOUT_NOTE,
  PAID_PLANS,
  PUBLIC_PLANS,
  TRIAL_DAYS,
  TRIAL_NOTE,
  hasVoice,
  isSoldOn,
  monthlyEquivalent,
  offerFor,
  offersFor,
  periodLabel,
  planById,
  repsLine,
} from './plans'

describe('the plan record', () => {
  it('sells voice and nothing else', () => {
    // The one thing `entitlements.plan` touches is `reps_per_day` and the daily
    // spend cap. A plan that advertised a character, a scorecard or a field
    // tier would be advertising a gate this codebase does not have.
    expect(hasVoice('free')).toBe(false)
    expect(hasVoice('pro')).toBe(true)
    expect(hasVoice('elite')).toBe(true)
  })

  it('puts zero voice reps on free, which IS the paywall', () => {
    // Not a copy decision. `consumeRep` and `mayOpenSession` both refuse at
    // zero, so this number is the lock — see the module note.
    expect(planById('free').repsPerDay).toBe(0)
  })

  it('rises monotonically in both price and volume', () => {
    // A tier that costs more and gives less is a pricing bug that reads as a
    // typo, and the anchoring argument for Elite depends on the ordering.
    const cents = (plan: (typeof PUBLIC_PLANS)[number]) =>
      plan.price ? Number(plan.price.replace(/[^0-9.]/g, '')) : 0
    for (let index = 1; index < PUBLIC_PLANS.length; index += 1) {
      const previous = PUBLIC_PLANS[index - 1]!
      const current = PUBLIC_PLANS[index]!
      expect(cents(current)).toBeGreaterThan(cents(previous))
      expect(current.repsPerDay).toBeGreaterThan(previous.repsPerDay)
    }
  })

  it('keeps Pro at the §14 price and Elite above the margin floor', () => {
    // $19 is the spec price, launched as an explicit founding-member price.
    // Elite went to $49 because $39 with six reps a day lands at 53% gross
    // after the merchant of record — under the 59% §14 rejected once already.
    expect(planById('pro').price).toBe('$19')
    expect(planById('elite').price).toBe('$49')
  })

  it('offers every paid plan and never the free one', () => {
    expect(PAID_PLANS.map((plan) => plan.id)).toEqual(['pro', 'elite'])
    expect(PAID_PLANS.every((plan) => plan.open)).toBe(true)
  })

  it('never writes a voiceless plan as a counter that will reset', () => {
    // "0 / day" in the mono data face reads as a quota that comes back at
    // midnight. A free account's does not, and that is the whole point.
    expect(repsLine(planById('free'))).toBe('None')
    expect(repsLine(planById('pro'))).toBe('3 / day')
  })
})

describe('the copy that is also a commitment', () => {
  it('keeps the founding-member promise the $19 launch price rests on', () => {
    // §2.1 of the payments plan: launching under the spec price is only safe
    // because it can be raised for later cohorts without breaking faith with
    // the early ones, and this sentence is what makes that honest.
    expect(CHECKOUT_NOTE.toLowerCase()).toContain('founding member')
    // And it no longer claims checkout is shut, because it is not.
    expect(CHECKOUT_NOTE.toLowerCase()).not.toContain('not open')
  })

  it('says the trial length, when the card is charged, and how to stop it', () => {
    // The three mitigations §8 of the payments plan requires to ship WITH the
    // trial rather than after it. A card-required trial that ends quietly is
    // the pattern that closes a merchant-of-record account.
    expect(TRIAL_NOTE).toContain(String(TRIAL_DAYS))
    expect(TRIAL_NOTE.toLowerCase()).toContain('charged')
    expect(TRIAL_NOTE.toLowerCase()).toContain('cancel')
    expect(TRIAL_NOTE.toLowerCase()).toContain('email you')
  })

  it('never calls the product anything a payment reviewer bans by name', () => {
    // §14 and §16. Every provider on the shortlist bans dating products by
    // name, and a pricing surface is an application document.
    const copy = [
      ...PUBLIC_PLANS.flatMap((plan) => [plan.name, plan.tagline, ...plan.features]),
      CHECKOUT_NOTE,
      TRIAL_NOTE,
    ].join(' ').toLowerCase()
    for (const word of ['dating', 'flirt', 'girlfriend', 'companion', 'therapy', 'treatment']) {
      expect(copy, `plan copy says "${word}"`).not.toContain(word)
    }
  })
})


describe('billing periods', () => {
  it('sells weekly Pro with NO trial', () => {
    // The reason weekly exists. A 7-day trial in front of a 7-day period
    // charges on day 7 and again on day 14, and `setup-whop.ts` would create
    // the vendor plan from this number.
    const weekly = offerFor('pro', 'weekly')
    expect(weekly).toBeDefined()
    expect(weekly!.trialDays).toBe(0)
    expect(weekly!.billingDays).toBe(7)
  })

  it('keeps the trial on the monthly offers', () => {
    expect(offerFor('pro', 'monthly')!.trialDays).toBeGreaterThan(0)
    expect(offerFor('elite', 'monthly')!.trialDays).toBeGreaterThan(0)
  })

  it('sells Elite by the month only', () => {
    // Elite is the commitment tier. A weekly Elite contradicts what it is for,
    // and `startCheckout` refuses the pair rather than quietly selling monthly.
    expect(isSoldOn('elite', 'monthly')).toBe(true)
    expect(isSoldOn('elite', 'weekly')).toBe(false)
    expect(offerFor('elite', 'weekly')).toBeUndefined()
  })

  it('never sells the free plan on any period', () => {
    for (const period of BILLING_PERIODS) {
      expect(isSoldOn('free', period)).toBe(false)
    }
  })

  it('prices weekly ABOVE the monthly rate per month, and says so', () => {
    // The honest version of the ladder: committing is cheaper. If this ever
    // inverts, the monthly plan is strictly worse than the weekly one and
    // nobody should buy it.
    const weekly = offerFor('pro', 'weekly')!
    const monthly = offerFor('pro', 'monthly')!
    expect(monthlyEquivalent(weekly)).toBeGreaterThan(monthly.priceUsd)
    // ...and below the point where the premium stops being a premium and
    // becomes a penalty. Twice the monthly rate is the line.
    expect(monthlyEquivalent(weekly)).toBeLessThan(monthly.priceUsd * 2)
  })

  it('uses 52/12 weeks in a month, not 4', () => {
    // A buyer who multiplies by four and then reads their statement is a
    // support ticket. 4 weeks understates the real monthly cost by ~8%.
    expect(monthlyEquivalent(offerFor('pro', 'weekly')!)).toBeCloseTo(7 * (52 / 12), 5)
    // A monthly offer is already monthly.
    expect(monthlyEquivalent(offerFor('pro', 'monthly')!)).toBe(19)
  })

  it('gives every offer its own environment variable', () => {
    // Two offers sharing a variable would sell one at the other's price.
    const vars = OFFERS.map((offer) => offer.env)
    expect(new Set(vars).size).toBe(vars.length)
    expect(vars.every((name) => name.startsWith('WHOP_PLAN_'))).toBe(true)
  })

  it('orders the offers for a plan cheapest first', () => {
    const pro = offersFor('pro')
    expect(pro.map((offer) => offer.period)).toEqual(['weekly', 'monthly'])
  })

  it('writes the period the way a price is read aloud', () => {
    expect(periodLabel('weekly')).toBe('/ week')
    expect(periodLabel('monthly')).toBe('/ month')
  })

  it('quotes a price that matches its own numeric value', () => {
    // `price` is printed and `priceUsd` is charged. They are two fields and
    // they must never disagree — that is the whole failure lib/site/plans.ts
    // exists to prevent, reached from a new direction.
    for (const offer of OFFERS) {
      expect(offer.price).toBe(`$${offer.priceUsd}`)
    }
  })
})
