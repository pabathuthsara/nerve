/**
 * What a sale is worth after everything it costs us (LAUNCH-GAP D22).
 *
 * ── WHY THIS IS A FILE AND NOT A SPREADSHEET ─────────────────────────────
 *
 * Every rung on the ladder has to clear its own cost of goods **at the usage it
 * is allowed to consume**, not at the usage we expect. Expected usage is a
 * forecast; `repsPerDay` × `billingDays` is a promise we have already made, and
 * a customer who takes all of it is entitled to.
 *
 * That subtraction was done by hand twice — once when the year was priced and
 * once when the commission was set — and the second one got it wrong, because
 * a hand calculation of "reps times eight cents" silently omits the interview
 * credits the same plan grants. A 35% member commission on the year looked safe
 * to arithmetic that had forgotten $5.04 of credits and was $3.61 underwater
 * once they were counted.
 *
 * So it is computed, and `economics.test.ts` asserts the property the pricing
 * actually has to have: **no offer on the roster can be sold at a loss, at any
 * commission rate we pay, at the maximum usage it permits.** A repriced plan,
 * a new period, a raised rep allowance or a moved commission all fail that test
 * rather than failing silently in a voice bill nine months later.
 *
 * Every constant here is a CEILING, per rule 18: price what is known, bound
 * what is not, and bound it upward so the answer is conservative.
 */

import { OFFERS, offerPeriodCredits, planById, type PlanOffer } from '@/lib/site/plans'

/**
 * The merchant of record's cut: $0.37 plus 5% (§14, `PAYMENTS-NEW-INTEGRATION`).
 *
 * Whop's, and it is charged on the gross, so a cheap rung pays a proportionally
 * larger fixed component — which is exactly why the fixed part is modelled
 * rather than folded into the percentage.
 */
export const WHOP_FEE = { fixedUsd: 0.37, rate: 0.05 } as const

/**
 * What one three-minute voice rep costs to serve, in dollars.
 *
 * The figure the sign-up rep is costed at across the docs. TTS is 60-67% of it
 * (`PIPELINE.md` § Cost), which is why it does not fall much on a longer turn.
 */
export const COST_PER_REP_USD = 0.08

/**
 * What one interview credit costs to serve, in dollars.
 *
 * The TOP of the measured $0.17-$0.21 band. A margin floor built on the
 * favourable end of a range is not a floor.
 */
export const COST_PER_CREDIT_USD = 0.21

/**
 * The commission rates paid at the provider, authored here rather than in the
 * script that writes them.
 *
 * `scripts/setup-whop.ts` imports these. It used to hold them, which put the
 * one number that can turn a sale negative outside the reach of every test in
 * the repo — the same reason personas and packs are authored in `lib/` and
 * seeded rather than typed into a dashboard (rule 10).
 */
export const AFFILIATE_RATES = {
  /** Any affiliate. */
  global: 30,
  /**
   * An affiliate who is also a paying member.
   *
   * **30 and not 35.** The premium was the intention and the year cannot pay
   * for it: `maxCommissionPercent` on the annual offer is 32.6%, so 35% sells
   * a $149 subscription $3.61 underwater at full usage. The rate that fits is
   * within rounding of the global one, and two rates that differ by two points
   * are not worth the sentence in the affiliate brief explaining them.
   */
  member: 30,
} as const

/** Gross, less the merchant of record's cut. */
export function netOfFees(priceUsd: number): number {
  return priceUsd - WHOP_FEE.fixedUsd - priceUsd * WHOP_FEE.rate
}

/**
 * The most this offer can cost us to serve across one billing period.
 *
 * Voice at the plan's full daily allowance for every day of the period, plus
 * every interview credit the period grants. Nobody reaches this. The point is
 * that if somebody did, we would still be above water.
 */
export function maxCostToServe(offer: PlanOffer): number {
  const reps = planById(offer.plan).repsPerDay * offer.billingDays
  return reps * COST_PER_REP_USD + offerPeriodCredits(offer) * COST_PER_CREDIT_USD
}

/**
 * What is left on a sale after fees, cost of goods and a given commission.
 *
 * **This models the FIRST billing period, which is the worst one**, and that is
 * deliberate rather than incidental. Commission at the provider is paid on the
 * first payment only (confirmed 13 September; no payload the repo can read
 * exposes it), so period one bears a full period of cost of goods *and* the
 * entire commission, while every renewal afterwards bears only the cost. A
 * floor computed here is therefore a floor for the life of the subscription.
 *
 * It would still be the right sum if commission ever became recurring, which is
 * the second reason not to "correct" it: the conservative reading is safe under
 * both provider behaviours, and the optimistic one is safe under only one.
 */
export function marginAt(offer: PlanOffer, commissionPercent: number): number {
  return netOfFees(offer.priceUsd)
    - offer.priceUsd * (commissionPercent / 100)
    - maxCostToServe(offer)
}

/**
 * The highest commission this offer could pay and still not lose money.
 *
 * The number to check a proposed rate against before agreeing it with anybody —
 * and the number the test asserts every rate in `AFFILIATE_RATES` sits under.
 */
export function maxCommissionPercent(offer: PlanOffer): number {
  return ((netOfFees(offer.priceUsd) - maxCostToServe(offer)) / offer.priceUsd) * 100
}

/** The offer with the least room, which is the one that sets every rate. */
export function tightestOffer(): PlanOffer {
  return OFFERS.reduce((a, b) => (maxCommissionPercent(b) < maxCommissionPercent(a) ? b : a))
}
