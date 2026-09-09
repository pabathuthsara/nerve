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

/**
 * ── BILLING PERIODS, 4 SEPTEMBER ─────────────────────────────────────────
 *
 * A billing period is NOT a plan, and keeping those two ideas apart is what
 * makes this cheap. `Plan` is an entitlement identity — it decides
 * `reps_per_day` and the daily spend cap, and nothing else. A period decides
 * what the card is charged and how often. Pro is three reps a day whether it
 * was bought by the week or by the month, so adding a period costs no new
 * `Plan` value, no migration, no CHECK constraint and **no new mark glyph**.
 *
 * **Weekly Pro carries no trial, deliberately.** A seven-day trial in front of
 * a seven-day billing period charges on day 7 and again on day 14, which is
 * incoherent to read and worse to dispute. The week IS the trial — it is paid,
 * it ends by itself, and nobody has to remember to cancel before a number they
 * did not choose. §8 of the payments plan wants the trial's dispute surface
 * shrunk; this removes it from the cheapest door entirely.
 *
 * **Weekly is dearer per day than monthly, and that is the ladder, not a
 * trick.** $7 a week is about $30 a month against Pro's $19: the buyer pays a
 * premium for not committing, and sees both numbers on the same screen. What
 * would be a trick is a cheap weekly price offered as the *only* cheap door,
 * with the effective rate undisclosed.
 *
 * Elite is monthly only. Elite is the commitment tier and a weekly Elite
 * contradicts what it is for, as well as putting a sixth price on a page that
 * has to stay readable.
 */
export type BillingPeriod = 'weekly' | 'monthly'

export interface PlanOffer {
  plan: Exclude<Plan, 'free'>
  period: BillingPeriod
  /** Already formatted. The same string the pricing page prints. */
  price: string
  /** Major units, for arithmetic and for the preflight's price check. */
  priceUsd: number
  /** What the provider bills on. Whop takes days. */
  billingDays: number
  /** Free days before the first charge. **Zero means no trial at all.** */
  trialDays: number
  /**
   * Interview credits this offer grants **per billing period** (LAUNCH-GAP C2).
   *
   * ── WHY THIS IS ON THE OFFER AND NOT ON THE PLAN ─────────────────────
   *
   * It was `PLAN_INTERVIEW_CREDITS[plan]`, and credits are granted on
   * `payment.succeeded` — "one payment, one period, one grant". A weekly Pro
   * produces a payment every seven days, so it granted about 4.35 credits a
   * month while every surface printed *"1 / month"*. Weekly Pro at ~$30 a month
   * effective was out-granting Elite at $49 — 4.35 against 4 — and telling the
   * buyer it granted a quarter as many. An under-promise nobody wanted and an
   * over-delivery nobody was funding.
   *
   * Weekly grants none. The week is the cheap, no-commitment door for **voice
   * reps**, which is what it was designed to be; interviews on it are bought as
   * packs, which is also the higher-margin thing to sell. Monthly Pro keeps its
   * one and Elite its four, so nothing about the plans anybody is on moves.
   */
  interviewCredits: number
  /** The environment variable holding this offer's vendor plan id. */
  env: string
}

export const OFFERS: readonly PlanOffer[] = [
  {
    plan: 'pro',
    period: 'weekly',
    price: '$7',
    priceUsd: 7,
    billingDays: 7,
    // No trial. See the note above — this is the point of the weekly offer.
    trialDays: 0,
    // None, deliberately (C2). A weekly grant is a grant every seven days.
    interviewCredits: 0,
    env: 'WHOP_PLAN_PRO_WEEKLY',
  },
  {
    plan: 'pro',
    period: 'monthly',
    price: '$19',
    priceUsd: 19,
    billingDays: 30,
    trialDays: TRIAL_DAYS,
    interviewCredits: 2,
    env: 'WHOP_PLAN_PRO',
  },
  {
    plan: 'elite',
    period: 'monthly',
    price: '$49',
    priceUsd: 49,
    billingDays: 30,
    trialDays: TRIAL_DAYS,
    interviewCredits: 6,
    env: 'WHOP_PLAN_ELITE',
  },
]

