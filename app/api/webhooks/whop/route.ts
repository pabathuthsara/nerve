/**
 * The merchant-of-record webhook (§14).
 *
 * This endpoint is how somebody gets a paid plan. Nothing else grants one —
 * not the success redirect, which is a browser navigation anyone can type, and
 * not any client code, because `entitlements` has no write policy (rule 9).
 *
 * **It refuses to run without a secret.** Unset means every request is
 * unverifiable, and an open endpoint that grants plans is worse than a
 * webhook that is down: Whop holds the event and retries for roughly seventy-one
 * hours, so a missing variable costs a delay rather than the events.
 *
 * The work stays inline rather than moving into `after()`. Whop counts a
 * timeout as a failed attempt and redelivers it, which is the opposite of the
 * provider this route was almost rewritten for — so a slow database is a retry,
 * not a lost sale, and the simpler shape is the correct one. If p95 here ever
 * approaches Whop's five-second budget, acknowledge first and apply after; do
 * not do it pre-emptively (`docs/PAYMENTS-WHOP.md` D4).
 *
 * Node runtime, not edge, because the raw body has to survive byte-for-byte
 * for the HMAC to check out.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { applyBillingEvent } from '@/lib/billing/apply'
import { notifyTrialEnding } from '@/lib/billing/notify'
import { readAccountId, toBillingEvent } from '@/lib/billing/events'
import { SignatureError, verifyWhopSignature } from '@/lib/billing/signature'
import { billingEnvironmentRefusal } from '@/lib/billing/plans'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const secret = process.env.WHOP_WEBHOOK_SECRET
  if (!secret) {
    // 503, not 500: this is "not configured yet", and it is the status that
    // makes the provider keep the event and try again once it is.
    return NextResponse.json({ error: 'billing webhook is not configured' }, { status: 503 })
  }

  // Must be the bytes as received. Parsing and re-serialising changes key order
  // and whitespace, and every signature then fails.
  const rawBody = await request.text()

  try {
    await verifyWhopSignature(rawBody, request.headers, { secret })
  } catch (error) {
    if (error instanceof SignatureError) {
      // Deliberately terse. A caller who cannot sign gets no help diagnosing why.
      // A 401 also stops Whop retrying, which is right for a request that will
      // never verify however many times it is sent.
      return NextResponse.json({ error: 'bad signature' }, { status: 401 })
    }
    throw error
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    // Signed but unparseable is not worth retrying — it will not parse next time.
    return NextResponse.json({ error: 'malformed payload' }, { status: 400 })
  }

  /**
   * Whose account this event is about.
   *
   * Cheap, and it closes a door the signature alone does not: a correctly
   * signed event for somebody else's Whop account — a secret pasted into the
   * wrong deployment, a webhook registered against the wrong business — would
   * otherwise be applied as if it were ours. 200 rather than an error, because
   * this is not a delivery failure and a retry cannot fix it.
   */
  const configuredAccount = process.env.WHOP_ACCOUNT_ID?.trim()
  const eventAccount = readAccountId(payload)
  if (configuredAccount && eventAccount && eventAccount !== configuredAccount) {
    console.error(`[billing] ignoring an event for ${eventAccount}; this deployment is ${configuredAccount}`)
    return NextResponse.json({ ok: true, ignored: true, reason: 'account' })
  }

  /**
   * The environment gate, after the signature and before anything is granted.
   *
   * A correctly signed event is not necessarily a real payment: the sandbox
   * signs its events too, and it has hosted checkout pages that take any card.
   * So production refuses to act unless it is configured against the live host.
   * Logged loudly and acknowledged with a 200 — a retry would not fix a
   * configuration problem, and a non-200 would have Whop redeliver it twelve
   * times over three days and then disable the endpoint.
   */
  const refusal = billingEnvironmentRefusal()
  if (refusal) {
    console.error(`[billing] refusing to apply an event: ${refusal}`)
    return NextResponse.json({ ok: true, ignored: true, reason: 'environment' })
  }

  const event = toBillingEvent(payload, Date.now())
  if (!event) {
    // A 200 on purpose: an event we do not act on is not a failure, and a
    // non-200 would have the provider redeliver it for three days.
    return NextResponse.json({ ok: true, ignored: true })
  }

  try {
    const result = await applyBillingEvent(event)

    if (!result.ok) {
      // Logged rather than 500'd. These are the cases a retry cannot fix — an
      // unattributable purchase, or a plan no variable names — and they need a
      // human reading the log, not eleven more deliveries.
      console.error(`[billing] ${result.detail}`)
      return NextResponse.json({ ok: true, handled: false })
    }

    /**
     * The email before the first charge — the third of §8's three mitigations.
     *
     * Awaited rather than fired and forgotten, because Whop's budget is five
     * seconds and one Resend call is comfortably inside it, and because a
     * dangling promise on a serverless function is a promise that may never
     * run. Wrapped in its own try so that an email provider having a bad
     * afternoon cannot turn a recorded billing event into a 500 and twelve
     * redeliveries — twelve more chances to send the same person the same mail.
     */
    if (event.type === 'membership.trial_ending_soon' && result.userId) {
      try {
        console.info(`[billing] ${await notifyTrialEnding(event, result.userId)}`)
      } catch (error) {
        console.error('[billing] the trial-ending email threw; the event still stands', error)
      }
    }

    return NextResponse.json({ ok: true, handled: true })
  } catch (error) {
    // A 500 here is correct: the database was reachable a moment ago, so this
    // is the transient case the provider's retry schedule exists for.
    console.error('[billing] applying the event failed', error)
    return NextResponse.json({ error: 'could not apply the event' }, { status: 500 })
  }
}
