import 'server-only'

/**
 * Opening a checkout, and closing a subscription (§14).
 *
 * The one job that matters in `createCheckout` is `metadata.user_id`. It is the
 * only thing tying a payment at the merchant of record back to an account in
 * this database: the webhook reads it to decide whose plan to move, and Whop
 * copies checkout metadata onto both the payment and the membership, so it
 * survives into the renewal events months later. A checkout created without it
 * produces a real payment that nobody can attribute — see `resolveUserId` in
 * `apply.ts`, which falls back to provider ids precisely because that case is
 * recoverable but only by hand.
 *
 * The API is called over `fetch` rather than through the provider's SDK, for
 * the reason §14 gives for keeping provider identifiers abstract: being
 * declined by one merchant of record is a live possibility — Creem declined on
 * 1 September — and the replacement should cost an adapter. It is two POSTs.
 */

import { apiBase, apiVersionDate, whopPlanIdFor } from './plans'
import type { Plan } from '@/lib/data/types'
import type { BillingPeriod } from '@/lib/site/plans'

/**
 * Where a relative `purchase_url` is anchored.
 *
 * Whop documents the field as looking like `/checkout/ch_xxxx/`, and a leading
 * slash is a redirect to our own 404 rather than to a payment page. Absolute is
 * what it returns today; this is the two-line insurance against the day it is
 * not, and it costs nothing.
 */
const CHECKOUT_ORIGIN = 'https://whop.com'

function headers(apiKey: string): Record<string, string> {
  const version = apiVersionDate()
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${apiKey}`,
    // Several endpoints we depend on are still shipping. The pin is what makes
    // a field rename their problem rather than an outage of ours.
    ...(version ? { 'api-version-date': version } : {}),
  }
}

export interface CheckoutRequest {
  userId: string
  plan: Exclude<Plan, 'free'>
  /**
   * Which billing period was bought. Defaults to monthly, which is what every
   * caller meant before periods existed.
   *
   * It picks the vendor plan and nothing else — the entitlement that lands is
   * the same either way, because `Plan` is the entitlement and a period is not.
   */
  period?: BillingPeriod
  /** Where the provider returns the buyer. Absolute URL. */
  successUrl?: string
}

export interface CheckoutResult {
  ok: boolean
  url?: string
  message?: string
}

export interface CancelResult {
  ok: boolean
  message?: string
}

/**
 * Stops the subscription renewing, and leaves access alone until it does.
 *
 * §8 of the payments plan is blunt about why this exists: a card-required trial
 * buys some of its conversion with people who forget they subscribed, and a
 * merchant-of-record account that accumulates those disputes is an account that
 * gets closed. Of the three mitigations — the email before the first charge,
 * the visible countdown, and a cancel that works without contacting us — this
 * is the third, and it has to ship WITH the trial rather than after it.
 *
 * Under Creem this was a redirect to their hosted portal, because they held the
 * card and a cancel of our own would have been a second opinion about a
 * subscription we do not own. Whop exposes the cancellation directly, so it is
 * now one button on our own Subscription screen — which is what `TRIAL_NOTE`
 * has claimed all along ("no email, no form") and, for the first time, is
 * exactly true.
 *
 * `at_period_end` rather than `immediate`, and that is §14's rule rather than a
 * kindness: somebody who cancels on day twenty keeps the ten days they paid
 * for. It also writes nothing here. The `membership.cancel_at_period_end_changed`
 * webhook comes back and updates the mirror, so rule 9 holds — a user still
 * cannot write their own plan, even the part of it that says it is ending.
 *
 * Card updates and invoices still live at Whop; the membership carries a
 * `manage_url` for those, which the subscription screen links to separately.
 */
export async function cancelMembership(membershipId: string): Promise<CancelResult> {
  const apiKey = process.env.WHOP_API_KEY
  if (!apiKey) return { ok: false, message: 'Billing is not configured.' }

  try {
    const response = await fetch(`${apiBase()}/memberships/${encodeURIComponent(membershipId)}/cancel`, {
      method: 'POST',
      headers: {
        ...headers(apiKey),
        // A double-tapped cancel button is one cancellation, not two.
        'idempotency-key': `cancel:${membershipId}`,
      },
      body: JSON.stringify({ cancellation_mode: 'at_period_end' }),
    })

    if (!response.ok) {
      // The provider's message can name internal ids, so it goes to the log and
      // not to the browser.
      console.error(`[billing] cancel failed: ${response.status} ${await response.text()}`)
      return { ok: false, message: 'Could not cancel the subscription. Try again in a moment.' }
    }

    return { ok: true }
  } catch (error) {
    console.error('[billing] cancel request threw', error)
    return { ok: false, message: 'Could not reach the payment provider.' }
  }
}

/**
 * Creates a checkout configuration and returns the URL to send the buyer to.
 *
 * Returns a result rather than throwing, like every other write in this app: a
 * thrown Server Action error reaches the client as an opaque digest, and
 * "could not open checkout" is something the button needs to be able to say.
 */
export async function createCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
  const apiKey = process.env.WHOP_API_KEY
  if (!apiKey) {
    return { ok: false, message: 'Checkout is not configured.' }
  }

  let planId: string
  try {
    planId = whopPlanIdFor(request.plan, request.period ?? 'monthly')
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'No plan for that plan.' }
  }

  const body: Record<string, unknown> = {
    plan_id: planId,
    // The whole point of this module. Whop copies it onto the payment and the
    // membership, so every later event can still say whose this is.
    metadata: { user_id: request.userId },
  }
  if (request.successUrl) body['redirect_url'] = request.successUrl

  try {
    const response = await fetch(`${apiBase()}/checkout_configurations`, {
      method: 'POST',
      headers: {
        ...headers(apiKey),
        // Replaces Creem's `request_id`: a double-clicked buy button returns
        // one session rather than opening a second against the same account.
        // The header, not a body field — Whop rejects `idempotency_key` in the
        // body on a pinned version.
        'idempotency-key': `${request.userId}:${request.plan}`,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      // The provider's message can name a plan id, so it goes to the log and
      // not to the browser.
      console.error(`[billing] checkout failed: ${response.status} ${await response.text()}`)
      return { ok: false, message: 'Could not open checkout. Try again in a moment.' }
    }

    const data = (await response.json()) as Record<string, unknown>
    const purchaseUrl = data['purchase_url']
    if (typeof purchaseUrl !== 'string' || !purchaseUrl) {
      console.error('[billing] checkout response carried no purchase_url', Object.keys(data))
      return { ok: false, message: 'Could not open checkout. Try again in a moment.' }
    }

    return { ok: true, url: absoluteCheckoutUrl(purchaseUrl) }
  } catch (error) {
    console.error('[billing] checkout request threw', error)
    return { ok: false, message: 'Could not reach the payment provider.' }
  }
}

/** Anchors a `purchase_url` that came back as a path. Exported for its test. */
export function absoluteCheckoutUrl(purchaseUrl: string): string {
  if (/^https?:\/\//i.test(purchaseUrl)) return purchaseUrl
  return `${CHECKOUT_ORIGIN}${purchaseUrl.startsWith('/') ? '' : '/'}${purchaseUrl}`
}