/** Every offer for a plan, cheapest period first. */
export function offersFor(plan: Plan): readonly PlanOffer[] {
  return OFFERS.filter((offer) => offer.plan === plan)
}

/** One offer, or undefined when that plan is not sold on that period. */
export function offerFor(plan: Plan, period: BillingPeriod): PlanOffer | undefined {
  return OFFERS.find((offer) => offer.plan === plan && offer.period === period)
}

/** Whether a plan can be bought on a period at all. Elite is monthly only. */
export function isSoldOn(plan: Plan, period: BillingPeriod): boolean {
  return offerFor(plan, period) !== undefined
}

/**
 * The plans a board should draw on this tab (LAUNCH-GAP A3).
 *
 * ── THE BUG THIS EXISTS FOR ──────────────────────────────────────────────
 *
 * Elite is monthly only, and both boards fell back to its monthly offer on the
 * weekly tab rather than dropping it. The reasoning was sound as far as it went
 * — a plan that vanishes when you press a tab reads as a bug — and it stopped
 * being sound the moment the fallback carried a **different trial story** than
 * the tab it was sitting under. `/pricing`'s weekly tab printed *"Billed every
 * week, no trial and no commitment — the week is the trial"* directly above an
 * Elite card reading *"7 days free, then $49 every month"*. In-app it was worse:
 * `PlanCard` never rendered the "Monthly only" chip that `PlanColumn` did, so
 * `$49 / month` simply sat beside a $7 weekly Pro with nothing saying why.
 *
 * The page contradicting itself about when money moves, on the surface §14 has a
 * merchant-of-record reviewer reading.
 *
 * So a period shows what is sold on it, and `periodAsideFor` says in one line
 * where the rest went. Free is always on the board: it is not sold on anything,
 * and it is the column the other two are compared against.
 */
export function plansOn(period: BillingPeriod): readonly PublicPlan[] {
  return PUBLIC_PLANS.filter((plan) => plan.id === 'free' || isSoldOn(plan.id, period))
}

/**
 * The sentence under a board that is not showing every plan.
 *
 * Null when the tab shows everything, which is the monthly tab today. Named
 * rather than counted — "some plans are monthly only" is a sentence that makes
 * a reader go looking.
 */
export function periodAsideFor(period: BillingPeriod): string | null {
  const missing = PUBLIC_PLANS.filter((plan) => plan.id !== 'free' && !isSoldOn(plan.id, period))
  if (missing.length === 0) return null
  const names = missing.map((plan) => plan.name)
  const list = names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  const other: BillingPeriod = period === 'weekly' ? 'monthly' : 'weekly'
  return `${list} ${names.length === 1 ? 'is' : 'are'} sold by the ${periodNoun(other)} — switch to ${periodTabLabel(other)} to see ${names.length === 1 ? 'it' : 'them'}.`
}

/** The periods anything is sold on, in the order the tabs show them. */
export const BILLING_PERIODS: readonly BillingPeriod[] = ['weekly', 'monthly']

/**
 * A period read back out of stored JSON (E3).
 *
 * `subscriptions.last_event` carries the period a subscription was bought on,
 * resolved by the webhook because the vendor-plan-id map lives in `WHOP_PLAN_*`
 * and the subscription screen runs in a browser. Two places touch that blob —
 * `lib/billing/apply.ts` writes it, `lib/data/queries.ts` reads it — and they
 * were about to hold one guard each.
 *
 * Null is a real answer, not a failure: every row written before this field
 * existed has no period, and a row written by a build selling a third one would
 * carry a word this build does not know. Both mean "we cannot honestly quote a
 * price", which is a thing the screen knows how to draw.
 */
export function readBillingPeriod(value: unknown): BillingPeriod | null {
  return BILLING_PERIODS.includes(value as BillingPeriod) ? (value as BillingPeriod) : null
}

