/**
 * The monthly interview-credit drip (LAUNCH-GAP D22).
 *
 * A yearly subscription pays once and is owed its credits twelve times. The
 * webhook writes the first on `payment.succeeded`; this writes the rest, one a
 * month, so that twenty-four credits never sit in an account at once. The
 * argument for that — the spend ceiling, and the $0 trial authorisation — is on
 * `creditGrants` in `lib/site/plans.ts`, and the arithmetic is in
 * `lib/billing/drip.ts` where it can be tested without a clock.
 *
 * Runs on a Vercel Cron. Nothing about it is user-triggered, and a missed run
 * costs nothing: `dripsOwed` names every slot the period has reached rather
 * than only the newest, and the ledger's unique reference refuses the ones
 * already written. So the next pass silently repairs the last one — but it must
 * not report success when a write FAILED, which is why the failure count is
 * carried out to the response instead of being swallowed.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/db/admin'
import { issueInterviewCredits } from '@/lib/db/credits'
import { dripReference, dripsOwed } from '@/lib/billing/drip'
import { OFFERS, offerFor, readBillingPeriod, type BillingPeriod } from '@/lib/site/plans'
import type { Plan } from '@/lib/data/types'

/** One run's ceiling. Anything left over is collected on the next pass. */
const BATCH = 500

export const dynamic = 'force-dynamic'

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  // Refuse rather than run open, exactly as the audio purge does. An
  // unauthenticated endpoint that MINTS CREDITS is worse than one that deletes.
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

/**
 * The periods worth reading a row for, derived rather than written down.
 *
 * A period that grants once is served entirely by the webhook and must reach
 * exactly the code it reaches today (rule 19), so it is never selected here at
 * all. Deriving this from `OFFERS` means a fourth period cannot be forgotten in
 * one of the two places.
 */
const DRIPPING_PERIODS: readonly BillingPeriod[] = [
  ...new Set(OFFERS.filter((offer) => offer.creditGrants > 1).map((offer) => offer.period)),
]

function periodOf(lastEvent: unknown): BillingPeriod | null {
  if (typeof lastEvent !== 'object' || lastEvent === null || Array.isArray(lastEvent)) return null
  return readBillingPeriod((lastEvent as Record<string, unknown>)['period'])
}

export async function GET(request: NextRequest) {
  if (!authorised(request)) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  }
  if (DRIPPING_PERIODS.length === 0) {
    return NextResponse.json({ granted: 0, failed: 0, note: 'no offer drips' })
  }

  const supabase = supabaseAdmin()

  /**
   * `active` only, and deliberately not `past_due`.
   *
   * A lapsed card has not paid for the month being granted. Nothing is lost by
   * waiting: if the retry succeeds, the very next run sees every slot it missed
   * and writes them all, because `dripsOwed` counts from the period start
   * rather than from the last run.
   */
  const { data: rows, error } = await supabase
    .from('subscriptions')
    .select('user_id, plan, current_period_end, last_event')
    .eq('status', 'active')
    .not('current_period_end', 'is', null)
    .limit(BATCH)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let granted = 0
  let credits = 0
  let failed = 0

  for (const row of rows ?? []) {
    const period = periodOf(row.last_event)
    if (!period || !DRIPPING_PERIODS.includes(period)) continue

    const offer = offerFor(row.plan as Plan, period)
    if (!offer || offer.creditGrants <= 1) continue

    const periodEnd = row.current_period_end
    if (!periodEnd) continue

    /**
     * The anchor is derived backwards from the period END, because that is the
     * field the vendor actually sends (rule 14 — the flat `current_period_end`
     * that the spec did not document). A start column would be a second thing
     * to keep true.
     */
    const start = new Date(Date.parse(periodEnd) - offer.billingDays * 24 * 60 * 60 * 1000)
    if (!Number.isFinite(start.getTime())) continue

    for (const drip of dripsOwed({ offer, periodStart: start })) {
      const written = await issueInterviewCredits({
        userId: row.user_id,
        kind: 'grant',
        amount: offer.interviewCredits,
        reference: dripReference({ periodEnd, index: drip.index }),
        expiresAt: drip.expiresAt,
        metadata: { plan: row.plan, period, drip: drip.index, source: 'cron' },
      })
      if (!written.ok) {
        failed += 1
        continue
      }
      // `changed` is the honest count: a collision on the unique reference is a
      // slot already granted, not a grant this run made.
      if (written.changed) {
        granted += 1
        credits += offer.interviewCredits
      }
    }
  }

  return NextResponse.json({ granted, credits, failed })
}
