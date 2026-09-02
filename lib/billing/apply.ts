import 'server-only'

/**
 * Applying a billing event to an account (§14).
 *
 * This is the only thing in the codebase that moves somebody onto a paid plan.
 * It runs on the service role because it has to: `entitlements` grants a read
 * policy and nothing else, and `subscriptions` is read-own with no write policy
 * at all — a user who can write their own plan has a free product (rule 9).
 *
 * Two tables, in a deliberate order:
 *
 *   `subscriptions`  the mirror of what the provider says was bought. Written
 *                    on every event we understand, including the ones that
 *                    change no access, because reconciling a disputed charge
 *                    against a vendor dashboard six weeks later is otherwise
 *                    guesswork (see the table's own migration).
 *   `entitlements`   what the app enforces. Written only when access actually
 *                    moves.
 *
 * The mirror is written first. If the second write fails, the account is left
 * on the plan it already had with an accurate record of what was paid — which
 * a retry or a human can reconcile. The other order loses the evidence.
 */

import { supabaseAdmin } from '@/lib/db/admin'
import { planById } from '@/lib/site/plans'
import type { Plan } from '@/lib/data/types'
import type { BillingEvent } from './events'
import { resolvedPlan, shouldApply } from './events'
import { configuredPlanMap, planForWhopPlan } from './plans'

export interface ApplyResult {
  ok: boolean
  /** What happened, for the route's log. Never returned to a browser. */
  detail: string
  userId?: string
  plan?: Plan
}

/**
 * Finds the account an event belongs to.
 *
 * `metadata.user_id` is the reliable path and is set at checkout. The lookups
 * by provider id are the fallback for events that carry no metadata — a
 * dispute opened months later, or a subscription edited from the vendor
 * dashboard, neither of which passes back through our checkout.
 */
async function resolveUserId(event: BillingEvent): Promise<string | null> {
  if (event.userId) return event.userId

  const admin = supabaseAdmin()

  if (event.providerSubscriptionId) {
    const { data } = await admin
      .from('subscriptions')
      .select('user_id')
      .eq('provider_subscription_id', event.providerSubscriptionId)
      .maybeSingle()
    if (data?.user_id) return data.user_id
  }

  if (event.providerCustomerId) {
    const { data } = await admin
      .from('subscriptions')
      .select('user_id')
      .eq('provider_customer_id', event.providerCustomerId)
      .maybeSingle()
    if (data?.user_id) return data.user_id
  }

  return null
}

/**
 * Writes an event's consequences.
 *
 * Idempotent, because the provider retries: the same event arriving twice
 * upserts the same row twice and grants the same plan twice. Out-of-order
 * retries are dropped by `shouldApply` rather than allowed to reinstate a plan
 * a later event revoked.
 */