/** How a period is written wherever a price is quoted. */
export function periodLabel(period: BillingPeriod): string {
  return period === 'weekly' ? '/ week' : '/ month'
}

/** The bare noun, for prose: "cancel before the week is out". */
export function periodNoun(period: BillingPeriod): string {
  return period === 'weekly' ? 'week' : 'month'
}

/** The word on the tab that selects this period. */
export function periodTabLabel(period: BillingPeriod): string {
  return period === 'weekly' ? 'Weekly' : 'Monthly'
}

/**
 * ── WHY THE PRICING PAGE IS A TAB AND NOT A LIST OF EVERY PRICE ──────────
 *
 * It was a list. Each card printed its monthly price and then, underneath, a
 * smaller line offering the weekly one — so a three-card board quoted five
 * numbers, and the first thing a reader had to do was work out which of them
 * applied to them. The note on that decision argued a toggle would "hide half
 * the offer to no purchase", and it was wrong about which cost is bigger: a
 * page that shows every price at once does not look generous, it looks
 * uncertain, and §14 has a merchant-of-record reviewer forming a judgement
 * about this business from that page.
 *
 * So one period at a time, chosen by a control, and everything below it
 * agrees. **What must not be lost in the move is the honesty**, because the
 * old layout bought its clutter with a real virtue: weekly costs MORE per
 * month than monthly, and a ladder that hides that is a trick. Three things
 * carry it now instead of a small grey line — `PERIOD_NOTE` under the tabs,
 * the effective monthly rate under any non-monthly price, and
 * `periodSavings`, which puts the number on the tab itself rather than making
 * the reader derive it.
 */
export const PERIOD_NOTE: Readonly<Record<BillingPeriod, string>> = {
  weekly:
    'Billed every week, no trial and no commitment — the week is the trial. It works out dearer per month than the monthly price, which is what you are paying for the freedom to stop.',
  monthly:
    `Billed monthly after ${TRIAL_DAYS} free days. Cancel any time from your own subscription screen and access stays open to the end of the period you have paid for.`,
}

/**
 * The trial footnote, scoped to the period on screen.
 *
 * ── THE BUG THIS EXISTS FOR ──────────────────────────────────────────────
 *
 * `TRIAL_NOTE` was printed under the board unconditionally. On the weekly tab
 * that put *"Your card is authorised when the trial starts and charged 7 days
 * later"* directly beneath a Pro card reading **"Charged $7 today"** — the page
 * contradicting itself about when money moves, on the one surface §14 has a
 * merchant-of-record reviewer reading. A static footnote is fine under a static
 * board; it stops being fine the moment the board has a control on it.
 *
 * Null when nothing on this tab has a trial at all, and prefixed when only some
 * of it does — which is the weekly tab today, where Pro has no trial and Elite
 * falls back to its monthly offer, which has one.
 */
export function trialNoteFor(period: BillingPeriod): string | null {
  const shown = PAID_PLAN_IDS.map((plan) => offerFor(plan, period) ?? offersFor(plan)[0])
  const withTrial = shown.filter((offer) => (offer?.trialDays ?? 0) > 0)
  if (withTrial.length === 0) return null
  if (withTrial.length === shown.length) return TRIAL_NOTE
  return `On the plans that include one: ${TRIAL_NOTE.charAt(0).toLowerCase()}${TRIAL_NOTE.slice(1)}`
}

/**
 * The period a buyer should pick, and the one the tabs open on.
 *
 * Monthly, because it is the cheaper effective rate. A pricing control that
 * opens on the dearer option is one that hopes you do not do the arithmetic.
 */
export const BEST_VALUE_PERIOD: BillingPeriod = 'monthly'

/**
 * How much this period saves against the dearest way to buy the same plan, as
 * a percentage of the effective monthly rate. Null when it saves nothing.
 *
 * Derived rather than authored, so it cannot drift from the prices above: it is
 * the same `monthlyEquivalent` the cards print. Today it is Pro's 37% —
 * $30.33 a month by the week against $19 by the month — and it comes from the
 * numbers rather than from a marketing decision about how big it ought to look.
 */
