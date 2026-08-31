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
import { configuredProductMap, planForProduct } from './plans'

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
    .select('last_event, plan')
    .eq('user_id', userId)
    .maybeSingle()

  const storedAt = readOccurredAt(existing?.last_event)
  if (!shouldApply(storedAt, event.occurredAt)) {
    return { ok: true, detail: `${event.type} is older than the stored state; ignored`, userId }
  }

  const purchased = planForProduct(event.productId, configuredProductMap())
  const target = resolvedPlan(event, purchased)

  // A grant for a product we cannot map is the fail-closed case in
  // `lib/billing/plans.ts`: record the money, move no plan, say so loudly.
  const unmapped = event.intent === 'grant' && purchased === null
  const mirrorPlan = target ?? (existing?.plan as Plan | undefined) ?? 'free'

  const { error: mirrorError } = await admin.from('subscriptions').upsert(
    {
      user_id: userId,
      provider: 'creem',
      provider_customer_id: event.providerCustomerId,
      provider_subscription_id: event.providerSubscriptionId,
      plan: mirrorPlan,
      status: event.status,
      current_period_end: event.currentPeriodEnd,
      cancel_at_period_end: event.cancelAtPeriodEnd,
      last_event: {
        id: event.eventId,
        type: event.type,
        occurred_at: event.occurredAt,
        product_id: event.productId,
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
      detail: `${event.type} bought product ${event.productId}, which no CREEM_PRODUCT_* variable names; plan unchanged`,
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
      renews_at: target === 'free' ? null : event.currentPeriodEnd,
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
