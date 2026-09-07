import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ROUND,
  ROUND_SHAPE_LABEL,
  ROUND_TYPES,
  SCREENER_ROUND,
  SPEND_ORDER,
  creditBalance,
  expired,
  isRoundTypeId,
  hasScreenerCredit,
  nextLotToSpend,
  roundProbes,
  roundType,
  spendableFor,
  type CreditLot,
} from './interview-credits'

const NOW = new Date('2026-09-07T12:00:00.000Z')
const lot = (over: Partial<CreditLot> & Pick<CreditLot, 'source'>): CreditLot =>
  ({ remaining: 1, expiresAt: null, ...over })

describe('creditBalance', () => {
  it('is zero for an account that has never bought anything', () => {
    expect(creditBalance({ lots: [], holds: 0, now: NOW })).toEqual({
      bySource: { grant: 0, purchase: 0, screener: 0 },
      total: 0,
      held: 0,
      available: 0,
    })
  })

  it('sums by source and subtracts what is held', () => {
    const balance = creditBalance({
      lots: [
        lot({ source: 'grant', remaining: 1, expiresAt: '2026-10-01T00:00:00.000Z' }),
        lot({ source: 'purchase', remaining: 5 }),
        lot({ source: 'screener', remaining: 1 }),
      ],
      holds: 1,
      now: NOW,
    })
    expect(balance.bySource).toEqual({ grant: 1, purchase: 5, screener: 1 })
    expect(balance.total).toBe(7)
    expect(balance.available).toBe(6)
  })

  it('never reports a negative balance, however the holds fall', () => {
    expect(creditBalance({ lots: [], holds: 3, now: NOW }).available).toBe(0)
  })

  it('drops an expired grant and keeps a purchase forever', () => {
    const balance = creditBalance({
      lots: [
        lot({ source: 'grant', remaining: 4, expiresAt: '2026-09-01T00:00:00.000Z' }),
        lot({ source: 'purchase', remaining: 2 }),
      ],
      holds: 0,
      now: NOW,
    })
    expect(balance.bySource).toEqual({ grant: 0, purchase: 2, screener: 0 })
    expect(balance.total).toBe(2)
  })

  it('treats the expiry instant itself as expired', () => {
    expect(expired({ expiresAt: NOW.toISOString() }, NOW)).toBe(true)
    expect(expired({ expiresAt: '2026-09-07T12:00:00.001Z' }, NOW)).toBe(false)
    expect(expired({ expiresAt: null }, NOW)).toBe(false)
    // A column somebody typed by hand is not a reason to void a credit.
    expect(expired({ expiresAt: 'not a date' }, NOW)).toBe(false)
  })
})

describe('nextLotToSpend', () => {
  it('spends the expiring credit before the one that was paid for', () => {
    const grant = lot({ source: 'grant', expiresAt: '2026-10-01T00:00:00.000Z' })
    const purchase = lot({ source: 'purchase', remaining: 5 })
    expect(nextLotToSpend([purchase, grant], { now: NOW })).toBe(grant)
  })

  it('spends the soonest-expiring grant first', () => {
    const soon = lot({ source: 'grant', expiresAt: '2026-09-10T00:00:00.000Z' })
    const later = lot({ source: 'grant', expiresAt: '2026-10-10T00:00:00.000Z' })
    expect(nextLotToSpend([later, soon], { now: NOW })).toBe(soon)
  })

  it('falls through to the purchase once the grants are gone', () => {
    const purchase = lot({ source: 'purchase', remaining: 2 })
    expect(nextLotToSpend([
      lot({ source: 'grant', remaining: 0 }),
      lot({ source: 'grant', expiresAt: '2026-09-01T00:00:00.000Z' }),
      purchase,
    ], { now: NOW })).toBe(purchase)
  })

  it('keeps the screener for the screener round, and never spends it on a real one', () => {
    const screener = lot({ source: 'screener' })
    expect(nextLotToSpend([screener], { round: 'technical', now: NOW })).toBeNull()
    expect(nextLotToSpend([screener], { round: SCREENER_ROUND, now: NOW })).toBe(screener)
  })

  it('prefers a real credit over the screener even on the screener round', () => {
    const purchase = lot({ source: 'purchase' })
    expect(nextLotToSpend([lot({ source: 'screener' }), purchase], { round: 'screener', now: NOW }))
      .toBe(purchase)
  })

  it('returns null when there is nothing to spend', () => {
    expect(nextLotToSpend([], { now: NOW })).toBeNull()
    expect(nextLotToSpend([lot({ source: 'grant', remaining: 0 })], { now: NOW })).toBeNull()
  })

  it('spends in the documented order', () => {
    expect(SPEND_ORDER).toEqual(['grant', 'purchase', 'screener'])
  })
})