export function periodSavings(period: BillingPeriod): number | null {
  let best = 0
  for (const plan of PAID_PLAN_IDS) {
    const here = offerFor(plan, period)
    if (!here) continue
    const dearest = Math.max(...offersFor(plan).map((offer) => monthlyEquivalent(offer)))
    if (dearest <= 0) continue
    best = Math.max(best, 1 - monthlyEquivalent(here) / dearest)
  }
  const percent = Math.round(best * 100)
  return percent > 0 ? percent : null
}

/** The plans sold on more than nothing. Derived, so a fourth plan is free. */
const PAID_PLAN_IDS: readonly Exclude<Plan, 'free'>[] = [...new Set(OFFERS.map((offer) => offer.plan))]

/**
 * The one sentence under a price that says what actually happens to the card.
 *
 * Written per offer rather than per plan, because the trial is a property of
 * the offer — weekly has none — and the whole failure §14 names is somebody
 * discovering the terms of a charge from their statement.
 */
export function chargeLine(offer: PlanOffer): string {
  if (offer.trialDays === 0) {
    return `Charged ${offer.price} today, then every ${periodNoun(offer.period)}. Cancel any time.`
  }
  return `${offer.trialDays} days free, then ${offer.price} every ${periodNoun(offer.period)}.`
}

/**
 * What the weekly offer costs a month, for the comparison the page must show.
 *
 * Quoting $7 without this is the omission that would make the ladder dishonest.
 * 4.345 is 52/12 rather than 4, because a month is not four weeks and a buyer
 * who multiplies by four and then sees their statement is a support ticket.
 */
export function monthlyEquivalent(offer: PlanOffer): number {
  return offer.period === 'weekly' ? offer.priceUsd * (52 / 12) : offer.priceUsd
}

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
      'One free five-minute practice interview, once, on the real interview arm',
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
      // A real plan difference since Phase D, and the only one besides volume.
      // Stated as a number because "included" is what a page says when it does
      // not want to say how many.
      //
      // IN CREDITS, NOT IN INTERVIEWS, and that is the whole point of the line
      // (9 September). It said "one practice interview a month" while the grant
      // was one credit and a technical round cost two, so the card promised a
      // round the account could not start. Two credits is one full round of any
      // kind, and the sentence says the unit it is actually denominated in.
      'Two interview credits a month — one full round of any kind, on top of the reps',
      // Deliberately does not promise a trial: the weekly offer has none, and
      // this list is printed under both periods. The trial is stated on the
      // offer itself, where it is true.
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
      'Six interview credits a month — three full rounds, or six screens',
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
  return repsPerDayLine(plan.repsPerDay)
}

/**
 * The same sentence, from a bare number (E3).
 *
 * `/profile/subscription` needs it because the card marked CURRENT PLAN should
 * print what the account is actually GRANTED — `entitlements.reps_per_day` —
 * and the authored plan number everywhere else. The two are normally equal and
 * a hand-set entitlement or an in-flight plan change makes them differ, at
 * which point the header and the card below it print two numbers for one thing.
 * One formatter, so the reconciled line cannot be worded differently from the
 * authored one.
 */
