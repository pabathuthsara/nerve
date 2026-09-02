import 'server-only'

/**
 * Telling somebody their card is about to be charged (§14).
 *
 * Whop sends `membership.trial_ending_soon` and this is what we do with it.
 * The event itself changes no access — `lib/billing/events.ts` maps it to
 * `record` — so everything here is a side effect and every part of it is
 * best-effort. **A failure to send must never fail the webhook.** The plan has
 * already been recorded by the time this runs, and a non-200 would have Whop
 * redeliver the event twelve times over three days: twelve more chances to
 * send the same person the same email again.
 *
 * So this returns a sentence for the log and never throws.
 */

import { supabaseAdmin } from '@/lib/db/admin'
import { sendEmail } from '@/lib/email/send'
import { trialEndingEmail } from '@/lib/email/trial'
import { planById } from '@/lib/site/plans'
import { siteUrl } from '@/lib/site/origin'
import type { BillingEvent } from './events'
import { configuredPlanMap, planForWhopPlan } from './plans'

/**
 * The address to write to.
 *
 * Read from Supabase rather than from the webhook payload, even though Whop
 * sends `data.user.email`. Two reasons, and the second is the real one: the
 * payload's address is whatever they typed at Whop's checkout, which is not
 * necessarily the account this plan belongs to — and an email about somebody's
 * subscription should go to the address that can actually sign in and cancel.
 */
async function addressFor(userId: string): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin().auth.admin.getUserById(userId)
    if (error || !data.user?.email) return null
    return data.user.email
  } catch {
    return null
  }
}

export async function notifyTrialEnding(event: BillingEvent, userId: string): Promise<string> {
  const purchased = planForWhopPlan(event.planId, configuredPlanMap())
  if (!purchased || purchased === 'free') {
    // The same fail-closed rule the grant path follows: an unmapped plan means
    // we do not know what this person is about to be charged, and a reminder
    // that names the wrong price is worse than none.
    return `trial_ending_soon for an unmapped plan ${event.planId}; no mail sent`
  }

  const address = await addressFor(userId)
  if (!address) return 'trial_ending_soon for an account with no readable address; no mail sent'

  const plan = planById(purchased)
  const { subject, body } = trialEndingEmail({
    plan: purchased,
    planName: plan.name,
    price: plan.price ?? '',
    periodEnd: event.currentPeriodEnd,
    manageUrl: event.manageUrl,
    subscriptionUrl: siteUrl('/profile/subscription'),
  })

  const result = await sendEmail({ to: address, subject, body })
  return result.ok
    ? `trial-ending email sent for ${purchased}`
    : `trial-ending email NOT sent (${result.detail})`
}
