'use server'

/**
 * Starting a purchase.
 *
 * The only write path a user has anywhere near billing, and it writes nothing:
 * it opens a session at the merchant of record and hands back a URL. The plan
 * itself moves in `/api/webhooks/creem`, on the service role, because
 * `entitlements` grants a read policy and nothing else (rule 9). A user who can
 * put themselves on Elite by calling a Server Action is the same bug as a
 * ledger they can edit.
 *
 * The plan is validated against the authored list rather than trusted from the
 * form: the argument arrives from a browser, and `productForPlan` would
 * otherwise be asked for a product for whatever string was posted.
 */

import { currentUser, supabaseServer } from '@/lib/db/server'
import { createBillingPortal, createCheckout } from '@/lib/billing/checkout'
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
   * `productForPlan` throws naming the missing environment variable, and
   * `createCheckout` returns that message verbatim — which would put
   * "CREEM_PRODUCT_PRO is not set" on the screen of somebody trying to give us
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
   * Where the provider returns the buyer, and why this is `||` rather than `??`.
   *
   * An unset variable is `undefined`, but a variable set to nothing is `''` —
   * and `??` only falls back on the first. `.env.local` here carries
   * `NEXT_PUBLIC_SITE_URL=` with an empty value, which under `??` wins over the
   * app-URL fallback and yields an empty origin. That produced a relative
   * `success_url`, which Creem rejects outright with "URL must be valid".
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
    ...(user.email ? { email: user.email } : {}),
  })

  if (!result.ok || !result.url) {
    return { ok: false, url: null, message: result.message ?? 'Could not open checkout.' }
  }

  return { ok: true, url: result.url, message: null }
}

/**
 * The cancel path, and the card-and-invoices path with it.
 *
 * §8 of the payments plan: a card-required trial is bought partly with people
 * who forget they subscribed, and a cancel that requires emailing us is how
 * those become chargebacks rather than cancellations. Chargebacks are what
 * close a merchant-of-record account, so this is account survival rather than
 * courtesy.
 *
 * The customer id comes off the `subscriptions` mirror, which the webhook
 * writes and nobody else does. Reading it here rather than accepting it from
 * the form is the same rule the whole billing surface follows: a client that
 * can post a customer id can open somebody else's billing portal.
 */
export async function openBillingPortal(): Promise<CheckoutActionResult> {
  const user = await currentUser()
  if (!user) {
    return { ok: false, url: null, message: 'Sign in first — a subscription belongs to an account.' }
  }

  const supabase = await supabaseServer()
  const { data } = await supabase
    .from('subscriptions')
    .select('provider_customer_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!data?.provider_customer_id) {
    // No mirror row means nobody has ever bought anything on this account, so
    // there is nothing to manage. Saying so is better than opening an empty
    // portal, and better than a spinner that resolves into an error.
    return { ok: false, url: null, message: 'There is no subscription on this account yet.' }
  }

  const result = await createBillingPortal(data.provider_customer_id)
  if (!result.ok || !result.url) {
    return {
      ok: false,
      url: null,
      message: result.message
        ?? `Could not open billing. Email ${SUPPORT_EMAIL} and we will cancel it by hand.`,
    }
  }

  return { ok: true, url: result.url, message: null }
}
