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
import { issueInterviewCredits, voidInterviewCredits } from '@/lib/db/credits'
import { planById } from '@/lib/site/plans'
import type { Plan } from '@/lib/data/types'
import type { PackId } from '@/lib/site/plans'
import type { BillingEvent } from './events'
import { creditEffectFor } from './credit-rules'
import { resolvedPlan, shouldApply } from './events'
import {
  configuredPackMap, configuredPlanMap, packForWhopPlan, planForWhopPlan,
} from './plans'

export interface ApplyResult {
  ok: boolean
  /** What happened, for the route's log. Never returned to a browser. */
  detail: string
  userId?: string
  plan?: Plan
  /** Interview credits this event added or took away. Zero when it moved none. */
  credits?: number
  /**
   * Whether delivering this event again could still fix it.
   *
   * The route answers 200 for everything it understands, deliberately: a
   * non-200 has Whop redeliver twelve times over seventy-one hours and then
   * disable the endpoint, which is the wrong answer to an unattributable
   * purchase or a plan no variable names — neither of which a thirteenth
   * delivery would resolve.
   *
   * **A failed credit write is not one of those.** It means a real charge has
   * been made and the interviews it bought are not in the account, and the
   * cause is a database that was briefly unreachable — exactly what the retry
   * schedule exists for. So this one case asks for the retry, and the route
   * answers 500 when it is set.
   */
  retryable?: boolean
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

  /**
   * A PACK IS NOT A SUBSCRIPTION, AND THE ORDER HERE IS LOAD-BEARING.
   *
   * A pack is a one-time plan under the same product. It moves a **balance**
   * and never a plan — so it must not reach the mirror, the entitlement, or
   * `shouldApply`, all three of which are about a subscription this account may
   * also have and which this event says nothing about.
   *
   * Getting the order wrong is not cosmetic. `refund.created` maps to `revoke`,
   * and a Pro subscriber refunding a $9 pack would have been dropped to free —
   * their subscription cancelled by a refund of something else entirely. The
   * branch is first for that reason, and it returns.
   */
  const pack = packForWhopPlan(event.planId, configuredPackMap())
  if (pack) return applyPackEvent(event, userId, pack)

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

  /**
   * The interview allotment that rides on the subscription (§5.2, D4).
   *
   * Best effort, and deliberately after the plan is written: a credit ledger
   * that is briefly behind is a support ticket, and a plan that failed to move
   * because the ledger was unreachable is a paying customer locked out. The
   * webhook's own retry brings this back on the next delivery, and the
   * reference makes the replay a no-op.
   */
  const credits = await applyCreditEffect(event, {
    userId,
    plan: target,
    periodEnd,
  })

  /**
   * The plan moved and the credits did not.
   *
   * Reported as retryable for the same reason a pack purchase is — a paying
   * subscriber whose month's interview did not arrive is a real loss and a
   * redelivery fixes it. The plan itself is already written and the reference
   * makes the retry a no-op for everything that did succeed, so a 500 here
   * costs nothing but a second attempt.
   */
  if (credits && !credits.ok) {
    return {
      ok: false,
      retryable: true,
      detail: `${event.type} → ${target}, but the interview credit did not land: ${credits.detail}`,
      userId,
      plan: target,
    }
  }

  return {
    ok: true,
    detail: `${event.type} → ${target}${credits ? `; ${credits.detail}` : ''}`,
    userId,
    plan: target,
  }
}

/**
 * A one-time pack purchase, refund or chargeback.
 *
 * Deliberately short, and deliberately writes nothing but the ledger. There is
 * no plan to move, no period to record and no mirror row that would mean
 * anything — `subscriptions` is keyed one-per-user and holds the subscription,
 * which a pack buyer may not have at all. Idempotency comes from the ledger's
 * unique reference rather than from `shouldApply`, which is stronger: it
 * survives an out-of-order retry without needing a stored timestamp to compare
 * against.
 */
async function applyPackEvent(
  event: BillingEvent,
  userId: string,
  pack: PackId,
): Promise<ApplyResult> {
  const result = await applyCreditEffect(event, { userId, pack })
  if (!result) {
    return { ok: true, detail: `${event.type} on pack ${pack}; no credits moved`, userId }
  }
  if (!result.ok) {
    /**
     * A REAL CHARGE WHOSE CREDITS DID NOT LAND.
     *
     * The worst outcome on this path and the one worth a retry: somebody has
     * paid $29 and has nothing. Reported as retryable so the route answers 500
     * and Whop redelivers — a database that was unreachable for a second is
     * exactly what its twelve attempts over seventy-one hours are for.
     */
    return {
      ok: false,
      retryable: true,
      detail: `${event.type} on pack ${pack} could not be credited: ${result.detail}`,
      userId,
    }
  }
  return { ok: true, detail: `${event.type} on pack ${pack}: ${result.detail}`, userId }
}

