'use server'

/**
 * Starting a purchase, and stopping one.
 *
 * The only write path a user has anywhere near billing, and neither of these
 * writes anything: one opens a checkout at the merchant of record and hands
 * back a URL, the other asks the provider to stop the renewal. The plan itself
 * moves in `/api/webhooks/whop`, on the service role, because `entitlements`
 * grants a read policy and nothing else (rule 9). A user who can put themselves
 * on Elite by calling a Server Action is the same bug as a ledger they can edit
 * — and so is a user who can cancel somebody else's subscription, which is why
 * the membership id below is read from the mirror and never from the form.
 *
 * The plan is validated against the authored list rather than trusted from the
 * form: the argument arrives from a browser, and `whopPlanIdFor` would
 * otherwise be asked for a vendor plan for whatever string was posted.
 */

import { currentUser, supabaseServer } from '@/lib/db/server'
import { cancelMembership, createCheckout } from '@/lib/billing/checkout'
import { checkoutConfigured } from '@/lib/billing/plans'
import { PUBLIC_PLANS } from '@/lib/site/plans'
import { SUPPORT_EMAIL } from '@/components/site/site-chrome'
import type { Plan } from '@/lib/data/types'

/** The first of these that is actually a URL. Blank and whitespace are unset. */
function firstUrl(...candidates: (string | undefined)[]): string | undefined {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim()
    if (trimmed && /^https?:\/\//i.test(trimmed)) return trimmed.replace(/\/+$/, '')
  }
  return undefined
}

export interface CheckoutActionResult {
  ok: boolean
  url: string | null
  message: string | null
}

export interface CancelActionResult {
  ok: boolean
  message: string | null
}

function isPurchasable(value: string): value is Exclude<Plan, 'free'> {
  return PUBLIC_PLANS.some((plan) => plan.id === value && plan.id !== 'free')
}

export async function startCheckout(plan: string): Promise<CheckoutActionResult> {
  const user = await currentUser()
  if (!user) {
    return { ok: false, url: null, message: 'Sign in first — a plan belongs to an account.' }
  }

  if (!isPurchasable(plan)) {
    return { ok: false, url: null, message: 'That is not a plan you can buy.' }
  }

  /**
   * Refused before the provider is called, and refused with a sentence a person
   * can read.
   *
   * `whopPlanIdFor` throws naming the missing environment variable, and
   * `createCheckout` returns that message verbatim — which would put
   * "WHOP_PLAN_PRO is not set" on the screen of somebody trying to give us
   * money. The screen already hides the button when this is false; this is the
   * server saying the same thing, because a Server Action must not depend on
   * the client having drawn the right control.
   */
  if (!checkoutConfigured()) {
    return {
      ok: false,
      url: null,
      message: `Checkout is not open yet. Email ${SUPPORT_EMAIL} and we will tell you the day it is.`,
    }
  }

  /**
   * One trial per account, enforced here rather than hoped for.
   *
   * Whop's own trial eligibility is scoped to the vendor's idea of a customer,
   * and we sell two plans off one product — so "already had a trial on Pro"
   * may not stop a trialling checkout on Elite, and a second Nerve account is a
   * second email either way. Minting the checkout server-side is what makes
   * this guard possible at all: a plain checkout link could not have had one.
   *
   * A mirror row means the provider has told us about a subscription on this
   * account at some point, which is exactly the condition "has already started
   * a trial" describes. Upgrading is still allowed — this only refuses the
   * seven free days, and the screen already says `Switch to Elite` rather than
   * `Start 7 days free` once `trialAvailable` is false.
   */
  const supabase = await supabaseServer()
  const { data: existing } = await supabase
    .from('subscriptions')
    .select('provider_subscription_id')
    .eq('user_id', user.id)
    .maybeSingle()

  /**
   * Where the provider returns the buyer, and why this is `||` rather than `??`.
   *
   * An unset variable is `undefined`, but a variable set to nothing is `''` —
   * and `??` only falls back on the first. `.env.local` here carries
   * `NEXT_PUBLIC_SITE_URL=` with an empty value, which under `??` wins over the
   * app-URL fallback and yields an empty origin. That produced a relative
   * redirect URL, which the provider rejects outright.
   *
   * The failure is quiet in the version that survives: an empty origin makes
   * the ternary below drop `successUrl` entirely, so checkout still opens and
   * the buyer is simply never returned to `/profile/subscription?bought=1` —
   * they pay and land on the vendor's own page, and the confirmation banner
   * that covers the seconds before the webhook lands never fires.
   */
  const origin = firstUrl(process.env.NEXT_PUBLIC_SITE_URL, process.env.NEXT_PUBLIC_APP_URL)

  const result = await createCheckout({
    userId: user.id,
    plan,
    ...(origin ? { successUrl: `${origin}/profile/subscription?bought=1` } : {}),
  })

  if (!result.ok || !result.url) {
    return { ok: false, url: null, message: result.message ?? 'Could not open checkout.' }
  }

  // Recorded rather than acted on: the guard above is about which button the
  // screen draws, and the log is what tells us whether Whop's own eligibility
  // rules ever disagreed with ours (T7).
  if (existing?.provider_subscription_id) {
    console.info(`[billing] repeat checkout for ${user.id}; the trial is not offered again`)
  }

  return { ok: true, url: result.url, message: null }
}

/**
 * The cancel path, in one tap, on our own screen.
 *
 * §8 of the payments plan: a card-required trial is bought partly with people
 * who forget they subscribed, and a cancel that requires emailing us is how
 * those become chargebacks rather than cancellations. Chargebacks are what
 * close a merchant-of-record account, so this is account survival rather than
 * courtesy.
 *
 * Under Creem this action opened a hosted portal and the user cancelled there.
 * Whop lets us call the cancellation directly, which is the first time
 * `TRIAL_NOTE`'s promise — "no email, no form" — is literally true.
 *
 * It writes nothing. The membership id comes off the `subscriptions` mirror,
 * which the webhook writes and nobody else does; reading it here rather than
 * accepting it from the form is the rule the whole billing surface follows,
 * because a client that can post a membership id can cancel a stranger's
 * subscription. The mirror then updates when
 * `membership.cancel_at_period_end_changed` comes back.
 */
export async function cancelSubscription(): Promise<CancelActionResult> {
  const user = await currentUser()
  if (!user) {
    return { ok: false, message: 'Sign in first — a subscription belongs to an account.' }
  }

  const supabase = await supabaseServer()
  const { data } = await supabase
    .from('subscriptions')
    .select('provider_subscription_id, cancel_at_period_end')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!data?.provider_subscription_id) {
    // No mirror row means nobody has ever bought anything on this account, so
    // there is nothing to cancel. Saying so is better than a spinner that
    // resolves into an error.
    return { ok: false, message: 'There is no subscription on this account yet.' }
  }

  if (data.cancel_at_period_end) {
    // Already done. Told plainly rather than sent again, so a second tap on a
    // stale screen reads as reassurance instead of a failure.
    return { ok: true, message: 'This subscription is already set to end. Nothing more is charged.' }
  }

  const result = await cancelMembership(data.provider_subscription_id)
  if (!result.ok) {
    return {
      ok: false,
      message: result.message
        ?? `Could not cancel. Email ${SUPPORT_EMAIL} and we will cancel it by hand.`,
    }
  }

  return { ok: true, message: null }
}
