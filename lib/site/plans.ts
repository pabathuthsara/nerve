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
 * `entitlements.reps_per_day`. Change it here and there in the same commit, or
 * the page is describing a plan the database does not grant.
 *
 * Prices are the built ones, not §14's. The spec says $19 / 60 min and $39 /
 * 150 min; the build says $24 and $39 metered in reps a day. That disagreement
 * is D2 in `LAUNCH-GAP.md` and it is a business decision, not a copy decision —
 * this file quotes what the app actually grants until somebody decides.
 *
 * **The feature lists say volume and nothing else, because that is all a plan
 * changes.** The in-app comparison used to advertise "Level 1 personas" on Free
 * and "every persona" above it, and nothing in the codebase has ever worked
 * that way: tiers open on `unlockedLevels`, which counts reps scoring 70+ and
 * has never read a plan. `reps_per_day` and the daily spend cap are the only
 * two things `entitlements.plan` touches. Advertising a gate that does not
 * exist is a promise to build one — and the honest version is the better sales
 * argument anyway, since a free tier that withholds the mechanism is a demo.
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
  /** Whether checkout exists yet. False until the merchant of record is wired. */
  open: boolean
}

export const PUBLIC_PLANS: readonly PublicPlan[] = [
  {
    id: 'free',
    name: 'Free',
    price: null,
    repsPerDay: 1,
    tagline: 'Enough to find out whether you can do this at all.',
    features: [
      'One voice rep a day — three on your first day',
      'The full scorecard on every rep, with the transcript',
      'Every tier you open by scoring, up to the top of the roster',
      'Every field challenge, the log and the anxiety chart',
      'Streaks, ranks and the Sunday review letter',
      'Text mode against the same characters, unmetered',
    ],
    open: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$24',
    repsPerDay: 3,
    tagline: 'The training volume the arc actually needs: fail, adjust, succeed.',
    features: [
      'Three voice reps a day',
      'Enough to fail one, change something, and go again in a sitting',
      'Everything in Free — nothing is held back from it',
    ],
    open: false,
  },
  {
    id: 'elite',
    name: 'Elite',
    price: '$39',
    repsPerDay: 6,
    tagline: 'For the stretch where you are doing this every evening.',
    features: [
      'Six voice reps a day',
      'Two sittings a day, or one long one',
      'Everything in Pro — again, nothing is held back',
    ],
    open: false,
  },
]

export function planById(id: Plan): PublicPlan {
  const found = PUBLIC_PLANS.find((plan) => plan.id === id)
  if (!found) throw new Error(`No public plan for ${id}`)
  return found
}

/** Reps a day, as the pages write it. */
export function repsLine(plan: PublicPlan): string {
  return `${plan.repsPerDay} / day`
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

/** Shown wherever a paid plan is offered before checkout exists. */
export const CHECKOUT_NOTE =
  'Paid plans are not open yet. Start free, and we will email you the day checkout opens — founding members keep the launch price.'