describe('rounds', () => {
  it('are authored, ordered by length, and every one is reachable', () => {
    expect(ROUND_TYPES.map((round) => [round.id, round.durationMs / 60_000, round.credits])).toEqual([
      ['screener', 5, 0],
      ['recruiter', 10, 1],
      ['technical', 20, 1],
      ['deep_technical', 25, 1],
      ['final', 20, 1],
    ])
  })

  it('gives the free screener no credit cost and every paid round exactly one', () => {
    for (const round of ROUND_TYPES) {
      expect([round.id, round.credits]).toEqual([round.id, round.id === SCREENER_ROUND ? 0 : 1])
    }
  })

  it('resolves an unknown or missing id to the default rather than throwing', () => {
    expect(roundType('technical').id).toBe('technical')
    expect(roundType(null).id).toBe(DEFAULT_ROUND)
    expect(roundType('nonsense').id).toBe(DEFAULT_ROUND)
    expect(isRoundTypeId('final')).toBe(true)
    expect(isRoundTypeId('dating')).toBe(false)
  })

  it('never lets a round run longer than the twenty-five minutes §6 costed', () => {
    for (const round of ROUND_TYPES) expect(round.durationMs).toBeLessThanOrEqual(1_500_000)
  })
})

/* ------------------------------------------------------------------ *
 * The round as a behavioural variable (INTERVIEW-TECHNICAL-PLAN §4)
 * ------------------------------------------------------------------ */

describe('the shape of a round', () => {
  /**
   * §4.1's table, pinned. Until 7 September a round carried a length and
   * nothing else, so `technical` and `final` differed only by the wind-down and
   * both asked the same six experiential questions — and four reps on a real
   * microphone asked the candidate whether they KNEW anything exactly zero
   * times.
   */
  it('is the §4.1 table exactly', () => {
    expect(ROUND_TYPES.map((round) => [round.id, round.shape, round.probeShare, round.opener])).toEqual([
      ['screener', 'behavioural', 0, 'background'],
      ['recruiter', 'behavioural', 0, 'background'],
      ['technical', 'mixed_technical', 0.5, 'project'],
      ['deep_technical', 'system_design', 0.7, 'brief'],
      ['final', 'behavioural', 0, 'background'],
    ])
  })

  it('probes exactly where the shape says it does', () => {
    for (const round of ROUND_TYPES) {
      expect(roundProbes(round.id), round.id).toBe(round.shape !== 'behavioural')
      expect(round.probeShare, round.id).toBeGreaterThanOrEqual(0)
      expect(round.probeShare, round.id).toBeLessThanOrEqual(1)
    }
    expect(roundProbes(null)).toBe(false)
  })

  it('has a word for every shape the picker has to show (§4.4)', () => {
    for (const round of ROUND_TYPES) {
      expect(ROUND_SHAPE_LABEL[round.shape], round.id).toBeTruthy()
    }
  })

  /**
   * §4.2 and §4.3. The two descriptions are what the setup screen reads out,
   * and both were rewritten because the old ones described the wrong
   * interview: "one problem, taken all the way down" drove her further INTO a
   * candidate's project rather than out of it, which is how rep `e9c74f80`
   * became eleven consecutive questions about one web app.
   */
  it('says on the brief what the round actually is', () => {
    expect(roundType('technical').description.toLowerCase()).toContain('fundamentals')
    const deep = roundType('deep_technical').description.toLowerCase()
    expect(deep).toContain('system design')
    expect(deep).toContain('not about your cv')
  })

  it('opens the free screener on background, whatever else changes', () => {
    // Five minutes, and it is free. There is no room in it for a probe ladder,
    // and spending the one free sample on a fundamentals test would misdescribe
    // the product to the person least able to tell.
    expect(roundType(SCREENER_ROUND).probeShare).toBe(0)
    expect(roundType(SCREENER_ROUND).opener).toBe('background')
  })
})

