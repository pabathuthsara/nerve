import 'server-only'

/**
 * Opening a checkout session (§14).
 *
 * The one job that matters here is `metadata.user_id`. It is the only thing
 * tying a payment at the merchant of record back to an account in this
 * database: the webhook reads it to decide whose plan to move, and the
 * provider keeps it on the subscription, so it survives into the renewal
 * events months later. A checkout created without it produces a real payment
 * that nobody can attribute — see `resolveUserId` in `apply.ts`, which falls
 * back to provider ids precisely because that case is recoverable but only by
 * hand.
 *
 * The API is called over `fetch` rather than through the provider's SDK, for
 * the reason §14 gives for keeping provider identifiers abstract: being
 * declined by one merchant of record is a live possibility and the replacement
 * should cost an adapter. It is one POST.
 */

import { productForPlan } from './plans'
import type { Plan } from '@/lib/data/types'

const LIVE = 'https://api.creem.io'
const TEST = 'https://test-api.creem.io'

/**
 * Test or live, chosen by the key's own prefix rather than by a second
 * variable. Two variables that can disagree is a way to point a live key at
 * the sandbox and wonder where the money went.
 */
export function apiBase(apiKey: string): string {
  return apiKey.startsWith('creem_test_') ? TEST : LIVE
}

export interface CheckoutRequest {
  userId: string
  plan: Exclude<Plan, 'free'>
  /** Where the provider returns the buyer. Absolute URL. */
  successUrl?: string
  /** Prefills the checkout form; the provider still owns the customer record. */
  email?: string
}

export interface CheckoutResult {
  ok: boolean
  url?: string
  message?: string
}

/**
 * The provider's own customer portal, which is the cancel path.
 *
 * §8 of the payments plan is blunt about why this exists: a card-required trial
 * buys some of its conversion with people who forget they subscribed, and a
 * merchant-of-record account that accumulates those disputes is an account that
 * gets closed. Of the three mitigations — the email before the first charge,
 * the visible countdown, and a cancel button that works without contacting us —
 * this is the third, and it has to ship WITH the trial rather than after it.
 *
 * It is the provider's portal rather than a cancel endpoint of our own on
 * purpose. They are the seller of record; they hold the card, the invoices and
 * the tax receipts, and a cancel we implemented ourselves would be a second
 * opinion about a subscription we do not own. It also means updating a card and
 * downloading an invoice work on the same screen, which is most of what people
 * actually arrive wanting.
 */
export async function createBillingPortal(customerId: string): Promise<CheckoutResult> {
  const apiKey = process.env.CREEM_API_KEY
  if (!apiKey) return { ok: false, message: 'Billing is not configured.' }

  try {
    const response = await fetch(`${apiBase(apiKey)}/v1/customers/billing`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ customer_id: customerId }),
    })

    if (!response.ok) {
      console.error(`[billing] portal failed: ${response.status} ${await response.text()}`)
      return { ok: false, message: 'Could not open the billing portal. Try again in a moment.' }
    }

    // Read defensively. The field has been spelled two ways across the
    // provider's own documentation, and a cancel path that 500s because a key
    // was renamed is the one failure this function must not have — the user is
    // trying to stop being charged.
    const data = (await response.json()) as Record<string, unknown>
    const url = [data['customer_portal_link'], data['portal_url'], data['url']]
      .find((value): value is string => typeof value === 'string' && value.length > 0)

    if (!url) {
      console.error('[billing] portal response carried no link', Object.keys(data))
      return { ok: false, message: 'Could not open the billing portal. Try again in a moment.' }
    }

    return { ok: true, url }
  } catch (error) {
    console.error('[billing] portal request threw', error)
    return { ok: false, message: 'Could not reach the payment provider.' }
  }
}

/**
 * Creates a checkout session and returns the URL to send the buyer to.
 *
 * Returns a result rather than throwing, like every other write in this app: a
 * thrown Server Action error reaches the client as an opaque digest, and
 * "could not open checkout" is something the button needs to be able to say.
 */
export async function createCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
  const apiKey = process.env.CREEM_API_KEY
  if (!apiKey) {
    return { ok: false, message: 'Checkout is not configured.' }
  }

  let productId: string
  try {
    productId = productForPlan(request.plan)
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'No product for that plan.' }
  }

  const body: Record<string, unknown> = {
    product_id: productId,
    // The whole point of this module.
    metadata: { user_id: request.userId },
    // Idempotency: a double-clicked buy button returns the same session rather
    // than opening a second one against the same account.
    request_id: `${request.userId}:${request.plan}`,
  }
  if (request.successUrl) body['success_url'] = request.successUrl
  if (request.email) body['customer'] = { email: request.email }

  try {
    const response = await fetch(`${apiBase(apiKey)}/v1/checkouts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      // The provider's message can name a product id, so it goes to the log
      // and not to the browser.
      console.error(`[billing] checkout failed: ${response.status} ${await response.text()}`)
      return { ok: false, message: 'Could not open checkout. Try again in a moment.' }
    }

    const data = (await response.json()) as { checkout_url?: string }
    if (!data.checkout_url) {
      console.error('[billing] checkout response carried no checkout_url')
      return { ok: false, message: 'Could not open checkout. Try again in a moment.' }
    }

    return { ok: true, url: data.checkout_url }
  } catch (error) {
    console.error('[billing] checkout request threw', error)
    return { ok: false, message: 'Could not reach the payment provider.' }
  }
}