/**
 * Executes whatever `credit-rules.ts` decided, and says what happened.
 *
 * Returns a log line rather than throwing, for the same reason everything else
 * on this path does: a billing event that was applied correctly must not become
 * a 500 and twelve redeliveries because a ledger insert lost a race.
 */
async function applyCreditEffect(
  event: BillingEvent,
  context: { userId: string; pack?: PackId | null; plan?: Plan | null; periodEnd?: string | null },
): Promise<{ ok: boolean; detail: string } | null> {
  const effect = creditEffectFor(event, {
    ...(context.pack !== undefined ? { pack: context.pack } : {}),
    ...(context.plan !== undefined ? { plan: context.plan } : {}),
    ...(context.periodEnd !== undefined ? { periodEnd: context.periodEnd } : {}),
  })
  if (!effect) return null

  try {
    switch (effect.kind) {
      case 'purchase': {
        const written = await issueInterviewCredits({
          userId: context.userId,
          kind: 'purchase',
          amount: effect.credits,
          reference: effect.reference,
          metadata: { pack: effect.pack, payment_id: event.paymentId, event: event.type },
        })
        /**
         * `ok` and `changed` are two different facts and conflating them cost a
         * probe run to notice. `ok: true, changed: false` is a replay colliding
         * on the unique reference, which is the system working. `ok: false` is
         * the write FAILING — and reporting that as "already credited" would
         * put a reassuring line in the log for a customer who has paid and
         * received nothing.
         */
        if (!written.ok) return { ok: false, detail: 'the ledger refused the write' }
        return {
          ok: true,
          detail: written.changed
            ? `+${effect.credits} interview credits (${effect.pack}, never expire)`
            : 'the pack was already credited',
        }
      }
      case 'grant': {
        const written = await issueInterviewCredits({
          userId: context.userId,
          kind: 'grant',
          amount: effect.credits,
          reference: effect.reference,
          expiresAt: effect.expiresAt,
          metadata: { plan: effect.plan, payment_id: event.paymentId, event: event.type },
        })
        if (!written.ok) return { ok: false, detail: 'the ledger refused the write' }
        return {
          ok: true,
          detail: written.changed
            ? `+${effect.credits} interview credit${effect.credits === 1 ? '' : 's'} on ${effect.plan}, expiring ${effect.expiresAt}`
            : 'this period was already granted',
        }
      }
      case 'revoke': {
        const taken = await voidInterviewCredits({
          userId: context.userId,
          source: 'purchase',
          kind: 'revoke',
          upTo: effect.credits,
          reference: effect.reference,
          reason: event.type,
        })
        return {
          ok: taken.ok,
          detail: taken.credits > 0
            ? `-${taken.credits} purchased interview credits taken back`
            : 'nothing left of that pack to take back',
        }
      }
      case 'void-grants': {
        const taken = await voidInterviewCredits({
          userId: context.userId,
          source: 'grant',
          kind: 'expiry',
          // Everything the subscription was still handing out. Purchases are a
          // different source and are not named here, which is §5.5's promise
          // expressed as an argument rather than as a comment.
          upTo: Number.MAX_SAFE_INTEGER,
          reference: effect.reference,
          reason: event.type,
        })
        return taken.credits > 0
          ? { ok: taken.ok, detail: `-${taken.credits} unspent granted interview credits voided; purchased ones untouched` }
          : null
      }
    }
  } catch (error) {
    /**
     * Not `null`, which would mean "this event moved no credits".
     *
     * It moved none because something broke, and on a pack purchase those two
     * are a paid customer with their interviews and a paid customer without
     * them. Reported as a failure so the caller marks it retryable and Whop
     * delivers it again; the plan, already written above, stands either way.
     */
    console.error('[billing] the credit effect threw; the plan still stands', error)
    return { ok: false, detail: error instanceof Error ? error.message : 'the credit effect threw' }
  }
}

/** Reads the timestamp off a stored `last_event` blob, tolerating any shape. */
function readOccurredAt(lastEvent: unknown): number | null {
  if (typeof lastEvent !== 'object' || lastEvent === null || Array.isArray(lastEvent)) return null
  const value = (lastEvent as Record<string, unknown>)['occurred_at']
  return typeof value === 'number' ? value : null
}
