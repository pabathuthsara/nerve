/**
 * The merchant-of-record webhook (§14).
 *
 * This endpoint is how somebody gets a paid plan. Nothing else grants one —
 * not the success redirect, which is a browser navigation anyone can type, and
 * not any client code, because `entitlements` has no write policy (rule 9).
 *
 * **It refuses to run without a secret.** Unset means every request is
 * unverifiable, and an open endpoint that grants plans is worse than a
 * webhook that is down: the provider retries a 503 for six hours, so a missing
 * variable costs a delay rather than the events.
 *
 * Node runtime, not edge, because the raw body has to survive byte-for-byte
 * for the HMAC to check out.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { applyBillingEvent } from '@/lib/billing/apply'
import { toBillingEvent } from '@/lib/billing/events'
import { SignatureError, verifyCreemSignature } from '@/lib/billing/signature'
import { billingEnvironmentRefusal } from '@/lib/billing/plans'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const secret = process.env.CREEM_WEBHOOK_SECRET
  if (!secret) {
    // 503, not 500: this is "not configured yet", and it is the status that
    // makes the provider keep the event and try again once it is.
    return NextResponse.json({ error: 'billing webhook is not configured' }, { status: 503 })
  }

  // Must be the bytes as received. Parsing and re-serialising changes key order
  // and whitespace, and every signature then fails.
  const rawBody = await request.text()

  try {
    await verifyCreemSignature(rawBody, request.headers, { secret })
  } catch (error) {
    if (error instanceof SignatureError) {
      // Deliberately terse. A caller who cannot sign gets no help diagnosing why.
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
   * The environment gate, after the signature and before anything is granted.
   *
   * A correctly signed event is not necessarily a real payment: the test host
   * signs its events too, and test mode has hosted payment links that take any
   * card. So production refuses to act unless it is configured as live. Logged
   * loudly and acknowledged with a 200 — a retry would not fix a configuration
   * problem, and a non-200 would have the provider redeliver it five times.
   */
  const refusal = billingEnvironmentRefusal()
  if (refusal) {
    console.error(`[billing] refusing to apply an event: ${refusal}`)
    return NextResponse.json({ ok: true, ignored: true, reason: 'environment' })
  }

  const event = toBillingEvent(payload, Date.now())
  if (!event) {
    // A 200 on purpose: an event we do not act on is not a failure, and a
    // non-200 would have the provider redeliver it five times.
    return NextResponse.json({ ok: true, ignored: true })
  }

  try {
    const result = await applyBillingEvent(event)

    if (!result.ok) {
      // Logged rather than 500'd. These are the cases a retry cannot fix — an
      // unattributable purchase, or a product no variable names — and they
      // need a human reading the log, not four more deliveries.
      console.error(`[billing] ${result.detail}`)
      return NextResponse.json({ ok: true, handled: false })
    }

    return NextResponse.json({ ok: true, handled: true })
  } catch (error) {
    // A 500 here is correct: the database was reachable a moment ago, so this
    // is the transient case the provider's retry schedule exists for.
    console.error('[billing] applying the event failed', error)
    return NextResponse.json({ error: 'could not apply the event' }, { status: 500 })
  }
}