/* ------------------------------------------------------------------ *
 * What can actually pay for this round
 * ------------------------------------------------------------------ */

describe('spendableFor', () => {
  const screener: CreditLot = { source: 'screener', remaining: 1, expiresAt: null }
  const purchase: CreditLot = { source: 'purchase', remaining: 2, expiresAt: null }

  /**
   * **THE DEFECT, MEASURED ON A REAL ACCOUNT.**
   *
   * `creditBalance().available` counts every source. A screener credit buys the
   * five-minute screener and nothing else, so an account holding one and
   * nothing else has a balance of 1 and can start no paid round at all. Every
   * gate in the UI read the balance, let the rep through, and the token route
   * refused it at the microphone — surfaced as "Connection lost", retried twice.
   */
  it('does not let a screener credit pay for a round it cannot buy', () => {
    expect(creditBalance({ lots: [screener], holds: 0 }).available).toBe(1)
    expect(spendableFor([screener], { round: 'recruiter' })).toBe(0)
    expect(spendableFor([screener], { round: 'technical' })).toBe(0)
    expect(spendableFor([screener], { round: SCREENER_ROUND })).toBe(1)
  })

  it('agrees with the spender on every round', () => {
    // The gate and `nextLotToSpend` have to answer the same question, because
    // disagreeing is the entire bug: one of them decides whether the button
    // works and the other decides whether the rep runs.
    for (const round of ROUND_TYPES) {
      for (const lots of [[screener], [purchase], [screener, purchase], []]) {
        const canSpend = nextLotToSpend(lots, { round: round.id }) !== null
        expect(spendableFor(lots, { round: round.id }) > 0, `${round.id}/${lots.length}`).toBe(canSpend)
      }
    }
  })

  it('counts a paid lot for every round, including the screener', () => {
    expect(spendableFor([purchase], { round: 'deep_technical' })).toBe(2)
    expect(spendableFor([screener, purchase], { round: 'recruiter' })).toBe(2)
    expect(spendableFor([screener, purchase], { round: SCREENER_ROUND })).toBe(3)
  })

  it('takes the holds off, so a rep already running cannot be double-spent', () => {
    expect(spendableFor([purchase], { round: 'recruiter', holds: 1 })).toBe(1)
    expect(spendableFor([purchase], { round: 'recruiter', holds: 9 })).toBe(0)
  })

  it('ignores an expired lot', () => {
    const dead: CreditLot = { source: 'grant', remaining: 5, expiresAt: '2020-01-01T00:00:00Z' }
    expect(spendableFor([dead], { round: 'recruiter' })).toBe(0)
  })

  it('knows whether the free screener is worth offering', () => {
    // The picker filtered the screener out on `credits > 0` — which is the
    // round the screener credit exists to pay for — so a granted screener was
    // unspendable from the setup screen.
    expect(hasScreenerCredit([screener])).toBe(true)
    expect(hasScreenerCredit([purchase])).toBe(false)
    expect(hasScreenerCredit([{ source: 'screener', remaining: 0, expiresAt: null }])).toBe(false)
  })
})
