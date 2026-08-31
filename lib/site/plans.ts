/**
 * What a plan costs, in one place.
 *
 * Two surfaces quote a price: `/pricing` on the public site and
 * `/profile/subscription` inside the app. They were about to be two hardcoded
 * lists, which is the cheapest possible way to end up charging one number and
 * advertising another — and §14 is explicit that a human at the merchant of
 * record reads the public page during onboarding. A pricing page that
 * disagrees with the product is the kind of thing that ends an application.
 *
 * `repsPerDay` is the same number `scripts/set-plan.ts` writes to
 * `entitlements.reps_per_day`, and the same number `applyBillingEvent` writes
 * when a webhook lands. Change it here and there in the same commit, or the
 * page is describing a plan the database does not grant.
 *
 * ── THE 31 AUGUST CHANGE: VOICE IS SOLD BY THE ACCOUNT ───────────────────
 *
 * Free used to be one voice rep a day, forever — a recurring cost of about
 * $2.64 a month per free user, which is 11% of a Pro subscription burned every
 * month on somebody who never pays. Freemium works when a free user costs
 * nothing; ours costs voice minutes against a realtime model.
 *
 * So free is not removed, it is made **voice-less**. `repsPerDay: 0` is the
 * whole mechanism — `consumeRep` and `mayOpenSession` already refuse at zero.
 * Everything whose marginal cost is approximately zero stays in it: the field
 * challenges, text mode, the streak, the history, the transcripts and the
 * Sunday letter. §14's rule that running out must never break the streak is
 * what makes that a paywall rather than a churn event, and it still holds —
 * a field challenge keeps the day.
 *
 * The one free voice rep left in the product is the sign-up rep, which happens
 * once per account rather than once a day. It is granted by
 * `lib/data/allowance.ts` against its own counter, not by this file, because
 * it is not a property of any plan.
 *
 * Prices are $19 and $49 rather than §14's $19/$39. Pro is at the spec price
 * as an explicit founding-member price, which is what `CHECKOUT_NOTE` promises
 * and what lets it be raised for later cohorts without breaking faith with the
 * early ones. Elite went to $49 because at $39 with six reps a day it lands at
 * 53% gross after the merchant of record — below the 59% §14 explicitly
 * rejected 200-minute pricing for. At $49 the same plan is 62%. The anchoring
 * argument is real but secondary; the margin is the reason.
 *
 * **The feature lists say volume and nothing else, because that is all a plan
 * changes.** The in-app comparison used to advertise "Level 1 personas" on Free
 * and "every persona" above it, and nothing in the codebase has ever worked
 * that way: tiers open on `unlockedLevels`, which counts reps scoring 70+ and
 * has never read a plan. `reps_per_day` and the daily spend cap are the only
 * two things `entitlements.plan` touches. Advertising a gate that does not
 * exist is a promise to build one.
 */

import type { Plan } from '@/lib/data/types'

export interface PublicPlan {
  id: Plan
  /** Display name. Lowercase plan ids are database values, not copy. */
  name: string
  /** What it costs, already formatted. `null` on free — "free" is not a price. */
  price: string | null
  /** Reps a day, matching `entitlements.reps_per_day`. */
  repsPerDay: number
  /** One line on who it is for. Never a feature list in disguise. */
  tagline: string
  features: readonly string[]
  /**
   * Whether this plan can be bought at all.
   *
   * Free is `true` in the sense that it is available, which is why the pricing
   * page keys its button off `id === 'free'` rather than off this. For a paid
   * plan it means the product is authored and the checkout path exists —
   * whether the merchant-of-record account is configured *right now* is a
   * separate, environment-level question, answered by
   * `checkoutConfigured()` in `lib/billing/plans.ts`. A plan can be open and
   * still not sellable this minute, and the two surfaces have to be able to
   * tell those apart: one is a product decision, the other is a missing
   * environment variable.
   */
  open: boolean
}

/**
 * How long the trial runs before the first charge.
 *
 * Set on the product at the merchant of record (`trialDays`), and repeated here
 * because four surfaces have to say the number out loud — the pricing page, the
 * upgrade refusal, the subscription screen and the terms. The provider is the
 * authority on when the charge actually happens; this is what we promise, and
 * the two must be changed together.
 */
export const TRIAL_DAYS = 7

