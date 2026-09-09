import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ROUND,
  ROUND_COST_ROWS,
  ROUND_SHAPE_LABEL,
  ROUND_TYPES,
  SCREENER_ROUND,
  SPEND_ORDER,
  canAfford,
  creditBalance,
  creditCost,
  expired,
  hasScreenerCredit,
  isRoundTypeId,
  nextLotToSpend,
  openingRound,
  planSpend,
  roundCostLabel,
  roundProbes,
  roundType,
  spendableFor,
  type CreditLot,
} from './interview-credits'

const NOW = new Date('2026-09-07T12:00:00.000Z')
const lot = (over: Partial<CreditLot> & Pick<CreditLot, 'source'>): CreditLot =>
  ({ remaining: 1, expiresAt: null, ...over })

describe('the round cost table, as a screen draws it (D18)', () => {
  it('reads its prices off the authored rounds and never retypes them', () => {
    // The whole point of the derivation. A repriced round has to move the
    // credits card with it, and the only way to guarantee that is for the card
    // to have no number of its own.
    expect(ROUND_COST_ROWS).toHaveLength(ROUND_TYPES.length)
    for (const row of ROUND_COST_ROWS) {
      const round = roundType(row.id)
      expect(row.credits, row.id).toBe(round.credits)
      expect(row.label, row.id).toBe(round.label)
      expect(row.minutes, row.id).toBe(Math.round(round.durationMs / 60_000))
    }
  })

  it('never prints a zero where a price goes', () => {
    // "0 credits" on the free round reads as a bug rather than as a gift.
    const screener = ROUND_COST_ROWS.find((row) => row.id === 'screener')!
    expect(roundCostLabel(screener)).toBe('Free')
    expect(roundCostLabel({ ...screener, credits: 1 })).toBe('1 credit')
    expect(roundCostLabel({ ...screener, credits: 2 })).toBe('2 credits')
  })

  it('agrees with the sentence that says the same thing elsewhere', () => {
    /**
     * Two renderings of one fact, and they must not come apart. The sentence
     * still runs on the paywall sheet, the scorecard's low-balance line and the
     * two public pages, where there is no room for a table; the table runs on
     * the credits card, where there is. A round repriced in `ROUND_TYPES` moves
     * the table on its own and leaves the hand-authored sentence behind, so
     * this is the assertion that catches it.
     */
    const paid = ROUND_COST_ROWS.filter((row) => row.credits > 0)
    const cheapest = Math.min(...paid.map((row) => row.credits))
    const dearest = Math.max(...paid.map((row) => row.credits))
    expect(cheapest, 'the sentence says the screen is ONE credit').toBe(1)
    expect(dearest, 'the sentence says every longer round is TWO').toBe(2)

    const recruiter = ROUND_COST_ROWS.find((row) => row.id === 'recruiter')!
    expect(recruiter.minutes, 'the sentence says TEN minutes').toBe(10)
    expect(recruiter.credits).toBe(1)

    // And every round longer than the recruiter screen is the dearer one, which
    // is the other half of what the sentence claims.
    for (const row of paid) {
      if (row.minutes > recruiter.minutes) expect(row.credits, row.id).toBe(2)
    }
  })
})

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
      ['technical', 20, 2],
      ['deep_technical', 25, 2],
      ['final', 20, 2],
    ])
  })

  /**
   * LAUNCH-GAP B3, AND WHAT SURVIVED OF IT ON 9 SEPTEMBER.
   *
   * B3's finding was that every paid round costing one credit meant a rational
   * buyer never spent one on the recruiter screen — the cheapest, friendliest
   * and most convertible round there is. The fix was a ladder, and the ladder
   * was authored off MINUTES: 1 / 2 / 3 / 2.
   *
   * Minutes turned out to be the wrong axis. Costed off `voice_operations`, a
   * deep technical runs at ~$0.41 against a technical's ~$0.34 — 1.2x the cost
   * at 1.5x the price — because her airtime is what scales and an interviewer
   * talks less of a long round, not more. So the ladder is 1 / 2 / 2 / 2 now.
   *
   * The property that has to hold is NOT "longer costs more". It is the one
   * B3 actually needed: **the screen is strictly cheaper than every round that
   * competes with it**, so it stays worth buying. Above that line the three
   * long rounds are priced together on purpose, so they are chosen on fit
   * rather than on price — which is the only basis on which they differ.
   */
  it('keeps the screen strictly cheaper than every round it competes with', () => {
    const paid = ROUND_TYPES.filter((round) => round.id !== SCREENER_ROUND)
    const screen = roundType('recruiter')
    for (const round of paid) {
      expect(round.credits, round.id).toBeGreaterThanOrEqual(1)
      if (round.durationMs > screen.durationMs) {
        expect(round.credits, round.id).toBeGreaterThan(screen.credits)
      }
    }
    // And nothing above the screen is priced apart from its peers: a spread
    // there is the cost-plus reasoning this table has already got wrong once.
    const long = paid.filter((round) => round.durationMs > screen.durationMs)
    expect(new Set(long.map((round) => round.credits)).size).toBe(1)
    expect(roundType(SCREENER_ROUND).credits).toBe(0)
  })

  it('reads the cost off the table rather than letting a screen invent one', () => {
    expect(creditCost('deep_technical')).toBe(2)
    expect(creditCost('recruiter')).toBe(1)
    expect(creditCost(SCREENER_ROUND)).toBe(0)
    // An unknown id resolves to the default round, never to free.
    expect(creditCost('nonsense')).toBe(creditCost(DEFAULT_ROUND))
  })

  it('affords a round only when the balance covers its whole cost', () => {
    expect(canAfford(1, 'recruiter')).toBe(true)
    expect(canAfford(1, 'technical')).toBe(false)
    expect(canAfford(2, 'technical')).toBe(true)
    expect(canAfford(2, 'deep_technical')).toBe(true)
    expect(canAfford(1, 'deep_technical')).toBe(false)
    expect(canAfford(0, SCREENER_ROUND)).toBe(true)
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
    // The gate and the spender have to answer the same question, because
    // disagreeing is the entire bug: one of them decides whether the button
    // works and the other decides whether the rep runs. Since B3 the question
    // is "can this cover the whole cost", not "is there anything at all".
    for (const round of ROUND_TYPES) {
      for (const lots of [[screener], [purchase], [screener, purchase], []]) {
        const canSpend = planSpend(lots, { round: round.id }) !== null
        expect(canAfford(spendableFor(lots, { round: round.id }), round.id), `${round.id}/${lots.length}`).toBe(canSpend)
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

  /**
   * LAUNCH-GAP B3. A three-credit round can need two lots, and the ledger has
   * to be able to say which — `nextLotToSpend` answered "one lot, one credit"
   * and could not.
   */
  it('draws a multi-credit round across lots, expiring first, all or nothing', () => {
    const grant: CreditLot = { source: 'grant', remaining: 1, expiresAt: '2026-10-01T00:00:00Z' }
    const paid: CreditLot = { source: 'purchase', remaining: 5, expiresAt: null }

    // Two credits, one from the grant that dies first and one from the pack.
    expect(planSpend([grant, paid], { round: 'deep_technical', now: NOW }))
      .toEqual([{ source: 'grant', amount: 1 }, { source: 'purchase', amount: 1 }])

    // One credit takes only from the expiring lot.
    expect(planSpend([grant, paid], { round: 'recruiter', now: NOW }))
      .toEqual([{ source: 'grant', amount: 1 }])

    // The free round costs nothing at all and needs no lot.
    expect(planSpend([], { round: SCREENER_ROUND, now: NOW })).toEqual([])
  })

  /**
   * The ladder has moved once already — 1/2/3/2 on 8 September, 1/2/2/2 on the
   * 9th when the rounds were costed properly — and no round charges three today.
   * `cost` is asserted directly so the arithmetic that a three-credit round
   * would need keeps its coverage rather than quietly rotting until the next
   * time somebody reprices the table.
   */
  it('draws any cost across lots, not only the ones the table charges today', () => {
    const grant: CreditLot = { source: 'grant', remaining: 1, expiresAt: '2026-10-01T00:00:00Z' }
    const paid: CreditLot = { source: 'purchase', remaining: 5, expiresAt: null }
    expect(planSpend([grant, paid], { round: 'deep_technical', cost: 3, now: NOW }))
      .toEqual([{ source: 'grant', amount: 1 }, { source: 'purchase', amount: 2 }])
    expect(planSpend([grant], { round: 'deep_technical', cost: 3, now: NOW })).toBeNull()
  })

  it('refuses rather than part-spending when the lots cannot cover the round', () => {
    // A partial spend takes somebody's credits and gives them no interview,
    // which is the one outcome worse than refusing on the brief.
    const one: CreditLot = { source: 'purchase', remaining: 1, expiresAt: null }
    expect(planSpend([one], { round: 'deep_technical', now: NOW })).toBeNull()
    expect(planSpend([one], { round: 'technical', now: NOW })).toBeNull()
    expect(planSpend([one], { round: 'recruiter', now: NOW })).toEqual([{ source: 'purchase', amount: 1 }])
    expect(planSpend([], { round: 'recruiter', now: NOW })).toBeNull()
  })

  it('never lets a screener credit pay for a round it cannot buy, however big the spend', () => {
    const free: CreditLot = { source: 'screener', remaining: 4, expiresAt: null }
    expect(planSpend([free], { round: 'technical', now: NOW })).toBeNull()
    expect(planSpend([free], { round: SCREENER_ROUND, now: NOW })).toEqual([])
  })

  /**
   * LAUNCH-GAP B1. Every account holds a free screener and `DEFAULT_ROUND` is
   * `recruiter`, so the setup opened on a round the free credit cannot buy and
   * the one giveaway on every account failed at the moment of redemption.
   */
  it('opens on the round the free screener can actually pay for', () => {
    expect(openingRound(true)).toBe(SCREENER_ROUND)
    expect(openingRound(false)).toBe(DEFAULT_ROUND)
    // And what it opens on is always affordable with what the account holds.
    expect(canAfford(spendableFor([screener], { round: openingRound(true) }), openingRound(true))).toBe(true)
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
