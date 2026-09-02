/**
 * The billing loop, against the real database (§14).
 *
 *   npm run db:billing
 *
 * `lib/billing/*.test.ts` argues the decisions in isolation. This drives the
 * consequences through the actual tables, because the thing that goes wrong in
 * billing is never the arithmetic — it is a write that RLS refuses, an upsert
 * that conflicts on the wrong column, or a plan that moves when it should not.
 *
 *   a card-backed trial records as trialing, never as active
 *   a paid subscription puts the account on the plan it bought
 *   the mirror records provider ids, period end and the event that did it
 *   a field an event does not carry is kept, not blanked
 *   an unmapped plan records the money and moves NO plan
 *   past_due keeps access, because the provider is still retrying
 *   expiry, cancellation and a dispute all land back on free
 *   a replayed event is idempotent, and a late retry cannot resurrect a plan
 *   the user can read their own subscription and cannot write it (rule 9)
 *
 * The user is deleted at the end whatever happens.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/db/types'
import { toBillingEvent } from '@/lib/billing/events'
import { hasVoice, planById } from '@/lib/site/plans'

let failures = 0

function check(passed: boolean, description: string): void {
  console.log(`  ${passed ? 'pass' : 'FAIL'}  ${description}`)
  if (!passed) failures += 1
}

const PRO_PLAN = 'plan_verify_pro'
const ELITE_PLAN = 'plan_verify_elite'
const ACCOUNT = 'biz_verify'

async function main(): Promise<void> {
  const { loadEnvLocal } = await import('./env')
  await loadEnvLocal()

  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']
  const publishable = process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']
  const secret = process.env['SUPABASE_SECRET_KEY']
  if (!url || !publishable || !secret) {
    console.error('Need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY.')
    process.exit(1)
  }

  // The harness owns the mapping rather than reading the developer's own
  // plans, so the run means the same thing on every machine.
  process.env['WHOP_PLAN_PRO'] = PRO_PLAN
  process.env['WHOP_PLAN_ELITE'] = ELITE_PLAN

  // Imported after the environment is set: `configuredPlanMap` reads it.
  const { applyBillingEvent } = await import('@/lib/billing/apply')

  const admin = createClient<Database>(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const stamp = Date.now()
  const email = `billing-${stamp}@nerve.test`
  const password = `pw-${stamp}-xyz`
  let userId = ''

  /**
   * Builds and applies one provider event, the way the route would.
   *
   * The payloads are Whop's real shapes rather than a convenient flat object,
   * because half of what `toBillingEvent` does is know which noun each event is
   * about: `membership.*` sends the membership, `payment.*` sends the payment
   * with the membership nested, and a refund buries both a level further down.
   * A harness that fed it flat objects would prove nothing about the parse.
   */
  const deliver = async (
    type: string,
    options: {
      plan?: string
      occurredAt?: number
      periodEnd?: string | null
      status?: string
      cancelAtPeriodEnd?: boolean
    } = {},
  ) => {
    const membership = {
      id: 'mem_verify_1',
      status: options.status ?? 'active',
      metadata: { user_id: userId },
      plan: { id: options.plan ?? PRO_PLAN },
      product: { id: 'prod_verify' },
      user: { id: 'user_verify_1' },
      cancel_at_period_end: options.cancelAtPeriodEnd ?? false,
      renewal_period_end:
        options.periodEnd === undefined ? '2099-01-01T00:00:00.000Z' : options.periodEnd,
      manage_url: 'https://whop.com/orders/mem_verify_1',
    }
    const payment = {
      id: 'pay_verify_1',
      status: 'succeeded',
      metadata: { user_id: userId },
      membership: { id: membership.id, status: options.status ?? 'active' },
      plan: { id: options.plan ?? PRO_PLAN },
      user: { id: 'user_verify_1' },
    }

    const data = type.startsWith('membership.')
      ? membership
      : type === 'refund.created'
        ? { id: 'ref_verify_1', payment }
        : type === 'dispute.created'
          ? { id: 'dis_verify_1', payment, plan: { id: options.plan ?? PRO_PLAN } }
          : payment

    const payload = {
      id: `msg_${Math.random().toString(36).slice(2)}`,
      type,
      api_version: 'v1',
      account_id: ACCOUNT,
      timestamp: new Date(options.occurredAt ?? Date.now()).toISOString(),
      data,
    }
    const event = toBillingEvent(payload, Date.now())
    if (!event) throw new Error(`${type} did not parse into a billing event`)
    return applyBillingEvent(event)
  }

  const planNow = async (): Promise<string | null> => {
    const { data } = await admin.from('entitlements').select('plan').eq('user_id', userId).maybeSingle()
    return data?.plan ?? null
  }

  const repsNow = async (): Promise<number | null> => {
    const { data } = await admin
      .from('entitlements')
      .select('reps_per_day')
      .eq('user_id', userId)
      .maybeSingle()
    return data?.reps_per_day ?? null
  }

  const mirrorNow = async () => {
    const { data } = await admin.from('subscriptions').select('*').eq('user_id', userId).maybeSingle()
    return data
  }

  try {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (createError || !created.user) {
      throw new Error(`Could not create the test user: ${createError?.message ?? 'no user'}`)
    }
    userId = created.user.id
    console.log(`\nBilling — ${email}\n`)

    // --- a purchase grants the plan ----------------------------------------
    console.log('a card-backed trial starting')
    // The 1 September bug, driven through the real tables: a trial that
    // records as `active` tells the account its plan renews on the day its card
    // is first charged, and §14 says a trial ending quietly closes a merchant
    // account. Access is Pro from the first minute either way.
    const trial = await deliver('membership.activated', { status: 'trialing' })
    check(trial.ok, 'the activation applies')
    check((await planNow()) === 'pro', 'a trialling account is on pro from the start')
    check((await mirrorNow())?.status === 'trialing', 'and the mirror says trialing, not active')

    console.log('\nthe first real charge')
    const paid = await deliver('payment.succeeded')
    check(paid.ok, 'the event applies')
    check((await planNow()) === 'pro', 'the account is on pro')
    check((await repsNow()) === 3, 'reps_per_day matches the authored plan')

    const mirror = await mirrorNow()
    check(mirror?.provider === 'whop', 'the mirror names the provider')
    check(mirror?.provider_subscription_id === 'mem_verify_1', 'the mirror keeps the membership id')
    check(mirror?.provider_customer_id === 'user_verify_1', 'the mirror keeps the buyer id')
    check(mirror?.status === 'active', 'the mirror says active')
    // A payment carries no period, so the date has to survive from the
    // membership event that did. Writing the absence through would blank the
    // renewal line on the subscription screen on every single renewal.
    check(
      mirror?.current_period_end !== null,
      'the renewal date survives an event that does not carry one',
    )
    check(
      typeof mirror?.last_event === 'object' && mirror?.last_event !== null,
      'the mirror kept the event that did it',
    )

    // --- idempotency --------------------------------------------------------
    console.log('\nthe same event twice')
    const replay = await deliver('payment.succeeded')
    check(replay.ok, 'a redelivery still succeeds')
    check((await planNow()) === 'pro', 'the plan is unchanged by the replay')

    // --- an upgrade ---------------------------------------------------------
    console.log('\nan upgrade')
    await deliver('membership.activated', { plan: ELITE_PLAN })
    check((await planNow()) === 'elite', 'the account moves to elite')
    check((await repsNow()) === 6, 'reps_per_day follows the new plan')

    // --- a failed payment keeps access -------------------------------------
    console.log('\na failed payment')
    await deliver('payment.failed')
    check((await planNow()) === 'elite', 'access survives past_due, because the provider is retrying')
    check((await mirrorNow())?.status === 'past_due', 'but the mirror records past_due for dunning')

    // --- a scheduled cancel keeps access -----------------------------------
    console.log('\na scheduled cancel')
    await deliver('membership.cancel_at_period_end_changed', { plan: ELITE_PLAN, cancelAtPeriodEnd: true })
    check((await planNow()) === 'elite', 'they keep what they paid for until the period ends')
    check((await mirrorNow())?.cancel_at_period_end === true, 'the mirror flags the pending cancel')

    // The flag must survive an event that says nothing about it. A payment
    // failing after a cancellation used to read a missing field as `false` and
    // quietly un-cancel the subscription on the screen.
    await deliver('payment.failed', { plan: ELITE_PLAN })
    check((await mirrorNow())?.cancel_at_period_end === true, 'and it survives an event that does not mention it')

    // --- expiry revokes ------------------------------------------------------
    console.log('\nexpiry')
    await deliver('membership.deactivated', { plan: ELITE_PLAN, status: 'expired' })
    check((await planNow()) === 'free', 'the account lands on free')
    // Zero since voice moved behind Pro: expiry is what turns the microphone
    // off, and it is read from the authored plan record rather than a literal
    // so this harness cannot assert a quota the product no longer grants.
    check(
      (await repsNow()) === planById('free').repsPerDay,
      `reps_per_day drops to free (${planById('free').repsPerDay})`,
    )
    check(!hasVoice('free'), 'and free is genuinely voiceless, which is the paywall')
    const expired = await mirrorNow()
    check(expired?.status === 'canceled', 'the mirror says canceled')
    check(expired?.plan === 'free', 'the mirror agrees the plan is gone')

    // --- a late retry cannot resurrect it ------------------------------------
    console.log('\na late retry of the original payment')
    const late = await deliver('payment.succeeded', { occurredAt: Date.now() - 86_400_000 })
    check(late.ok, 'the stale retry is acknowledged')
    check((await planNow()) === 'free', 'but it does NOT reinstate the plan it once granted')

    // --- an unmapped product ------------------------------------------------
    console.log('\na plan no variable names')
    const unmapped = await deliver('payment.succeeded', { plan: 'plan_not_ours' })
    check(!unmapped.ok, 'the apply reports a problem')
    check((await planNow()) === 'free', 'no plan is granted from an unknown plan id')
    check((await mirrorNow())?.provider_subscription_id === 'mem_verify_1', 'the money is still recorded')

    // --- a dispute ------------------------------------------------------------
    console.log('\na dispute after a fresh purchase')
    await deliver('payment.succeeded')
    check((await planNow()) === 'pro', 'the repurchase grants pro again')
    await deliver('dispute.created')
    check((await planNow()) === 'free', 'a chargeback revokes on sight (§14)')

    // --- rule 9: the owner may read and may not write -------------------------
    console.log('\nwhat the user themselves can do')
    const asUser: SupabaseClient<Database> = createClient<Database>(url, publishable)
    const { error: signInError } = await asUser.auth.signInWithPassword({ email, password })
    if (signInError) throw new Error(`Could not sign in as the test user: ${signInError.message}`)

    const { data: ownRow } = await asUser.from('subscriptions').select('plan').eq('user_id', userId).maybeSingle()
    check(ownRow?.plan === 'free', 'they can read their own subscription')

    const { error: writeError } = await asUser
      .from('subscriptions')
      .update({ plan: 'elite' })
      .eq('user_id', userId)
    const { data: afterWrite } = await admin
      .from('subscriptions')
      .select('plan')
      .eq('user_id', userId)
      .maybeSingle()
    check(
      writeError !== null || afterWrite?.plan === 'free',
      'they cannot write themselves onto a paid plan (rule 9)',
    )

    const { error: entWriteError } = await asUser
      .from('entitlements')
      .update({ plan: 'elite', reps_per_day: 6 })
      .eq('user_id', userId)
    const { data: entAfter } = await admin
      .from('entitlements')
      .select('plan')
      .eq('user_id', userId)
      .maybeSingle()
    check(
      entWriteError !== null || entAfter?.plan === 'free',
      'nor raise their own entitlement directly',
    )

    await asUser.auth.signOut()
  } finally {
    if (userId) {
      await admin.from('subscriptions').delete().eq('user_id', userId)
      await admin.auth.admin.deleteUser(userId)
      console.log('\ncleaned up.')
    }
  }

  console.log(failures === 0 ? '\nAll billing checks passed.\n' : `\n${failures} FAILED.\n`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