export const PUBLIC_PLANS: readonly PublicPlan[] = [
  {
    id: 'free',
    name: 'Free',
    price: null,
    // Zero, and that is the paywall. Not a copy decision — `consumeRep` refuses
    // at zero and `mayOpenSession` refuses to mint a credential, so this number
    // IS the voice lock. See the module note above.
    repsPerDay: 0,
    tagline: 'The outside half of the work, and every record of it. No voice.',
    features: [
      'Every field challenge, the log and the predicted-versus-actual chart',
      'Text mode against the same characters, unmetered and unlimited',
      'Streaks, ranks, session history and the Sunday review letter',
      'Every tier you open by scoring — the roster never opens by paying',
      'One voice rep when you sign up, so you know what you are deciding about',
    ],
    open: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$19',
    repsPerDay: 3,
    tagline: 'The training volume the arc actually needs: fail, adjust, succeed.',
    features: [
      'Three voice reps a day',
      'Enough to fail one, change something, and go again in a sitting',
      `${TRIAL_DAYS} days free to start, and cancel in two taps before it charges`,
      'Everything in Free — nothing is held back from it',
    ],
    open: true,
  },
  {
    id: 'elite',
    name: 'Elite',
    price: '$49',
    repsPerDay: 6,
    tagline: 'For the stretch where you are doing this every evening.',
    features: [
      'Six voice reps a day',
      'Two sittings a day, or one long one',
      'Everything in Pro — again, nothing is held back',
    ],
    open: true,
  },
]

export function planById(id: Plan): PublicPlan {
  const found = PUBLIC_PLANS.find((plan) => plan.id === id)
  if (!found) throw new Error(`No public plan for ${id}`)
  return found
}

/** The paid plans, in the order they are offered. */
export const PAID_PLANS: readonly PublicPlan[] = PUBLIC_PLANS.filter((plan) => plan.id !== 'free')

/** Whether this plan grants voice at all. The one thing the paywall turns on. */
export function hasVoice(plan: Plan): boolean {
  return planById(plan).repsPerDay > 0
}

/**
 * Reps a day, as the pages write it.
 *
 * "None" rather than "0 / day" on free. A zero in the mono data face reads as a
 * counter that has run down and will come back tomorrow, which is exactly the
 * wrong thing to tell somebody whose plan has no voice in it at all.
 */
export function repsLine(plan: PublicPlan): string {
  return plan.repsPerDay === 0 ? 'None' : `${plan.repsPerDay} / day`
}

/**
 * The fine print under every price.
 *
 * Says merchant of record rather than naming one: §14 keeps provider identity
 * abstract on purpose, and the name on the receipt is not settled until the
 * account is approved.
 */
export const BILLING_NOTE =
  'Billing is handled by our merchant of record, who is the seller of record and collects any VAT or sales tax due where you live. Cancel any time — access stays open until the end of the period you have paid for.'

/**
 * The fine print under the trial, wherever the trial is offered.
 *
 * Every clause here is a mitigation for the risk §8 of the payments plan names:
 * a card-required trial converts far better and buys some of that conversion
 * with people who forgot they subscribed, and a merchant-of-record account that
 * accumulates those disputes is an account that gets closed. Saying the date
 * and the price before the card is entered is the cheapest of the three
 * mitigations and the one that has to ship with the trial rather than after it.
 */
export const TRIAL_NOTE =
  `Your card is authorised when the trial starts and charged ${TRIAL_DAYS} days later, not before. We email you before that happens. Cancel any time from Subscription — no email, no form, and you keep the trial until the day it ends.`

/**
 * The founding-member promise, shown wherever a price is.
 *
 * Load-bearing rather than marketing: launching Pro at $19 rests on being able
 * to raise it for later cohorts if the voice-cost measurement comes in above
 * the projection, and this sentence is what makes that raise honest. Cutting a
 * price is easy; raising one is not.
 *
 * It no longer says checkout is closed, because it is not.
 */
export const CHECKOUT_NOTE =
  'This is the launch price and founding members keep it — if it goes up later, it does not go up for you.'

/** Shown in place of a buy button when no merchant of record is configured. */
export const CHECKOUT_UNCONFIGURED_NOTE =
  'Checkout is briefly unavailable while we finish setting up our payment provider. Nothing else about your account is affected, and we will email you the moment it is back.'
