import { describe, expect, it } from 'vitest'
import {
  BEST_VALUE_PERIOD,
  BILLING_PERIODS,
  CREDIT_EXPIRY_NOTE,
  PERIOD_NOTE,
  INTERVIEW_PACKS,
  OFFERS,
  PLAN_INTERVIEW_CREDITS,
  SCREENER_NOTE,
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
  chargeLine,
  creditsLine,
  interviewsLine,
  packById,
  periodNoun,
  periodSavings,
  periodTabLabel,
  trialNoteFor,
  perInterview,
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


describe('the interview packs (INTERVIEW-PLAN D3, §5.4)', () => {
  it('orders them cheapest first and gets cheaper per interview as they grow', () => {
    // The ladder only makes sense if the bigger pack is the better rate. A pack
    // that cost more per interview than the one below it would be a page asking
    // somebody to do arithmetic and then punishing them for it.
    for (let index = 1; index < INTERVIEW_PACKS.length; index += 1) {
      const previous = INTERVIEW_PACKS[index - 1]!
      const current = INTERVIEW_PACKS[index]!
      expect(current.priceUsd).toBeGreaterThan(previous.priceUsd)
      expect(current.credits).toBeGreaterThan(previous.credits)
      expect(perInterview(current)).toBeLessThan(perInterview(previous))
    }
  })

  it('quotes a price that matches its own numeric value', () => {
    // `price` is printed on two surfaces and `priceUsd` is what
    // `npm run whop:setup` creates the vendor plan at. Two fields, one number.
    for (const pack of INTERVIEW_PACKS) {
      expect(pack.price).toBe(`$${pack.priceUsd}`)
    }
  })

  it('keeps every pack comfortably above the measured cost of an interview', () => {
    // §6, measured: $0.45-0.60 at p90 with a reconnect. The worst pack is the
    // twelve at ~11% COGS. A pack that dipped under about a dollar an interview
    // would be selling voice minutes below what they cost.
    for (const pack of INTERVIEW_PACKS) {
      expect(perInterview(pack)).toBeGreaterThan(1)
    }
  })

  it('gives every pack its own environment variable', () => {
    // Two packs sharing a variable would sell one at the other's price and
    // credit the wrong number of interviews.
    const vars = INTERVIEW_PACKS.map((pack) => pack.env)
    expect(new Set(vars).size).toBe(vars.length)
    expect(vars.every((name) => name.startsWith('WHOP_PACK_'))).toBe(true)
  })

  it('resolves a pack by id and nothing else', () => {
    expect(packById('pack5')?.credits).toBe(5)
    expect(packById('nonsense')).toBeUndefined()
  })

  it('never sells an interview allotment on free', () => {
    // A plan grants credits; free grants none, the same way it grants no voice
    // reps. This is the paywall's second half rather than a copy decision.
    expect(PLAN_INTERVIEW_CREDITS.free).toBe(0)
    expect(creditsLine('free')).toBe('None')
  })

  it('grants strictly more on the dearer plan', () => {
    expect(PLAN_INTERVIEW_CREDITS.elite).toBeGreaterThan(PLAN_INTERVIEW_CREDITS.pro)
    expect(PLAN_INTERVIEW_CREDITS.pro).toBeGreaterThan(PLAN_INTERVIEW_CREDITS.free)
  })

  it('never advertises an unlimited interview allowance', () => {
    // §5.2 is arithmetic, not restraint: three twenty-minute interviews a day
    // on Pro is about $45/month of voice against a $19 price.
    const copy = [
      ...INTERVIEW_PACKS.flatMap((pack) => [pack.name, pack.tagline]),
      CREDIT_EXPIRY_NOTE,
      SCREENER_NOTE,
      creditsLine('pro'),
      creditsLine('elite'),
    ].join(' ').toLowerCase()
    expect(copy).not.toContain('unlimited')
  })

  it('states both expiry rules in the one string every surface reads', () => {
    /**
     * §5.5, and the reason this is asserted rather than trusted: the pricing
     * page, the interview home, `TermsDocument` clause 07 and `RefundDocument`
     * clause 04 all say this, and a disputing customer quotes whichever is more
     * generous. One string is what stops the four drifting.
     */
    const note = CREDIT_EXPIRY_NOTE.toLowerCase()
    expect(note).toContain('never expire')
    expect(note).toContain('do not roll over')
    expect(note).toContain('cancel')
  })

  it('promises the free screener without calling it a trial or a demo', () => {
    // §5.6: five minutes is a recruiter screen, which is a real format rather
    // than a truncated one. Calling it a demo would misdescribe the product to
    // the person least able to tell.
    expect(SCREENER_NOTE.toLowerCase()).toContain('free')
    expect(SCREENER_NOTE.toLowerCase()).toContain('real thing')
    expect(SCREENER_NOTE.toLowerCase()).toContain('five')
  })

  it('never calls the product anything a payment reviewer bans by name', () => {
    const copy = INTERVIEW_PACKS
      .flatMap((pack) => [pack.name, pack.tagline])
      .concat(CREDIT_EXPIRY_NOTE, SCREENER_NOTE)
      .join(' ').toLowerCase()
    for (const word of ['dating', 'flirt', 'girlfriend', 'companion', 'therapy', 'treatment', 'get hired', 'guarantee']) {
      expect(copy, `pack copy says "${word}"`).not.toContain(word)
    }
  })
})

describe('the period control the pricing surfaces render', () => {
  it('has a note for every period it can show', () => {
    // The note under the tabs is what carries the honesty the old
    // every-price-at-once layout carried in a grey line. A period without one
    // would be a tab that explains nothing.
    for (const period of BILLING_PERIODS) {
      expect(PERIOD_NOTE[period]).toBeTruthy()
      expect(periodTabLabel(period)).toBeTruthy()
      expect(periodNoun(period)).toBeTruthy()
    }
  })

  it('says out loud, on the weekly tab, that weekly costs more per month', () => {
    /**
     * The one thing the redesign was not allowed to lose. §14 has a
     * merchant-of-record reviewer reading this page, and a ladder whose cheap
     * door is quietly the dearest rate is a trick rather than a ladder.
     */
    const note = PERIOD_NOTE.weekly.toLowerCase()
    expect(note).toContain('dearer per month')
    expect(note).toContain('no trial')
  })

  it('opens on the cheaper effective rate', () => {
    // A control that opens on the dearer option is one that hopes you do not
    // do the arithmetic.
    const rates = BILLING_PERIODS.map((period) => ({
      period,
      rate: Math.min(...OFFERS.filter((offer) => offer.period === period).map(monthlyEquivalent)),
    }))
    const cheapest = rates.reduce((best, entry) => (entry.rate < best.rate ? entry : best))
    expect(BEST_VALUE_PERIOD).toBe(cheapest.period)
  })

  it('puts a real saving on the tab, derived from the prices', () => {
    // 37% today: $30.33 a month by the week against $19 by the month. Derived
    // from `monthlyEquivalent`, so it cannot drift from what the cards print.
    expect(periodSavings('monthly')).toBe(
      Math.round((1 - 19 / monthlyEquivalent(offerFor('pro', 'weekly')!)) * 100),
    )
    // Nothing is saved by paying more, and the tab must not claim otherwise.
    expect(periodSavings('weekly')).toBeNull()
  })
})

describe('what a card says happens to the card', () => {
  it('leads with the trial where there is one, and with the charge where there is not', () => {
    expect(chargeLine(offerFor('pro', 'monthly')!)).toContain(`${TRIAL_DAYS} days free`)
    const weekly = chargeLine(offerFor('pro', 'weekly')!)
    expect(weekly).toContain('today')
    expect(weekly).not.toContain('free')
  })

  it('scopes the trial footnote to the period on screen', () => {
    /**
     * THE BUG THIS PINS. `TRIAL_NOTE` was printed under the board on every
     * tab, so the weekly tab promised "your card is authorised when the trial
     * starts and charged 7 days later" directly beneath a Pro card reading
     * "Charged $7 today" — the page contradicting itself about when money
     * moves.
     */
    expect(trialNoteFor('monthly')).toBe(TRIAL_NOTE)
    const weekly = trialNoteFor('weekly')
    // Weekly Pro has no trial and Elite falls back to monthly, which does — so
    // the note survives, scoped, rather than being dropped or left absolute.
    expect(weekly).toContain('plans that include one')
    expect(weekly).not.toBe(TRIAL_NOTE)
  })

  it('never tells a free account it has no interviews when it has one', () => {
    // The card meter and the comparison row ask different questions and are
    // allowed different words — but both read PLAN_INTERVIEW_CREDITS, so they
    // can never disagree about a number.
    expect(creditsLine('free')).toBe('None')
    expect(interviewsLine('free')).toBe('1 free')
    expect(interviewsLine('pro')).toBe(creditsLine('pro'))
    expect(interviewsLine('elite')).toBe(creditsLine('elite'))
  })
})