export async function applyBillingEvent(event: BillingEvent): Promise<ApplyResult> {
  const userId = await resolveUserId(event)
  if (!userId) {
    // Acknowledged and dropped on purpose. This is a real purchase that we
    // cannot attribute — retrying will not add the metadata, so it needs a
    // human, not a fifth delivery attempt.
    return { ok: false, detail: `no account for ${event.type}; needs reconciling by hand` }
  }

  const admin = supabaseAdmin()

  const { data: existing } = await admin
    .from('subscriptions')
    .select('last_event, plan, current_period_end, cancel_at_period_end, provider_customer_id, provider_subscription_id')
    .eq('user_id', userId)
    .maybeSingle()

  const storedAt = readOccurredAt(existing?.last_event)
  if (!shouldApply(storedAt, event.occurredAt)) {
    /**
     * Stale for deciding access — but it may still know something we do not.
     *
     * Whop states plainly that delivery order is not guaranteed, and the two
     * events of a single purchase are emitted in the same second. Only the
     * membership event carries the period; only it knows the day the card is
     * charged. So when the payment arrives first, the membership event that
     * follows is *older* by timestamp and `shouldApply` — correctly — refuses
     * to let it move the plan.
     *
     * Refusing to let it move the plan is not the same as refusing to read it.
     * Dropping it whole leaves the account on Pro with no charge date, and the
     * subscription screen then tells somebody whose card is charged in seven
     * days that nothing renews and nothing is charged. That is §14's
     * trial-ending-quietly failure arriving through the back door, and it
     * happened on the first real purchase.
     *
     * So a stale event may FILL a field that is currently unset, and may never
     * change one that is not. It cannot touch the plan, the status or the
     * entitlement — a late `payment.succeeded` still cannot resurrect a plan a
     * dispute revoked, which is the whole reason `shouldApply` exists.
     */
    const missingPeriod = !!event.currentPeriodEnd && !existing?.current_period_end
    if (!missingPeriod) {
      return { ok: true, detail: `${event.type} is older than the stored state; ignored`, userId }
    }

    await admin
      .from('subscriptions')
      .update({ current_period_end: event.currentPeriodEnd })
      .eq('user_id', userId)

    // The renewal date the subscription screen draws comes from `entitlements`,
    // so filling the mirror alone fixes the record and not the page. `.is(null)`
    // keeps this a fill rather than an overwrite even here.
    if (existing?.plan && existing.plan !== 'free') {
      await admin
        .from('entitlements')
        .update({ renews_at: event.currentPeriodEnd })
        .eq('user_id', userId)
        .is('renews_at', null)
    }

    return {
      ok: true,
      detail: `${event.type} is older than the stored state; filled the period end and changed nothing else`,
      userId,
    }
  }

  const purchased = planForWhopPlan(event.planId, configuredPlanMap())
  const target = resolvedPlan(event, purchased)

  // A grant for a product we cannot map is the fail-closed case in
  // `lib/billing/plans.ts`: record the money, move no plan, say so loudly.
  const unmapped = event.intent === 'grant' && purchased === null
  const mirrorPlan = target ?? (existing?.plan as Plan | undefined) ?? 'free'

  /**
   * What this event does NOT say, the stored row still knows.
   *
   * Whop puts the renewal date and the pending-cancel flag on the membership
   * and nowhere else, so a renewal `payment.succeeded` and a dunning
   * `payment.failed` both arrive carrying neither. Writing the absence through
   * would blank the renewal line on `/profile/subscription` on every renewal,
   * and would silently un-cancel a subscription somebody had already cancelled
   * the moment their card failed. An event is allowed to change these; it is
   * not allowed to forget them.
   *
   * The two provider ids are here for a sharper version of the same reason:
   * `invoice.past_due` names the user but not the membership, and losing the
   * `mem_` off the mirror would break the cancel button — for the account whose
   * payment has just failed, which is precisely the one most likely to want it.
   */
  const periodEnd = event.currentPeriodEnd ?? existing?.current_period_end ?? null
  const cancelAtPeriodEnd = event.cancelAtPeriodEnd ?? existing?.cancel_at_period_end ?? false
  const customerId = event.providerCustomerId ?? existing?.provider_customer_id ?? null
  const subscriptionId = event.providerSubscriptionId ?? existing?.provider_subscription_id ?? null

  const { error: mirrorError } = await admin.from('subscriptions').upsert(
    {
      user_id: userId,
      provider: 'whop',
      provider_customer_id: customerId,
      provider_subscription_id: subscriptionId,
      plan: mirrorPlan,
      status: event.status,
      current_period_end: periodEnd,
      cancel_at_period_end: cancelAtPeriodEnd,
      last_event: {
        id: event.eventId,
        type: event.type,
        occurred_at: event.occurredAt,
        plan_id: event.planId,
        // Whop's own page for the card and the invoices. Kept on the mirror so
        // the subscription screen can link to it without an API call.
        manage_url: event.manageUrl,
      },
    },
    { onConflict: 'user_id' },
  )

  if (mirrorError) {
    return { ok: false, detail: `could not mirror ${event.type}: ${mirrorError.message}`, userId }
  }

  if (unmapped) {
    return {
      ok: false,
      detail: `${event.type} bought plan ${event.planId}, which no WHOP_PLAN_* variable names; plan unchanged`,
      userId,
    }
  }

  if (target === null) {
    return { ok: true, detail: `${event.type} recorded; access unchanged`, userId }
  }

  const { error: planError } = await admin.from('entitlements').upsert(
    {
      user_id: userId,
      plan: target,
      reps_per_day: planById(target).repsPerDay,
      // A plan change is not a refill, the same rule `scripts/set-plan.ts`
      // follows: today's counter stands, so upgrading mid-afternoon does not
      // hand back the reps already spent.
      renews_at: target === 'free' ? null : periodEnd,
    },
    { onConflict: 'user_id' },
  )

  if (planError) {
    return { ok: false, detail: `mirrored ${event.type} but could not set the plan: ${planError.message}`, userId }
  }

  return { ok: true, detail: `${event.type} → ${target}`, userId, plan: target }
}

/** Reads the timestamp off a stored `last_event` blob, tolerating any shape. */
function readOccurredAt(lastEvent: unknown): number | null {
  if (typeof lastEvent !== 'object' || lastEvent === null || Array.isArray(lastEvent)) return null
  const value = (lastEvent as Record<string, unknown>)['occurred_at']
  return typeof value === 'number' ? value : null
}