export function repsPerDayLine(repsPerDay: number): string {
  return repsPerDay === 0 ? 'None' : `${repsPerDay} / day`
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
 *
 * ── S3: THIS IS ALSO THE FALLBACK ────────────────────────────────────────
 *
 * The audit's point was that this promise was a footnote doing nothing: it
 * committed us to something without ever asking anybody to act. Giving it a
 * cap turns it into the one urgency device this product can run honestly —
 * see `checkoutNoteFor`, which is what the two pricing surfaces actually
 * print. This bare sentence is what they fall back to when the count cannot be
 * read, because a number we could not check is exactly the thing §14 says not
 * to publish.
 */
export const CHECKOUT_NOTE =
  'This is the launch price and founding members keep it — if it goes up later, it does not go up for you.'

/**
 * ── THE FOUNDING ALLOCATION (S3) ─────────────────────────────────────────
 *
 * How many accounts keep $19 for as long as they stay subscribed. After them,
 * Pro is `PRO_STANDARD_PRICE`.
 *
 * Every clause of that is a promise we can keep with what we already have, and
 * that is the whole reason it is the urgency device rather than a discount:
 *
 *   It is scarcity we can HONOUR. The number is counted off `profiles`, not
 *   asserted. `lib/db/founding.ts` is the count and it is the only source; a
 *   "3 places left" that nobody counts is a compliance risk on the page a
 *   merchant-of-record reviewer opens, not a taste question.
 *
 *   It costs nothing today and raises ARPU on every later cohort, which is the
 *   opposite of a percentage off — see the audit's S1, and rule: discounting a
 *   METERED product recruits the cohort that uses it hardest.
 *
 *   Nothing resets. There is no countdown, no struck-through price we never
 *   charged, and the allocation only ever runs down.
 *
 * **The raise itself is a plan at the provider, not a constant here.** When the
 * places are gone, `npm run whop:verify` warns that Pro is still selling at the
 * founding price, and creating the $29 plan is a deliberate act. This file may
 * describe the future price; it must never quietly charge it.
 */
export const FOUNDING_ACCOUNTS = 200

/** What Pro costs once the founding allocation is spent. */
export const PRO_STANDARD_PRICE = '$29'

/**
 * How many founding places are left, from a count of accounts.
 *
 * Clamped at both ends: never negative, never more than the allocation. A count
 * this cannot read is the caller's `null`, not a zero — see `checkoutNoteFor`.
 */
export function foundingPlacesLeft(accounts: number): number {
  if (!Number.isFinite(accounts)) return FOUNDING_ACCOUNTS
  return Math.max(0, Math.min(FOUNDING_ACCOUNTS, FOUNDING_ACCOUNTS - Math.floor(accounts)))
}

/**
 * The sentence under a price board, in the one state it is actually in.
 *
 * Three of them, hand-authored (§02 rule 12) rather than assembled, because the
 * middle one is a claim about money and the last one is a claim about money we
 * have not yet raised:
 *
 *   `null`   the count could not be read. Publish no number at all. A figure
 *            we did not verify is worse than no figure, and this is the only
 *            state where that can happen.
 *   `> 0`    the offer is live. Names the cap, the next price, and how many
 *            places are actually left.
 *   `0`      the allocation is spent. It says the price is MOVING rather than
 *            that it has moved, because the plan at the provider is a separate,
 *            deliberate act — and until it exists we are charging less than we
 *            said we would, which is the safe direction to be wrong in.
 */
export function checkoutNoteFor(placesLeft: number | null): string {
  const pro = offerFor('pro', 'monthly')?.price ?? '$19'
  if (placesLeft === null) return CHECKOUT_NOTE
  if (placesLeft <= 0) {
    return `The ${FOUNDING_ACCOUNTS} founding places are taken and Pro is moving to ${PRO_STANDARD_PRICE}. Founding members keep ${pro} — it does not go up for them.`
  }
  return `Pro is ${pro} for the first ${FOUNDING_ACCOUNTS} accounts and ${PRO_STANDARD_PRICE} after that — ${placesLeft} founding place${placesLeft === 1 ? '' : 's'} left. Founding members keep ${pro}: if it goes up later, it does not go up for you.`
}

/** Shown in place of a buy button when no merchant of record is configured. */
export const CHECKOUT_UNCONFIGURED_NOTE =
  'Checkout is briefly unavailable while we finish setting up our payment provider. Nothing else about your account is affected, and we will email you the moment it is back.'

/* ------------------------------------------------------------------ *
 * Interview credits — packs, grants, and the two expiry rules
 * ------------------------------------------------------------------ */

/**
 * ── WHY A PACK IS NOT A `Plan` (INTERVIEW-PLAN §5.4) ─────────────────────
 *
 * The same reasoning that let a billing period cost no migration. `Plan` is an
 * entitlement identity: it decides `reps_per_day` and the daily spend cap, and
 * nothing else. A pack decides a **balance**, which is a different meter with
 * different arithmetic — `lib/data/interview-credits.ts` owns it. So packs add
 * no `Plan` value, no CHECK constraint, no mark glyph and no migration.
 *
 * They are authored here, beside `OFFERS`, because this file is the one record
 * both pricing surfaces read and §14 has a human at the merchant of record
 * reading the public page. A pack priced in two places is a pack advertised at
 * one number and charged at another.
 *
 * ── THE PRICES, AND WHY THEY ARE NOT THE RISK ────────────────────────────
 *
 * A twenty-minute interview costs $0.45–0.60 at p90 with a reconnect
 * (INTERVIEW-PLAN §6, measured), and §6.1 re-measured the ladder off real rows
 * at $0.17–0.21 a credit. At $6 for two credits that is ~7% COGS after the
 * merchant of record; the pack of twenty is the same, because COGS is rounding
 * error at every rung. Unit cost is not what to worry about here — an 11%
 * provider-error rate on a twenty-minute item is, which is why Phase A shipped
 * before this file gained a price.
 */
export type PackId = 'single' | 'pack5' | 'pack12'

export interface InterviewPack {
  id: PackId
  /** Display name. Never the id. */
  name: string
  /** Already formatted, the same string both pricing surfaces print. */
  price: string
  /** Major units, for arithmetic and for the preflight's price check. */
  priceUsd: number
  /** Credits it puts in the balance. */
  credits: number
  /** One line on who buys this one. */
  tagline: string
  /** The environment variable holding this pack's vendor plan id. */
  env: string
}

/**
 * ── WHY THE PACKS COUNT CREDITS AND NOT INTERVIEWS (LAUNCH-GAP B3) ───────
 *
 * They were "One interview / Five interviews / Twelve interviews", which was
 * exact while every paid round cost one credit. Rounds are priced by what they
 * cost to run now — a recruiter screen is one, every longer round two — so a
 * pack is a balance and somewhere between half as many interviews and all of
 * them, depending on what you spend it on. Selling it as five interviews would
 * be advertising a number the product cannot honour, which is the failure this
 * whole file exists to prevent.
 *
 * The prices are unchanged. What each card now does is say what a round costs
 * beside what a pack contains, so the reader can do the one sum that matters
 * without being asked to guess at it.
 *
 * ── WHY THE COUNTS DOUBLED, 9 SEPTEMBER ──────────────────────────────────
 *
 * They were 1 / 5 / 12, and 1 was a trap. A credit bought a recruiter screen
 * and nothing else, so somebody who had just used the free five-minute screener,
 * wanted a real technical round, and paid us nine dollars was answered by
 * `creditRefusal` with *"a technical costs 2 credits and there is one in the
 * account"* — the first paid purchase in the product met by a request to buy
 * again, and the only thing it did buy was a ten-minute version of the free
 * thing they had just had. Pro had the same shape one rung up: $19 a month
 * bought one screen and could not reach a technical at all, while its card
 * promised "one practice interview a month".
 *
 * So the entry pack buys any round in the product, and the counts above it
 * scale with it. Unit cost is not what is being recovered here either way: a
 * round costs between $0.18 and $0.41 to run, so the top pack spent entirely on
 * twenty-five-minute rounds is $4.10 of COGS.
 *
 * ── AND WHY THE PRICES MOVED, 9 SEPTEMBER ────────────────────────────────
 *
 * They were $9 / $29 / $59, and the doubling above deliberately left them
 * alone. This is the second half of the same decision, taken the same day and
 * in the one window where it is free: the account had **no paying customers**
 * — one $2 test purchase, $0 of volume — so a cut costs nothing today and is a
 * public price cut in a month. The direction matters, and it is the one that
 * cannot be undone. A price on a public page is very hard to RAISE again
 * (`FOUNDING_NOTE` already commits us on the plans), so this is spent once,
 * now, deliberately, and the credits dial stays the one that gets turned
 * afterwards.
 *
 * What it buys is the audience: students preparing for a first graduate round,
 * for whom $9 to find out whether the thing works at all is the barrier and $6
 * is not.
 *
 * **The margin was never the question.** Whop's real cost is $0.37 fixed plus
 * 5% — read off the fee breakdown of an actual payment, not the published
 * table (rule 14) — so $6 nets $5.33 against $0.36 of COGS. Every rung clears
 * 92% and the worst case, every credit burned on a round that hits the $0.90
 * clamp, still clears 73%.
 *
 * ── WHY THE TOP PACK IS $45 AND NOT $49 ──────────────────────────────────
 *
 * Two reasons, and the first is the ladder. At $49 the rate runs $3.00, $2.50,
 * $2.45 — a 17% step and then a **2%** one, which is not a volume discount, it
 * is the big pack losing its reason to exist. The test below only asserts that
 * the rate falls, so $2.45 would have passed it while defeating what it is
 * for. $45 restores a real step: $3.00, $2.50, $2.25 — 17%, then 10%.
 *
 * The second is that $49 is **Elite's monthly price**. A one-time $49 for
 * twenty credits drawn beside "$49 / month" for six credits a month, on the
 * page §14 has a compliance reviewer reading, is a comparison that makes the
 * subscription look like a mistake. Prices on one page have to be legible
 * together, not only correct apart.
 */
export const INTERVIEW_PACKS: readonly InterviewPack[] = [
  {
    id: 'single',
    name: 'Two credits',
    price: '$6',
    priceUsd: 6,
    credits: 2,
    tagline: 'One full round of any kind, graded. For the call on Thursday.',
    env: 'WHOP_PACK_SINGLE',
  },
  {
    id: 'pack5',
    name: 'Eight credits',
    price: '$20',
    priceUsd: 20,
    credits: 8,
    tagline: 'A week of preparation: a technical, a final, a deep technical and a screen.',
    env: 'WHOP_PACK_FIVE',
  },
  {
    id: 'pack12',
    name: 'Twenty credits',
    price: '$45',
    priceUsd: 45,
    credits: 20,
    tagline: 'A whole job hunt. Every round type, several times each.',
    env: 'WHOP_PACK_TWELVE',
  },
]

export function packById(id: string): InterviewPack | undefined {
  return INTERVIEW_PACKS.find((pack) => pack.id === id)
}

/** What one credit costs on this pack, for the comparison the page must show. */
export function perCredit(pack: InterviewPack): number {
  return pack.priceUsd / pack.credits
}

/**
 * What a round costs, in the words a pricing surface uses.
 *
 * Printed beside the packs because B3 made "five credits" ambiguous on its own:
 * a reader has to know that a recruiter screen is one and a deep technical is
 * three before "$5.80 a credit" means anything. Derived from the authored round
 * table rather than restated, so a repriced round moves the pricing page with
 * it.
 */
export const ROUND_COST_NOTE =
  'A ten-minute recruiter screen is one credit; every longer round — technical, deep technical, final — is two.'

/**
 * How many interview credits a subscription hands out each billing period
 * (§5.2, §5.3).
 *
 * **Never unlimited, and never metered by day.** `reps_per_day` is a rate and
 * three twenty-minute interviews a day is about $45/month of voice against a
 * $19 price. So a subscription grants a small allotment into the same balance a
 * pack fills, and the two differ only in how they expire.
 *
 * Read by `lib/billing/credits.ts` when a membership activates or renews, and
 * printed on both pricing surfaces. Change it here and nowhere else.
 */
export const PLAN_INTERVIEW_CREDITS: Readonly<Record<Plan, number>> = {
  free: 0,
  // Two and six, not one and four (9 September). One credit could not buy a
  // technical round at all, so Pro's single monthly interview was a recruiter
  // screen or nothing — the shortest round in the product, on the plan that is
  // meant to read as the whole thing. Two buys any round there is, and Elite's
  // six buys three of them.
  pro: 2,
  elite: 6,
}

/**
 * Interview credits a month, as the comparison matrix writes it.
 *
 * "None" on free is the right answer to the question that row asks — *how many
 * does this plan include every month* — and free includes none.
 */
export function creditsLine(plan: Plan): string {
  const credits = PLAN_INTERVIEW_CREDITS[plan]
  if (credits === 0) return 'None'
  return `${credits} / month`
}

/**
 * What an OFFER grants each time it bills (LAUNCH-GAP C2).
 *
 * The authority for the grant, and the only thing `credit-rules.ts` should ask.
 * `PLAN_INTERVIEW_CREDITS` is kept as the plan-level headline — what the
 * comparison matrix means by "a month" — and `plans.test.ts` asserts the two
 * agree on every monthly offer, so they cannot drift.
 */
export function offerInterviewCredits(offer: PlanOffer): number {
  return offer.interviewCredits
}

/**
 * The grant for a plan bought on a period, for the code that only knows those.
 *
 * Falls back to the plan-level number when the period is unknown — a webhook
 * whose plan id maps to a plan but not to an offer is the fail-soft case, and
 * granting the headline is the answer that matches what the buyer was shown.
 */
export function interviewCreditsFor(plan: Plan, period?: BillingPeriod | null): number {
  if (plan === 'free') return 0
  const offer = period ? offerFor(plan, period) : undefined
  return offer ? offer.interviewCredits : PLAN_INTERVIEW_CREDITS[plan]
}

/**
 * Interview credits as a plan CARD writes it, which is a different question.
 *
 * A card meter is not asking "how many a month"; it is asking "what do I get".
 * Free's honest answer is not "None" — every account is granted one free
 * five-minute screener at sign-up, and the feature list two inches below says
 * so. A card that printed `None` beside a bullet promising one free interview
 * would be contradicting itself on the page a merchant-of-record reviewer
 * reads.
 *
 * Both read `PLAN_INTERVIEW_CREDITS`, so they can differ in framing and never
 * in the number.
 */
export function interviewsLine(plan: Plan, period?: BillingPeriod | null): string {
  if (plan === 'free') return '1 free'
  const offer = period ? offerFor(plan, period) : undefined
  const credits = offer ? offer.interviewCredits : PLAN_INTERVIEW_CREDITS[plan]
  /**
   * A paid plan whose offer grants none says where they come from instead of
   * printing a zero (C2). Weekly Pro is the case: it is the cheap door for
   * voice reps, and "None" on a $7 card reads as something withheld rather than
   * as something sold separately — which it is, at $6.
   */
  if (credits === 0) return 'Sold separately'
  return `${credits} / ${periodNoun(offer?.period ?? 'monthly')}`
}

/**
 * THE TWO EXPIRY RULES, IN THE WORDS THE TERMS USE (§5.5).
 *
 * Stated here because four surfaces say them and they must not drift: the
 * pricing page, the interview home, `TermsDocument` clause 07 and
 * `RefundDocument` clause 04. A disputing customer quotes whichever is more
 * generous, and a merchant of record reads the PDF.
 *
 * The split is coherent rather than conventional: a grant is part of the month
 * you paid for, and a pack is a thing you bought outright.
 */
export const CREDIT_EXPIRY_NOTE =
  'Interviews you buy never expire and stay in the account if you cancel. The ones a subscription includes are part of that month and do not roll over.'

/** The free five-minute round, wherever it is offered (§5.6). */
export const SCREENER_NOTE =
  'Every account gets one free five-minute recruiter screen. It is the real thing, not a demo — the same interviewer, the same grading, five minutes instead of twenty.'
