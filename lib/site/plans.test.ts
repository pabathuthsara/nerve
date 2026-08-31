import { describe, expect, it } from 'vitest'
import {
  CHECKOUT_NOTE,
  PAID_PLANS,
  PUBLIC_PLANS,
  TRIAL_DAYS,
  TRIAL_NOTE,
  hasVoice,
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
