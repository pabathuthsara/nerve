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
import { INTERVIEW_PACKS, PLAN_INTERVIEW_CREDITS, hasVoice, packById, planById } from '@/lib/site/plans'

let failures = 0

function check(passed: boolean, description: string): void {
  console.log(`  ${passed ? 'pass' : 'FAIL'}  ${description}`)
  if (!passed) failures += 1
}

const PRO_PLAN = 'plan_verify_pro'
const ELITE_PLAN = 'plan_verify_elite'
/**
 * The WEEKLY Pro vendor plan.
 *
 * A different vendor plan resolving to the SAME entitlement is the whole
 * periods model, and it is the thing that would break silently: an unmapped
 * plan id fails closed and grants nothing, so a buyer would be charged $7 and
 * left on free. This is the id that proves the second row of `planMap` works.
 */
const PRO_WEEKLY_PLAN = 'plan_verify_pro_weekly'
/**
 * The one-time plans behind the three interview packs (INTERVIEW-PLAN D3).
 *
 * A pack resolves to a BALANCE and never to a plan, which is the thing this
 * harness has to prove: the same `refund.created` that revokes a subscription
 * must take credits back and leave a Pro subscriber on Pro.
 */
const PACK_PLANS: Record<string, string> = {
  single: 'plan_verify_pack_single',
  pack5: 'plan_verify_pack_5',
  pack12: 'plan_verify_pack_12',
}
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
  process.env['WHOP_PLAN_PRO_WEEKLY'] = PRO_WEEKLY_PLAN
  process.env['WHOP_PLAN_ELITE'] = ELITE_PLAN
  process.env['WHOP_PACK_SINGLE'] = PACK_PLANS['single']!
  process.env['WHOP_PACK_FIVE'] = PACK_PLANS['pack5']!
  process.env['WHOP_PACK_TWELVE'] = PACK_PLANS['pack12']!

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
      /**
       * The `pay_` this event carries.
       *
       * Distinct per charge, because that is the idempotency key every
       * interview credit is written against (`credit-rules.ts`): one payment is
       * one period is one grant, and a replay of the same id must add nothing.
       */
      payment?: string
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
      id: options.payment ?? 'pay_verify_1',
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

  /** The live balance per source, read through the same RPC the app reads. */
  const creditsNow = async (): Promise<Record<string, number>> => {
    const { data } = await admin.rpc('interview_credit_balance', { p_user_id: userId })
    const rows = (Array.isArray(data) ? data : []) as { source: string; remaining: number }[]
    const out: Record<string, number> = { grant: 0, purchase: 0, screener: 0 }
    for (const row of rows) out[row.source] = row.remaining ?? 0
    return out
  }

  const tracksNow = async (): Promise<string[]> => {
    const { data } = await admin.from('profiles').select('unlocked_tracks').eq('id', userId).maybeSingle()
    return data?.unlocked_tracks ?? []
  }

  /** Every ledger row for this account, newest first. */
  const ledgerNow = async () => {
    const { data } = await admin
      .from('interview_credit_entries')
      .select('kind, source, amount, expires_at, reference')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    return data ?? []
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

    // --- the weekly offer -----------------------------------------------------
    //
    // Same entitlement, different vendor plan. If this ever grants anything but
    // `pro` with three reps, somebody has paid $7 for the wrong thing — or for
    // nothing, because an unresolved plan id fails closed.
    console.log('\nthe weekly offer, which is a different plan id for the same entitlement')
    await deliver('payment.succeeded', { plan: PRO_WEEKLY_PLAN })
    check((await planNow()) === 'pro', 'a WEEKLY purchase grants pro, not a separate plan')
    check((await repsNow()) === 3, 'and the same 3 reps a day the monthly offer grants')
    // Put it back where this block found it. The check that follows asserts an
    // unknown plan id grants NOTHING, and its precondition is an account on
    // free — leaving this one on pro would let that assertion pass for the
    // wrong reason, which is worse than failing.
    await deliver('membership.deactivated', { plan: PRO_WEEKLY_PLAN, status: 'expired' })
    check((await planNow()) === 'free', 'and it expires back to free like any other')

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

    // --- out of order, which Whop does not guarantee against ------------------
    /**
     * The first real purchase, 2 September, drove this.
     *
     * Both events of one purchase are emitted in the same second and only the
     * membership carries the period. When the payment lands first, the
     * membership event that follows is OLDER by timestamp, and a plain
     * staleness check drops it whole — leaving the account on a paid plan with
     * no charge date, so the subscription screen tells somebody whose card is
     * charged in seven days that nothing renews and nothing is charged.
     *
     * The precondition is set directly rather than assumed, because by this
     * point in the run the row already carries a period from earlier steps.
     */
    console.log('\nan out-of-order membership event that knows the charge date')
    await deliver('payment.succeeded')
    await admin.from('subscriptions').update({ current_period_end: null }).eq('user_id', userId)
    await admin.from('entitlements').update({ renews_at: null }).eq('user_id', userId)
    check((await mirrorNow())?.current_period_end === null, 'the stored row has no charge date')

    const older = await deliver('membership.activated', {
      occurredAt: Date.now() - 60_000,
      periodEnd: '2099-06-01T00:00:00.000Z',
      status: 'trialing',
    })
    check(older.ok, 'the older membership event is acknowledged')
    check(
      String((await mirrorNow())?.current_period_end).startsWith('2099-06-01'),
      'it FILLS the charge date the payment did not carry',
    )
    const entAfterFill = await admin
      .from('entitlements').select('renews_at').eq('user_id', userId).maybeSingle()
    check(
      String(entAfterFill.data?.renews_at).startsWith('2099-06-01'),
      'and the renewal date the subscription screen actually draws',
    )
    check((await mirrorNow())?.status === 'active', 'but it does NOT roll the status back to trialing')
    check((await planNow()) === 'pro', 'and it does NOT move the plan a newer event decided')

    // Put the account back where the dispute left it. This section borrowed a
    // paid plan to have a period worth filling, and the checks below assert on
    // a revoked one — a harness step that quietly changes the state its
    // successors read is how a suite starts failing for reasons nobody wrote.
    await deliver('membership.deactivated', { status: 'expired' })
    check((await planNow()) === 'free', 'and the account is put back on free for what follows')

    /* ================================================================== *
     * INTERVIEW CREDITS (INTERVIEW-PLAN D3, D4, D5, E1)
     *
     * A pack is a BALANCE and a subscription is an ENTITLEMENT, and the whole
     * point of this block is that the two never touch each other. The most
     * expensive thing it asserts is a single sentence from §5.5 — "a user who
     * cancels keeps every credit they paid for and loses only the ones this
     * month's subscription was handing them" — because that is the sentence
     * the terms are written on and the one a disputing customer will quote.
     * ================================================================== */

    console.log('\nwhat a brand-new account starts with (D5, E1)')
    // The free five-minute screener, granted by `handle_new_user` at sign-up,
    // and the interview track opened by the trigger that fires off it. Both
    // are asserted here rather than assumed, because both are database rules
    // with no application code to read: if the migration is ever reverted,
    // this is the only thing that would notice.
    const opening = await creditsNow()
    check(opening['screener'] === 1, `it holds one free screener (${opening['screener']})`)
    check(opening['purchase'] === 0 && opening['grant'] === 0, 'and nothing it has not been given')
    check((await tracksNow()).includes('interview'), 'and the interview track is open on it')

    console.log('\na pack purchase')
    const packFive = packById('pack5')!
    const bought = await deliver('payment.succeeded', { plan: PACK_PLANS['pack5'], payment: 'pay_pack_a' })
    check(bought.ok, 'the purchase applies')
    check((await creditsNow())['purchase'] === packFive.credits,
      `it credits the ${packFive.credits} interviews the pack sells`)
    // A pack is not a subscription. Nothing about the plan may have moved.
    check((await planNow()) === 'free', 'and it moves NO plan — a pack is a balance, not an entitlement')
    const purchaseRow = (await ledgerNow()).find((row) => row.kind === 'purchase')
    check(purchaseRow?.expires_at === null, 'purchased credits carry no expiry, which the CHECK also enforces (§5.5)')

    console.log('\nthe same purchase delivered again')
    // Whop redelivers an unacknowledged event twelve times over seventy-one
    // hours. Eleven of those must be worth nothing.
    await deliver('payment.succeeded', { plan: PACK_PLANS['pack5'], payment: 'pay_pack_a' })
    check((await creditsNow())['purchase'] === packFive.credits, 'the replay credits nothing more')

    console.log('\na second pack, genuinely bought')
    const single = packById('single')!
    await deliver('payment.succeeded', { plan: PACK_PLANS['single'], payment: 'pay_pack_b' })
    check((await creditsNow())['purchase'] === packFive.credits + single.credits,
      'a different payment is a different purchase, and it credits again')

    console.log('\na subscription grant (D4)')
    // The trial's activation first, so there is a period end to expire against
    // — and so that this asserts the thing that would have double-granted.
    await deliver('membership.activated', { status: 'trialing', periodEnd: '2099-03-01T00:00:00.000Z' })
    check((await creditsNow())['grant'] === 0,
      'membership.activated grants NOTHING — the trial\'s $0 payment is what grants (D2)')
    await deliver('payment.succeeded', { payment: 'pay_period_1', periodEnd: '2099-03-01T00:00:00.000Z' })
    check((await creditsNow())['grant'] === PLAN_INTERVIEW_CREDITS.pro,
      `the payment grants Pro's ${PLAN_INTERVIEW_CREDITS.pro} interview credit`)
    const grantRow = (await ledgerNow()).find((row) => row.kind === 'grant')
    check(String(grantRow?.expires_at ?? '').startsWith('2099-03-01'),
      'and it expires at the end of the period that handed it out (§5.5)')

    console.log('\nthe same period delivered again')
    await deliver('payment.succeeded', { payment: 'pay_period_1', periodEnd: '2099-03-01T00:00:00.000Z' })
    check((await creditsNow())['grant'] === PLAN_INTERVIEW_CREDITS.pro, 'a replayed renewal grants nothing more')

    console.log('\nthe next month')
    await deliver('payment.succeeded', { payment: 'pay_period_2', periodEnd: '2099-04-01T00:00:00.000Z' })
    check((await creditsNow())['grant'] === PLAN_INTERVIEW_CREDITS.pro * 2, 'a new period is a new credit')

    console.log('\nthe subscription lapsing — THE SENTENCE THE TERMS ARE QUOTED ON (§5.5)')
    const beforeLapse = await creditsNow()
    await deliver('membership.deactivated', { status: 'expired' })
    const afterLapse = await creditsNow()
    check((await planNow()) === 'free', 'the account lands on free')
    check(afterLapse['grant'] === 0, `every unspent GRANTED credit is voided (${beforeLapse['grant']} → ${afterLapse['grant']})`)
    check(afterLapse['purchase'] === beforeLapse['purchase'],
      `and every PURCHASED credit is untouched (${afterLapse['purchase']})`)
    check(afterLapse['screener'] === beforeLapse['screener'], 'as is the free screener')
    const voidRow = (await ledgerNow()).find((row) => row.kind === 'expiry')
    check(voidRow?.source === 'grant', 'the void names the grant source and no other')

    console.log('\ntwo live grant lots, then a lapse — the resurrection bug')
    /**
     * A void has to write ONE ROW PER LOT, and this is why.
     *
     * An upgrade mid-period leaves two live grant lots with different expiries.
     * A single void row of -2 carrying the SOONER expiry balances to zero today
     * and then falls out with its lot, leaving the later grant alone and the
     * voided credits alive again. Carrying the LATER expiry is worse: the
     * balance goes negative when the earlier lot drops.
     *
     * Driven here rather than argued, because it only shows up across a date
     * boundary that a unit test would have to fake and this table would not.
     */
    const soon = new Date(Date.now() + 2 * 86_400_000).toISOString()
    const later = new Date(Date.now() + 40 * 86_400_000).toISOString()
    await admin.from('interview_credit_entries').insert([
      { user_id: userId, kind: 'grant', source: 'grant', amount: 1, expires_at: soon, reference: `verify:lot:a:${stamp}` },
      { user_id: userId, kind: 'grant', source: 'grant', amount: 1, expires_at: later, reference: `verify:lot:b:${stamp}` },
    ])
    check((await creditsNow())['grant'] === 2, 'two grant lots are live at once')
    await deliver('membership.deactivated', { status: 'expired' })
    check((await creditsNow())['grant'] === 0, 'the lapse voids both')
    const voids = (await ledgerNow()).filter((row) => row.kind === 'expiry' && row.amount === -1)
    // Compared as instants, not as strings: Postgres hands `timestamptz` back
    // as `+00:00` where this harness wrote `Z`, and the two are the same moment.
    const expiries = new Set(voids.map((row) => Date.parse(String(row.expires_at))))
    check(expiries.has(Date.parse(soon)) && expiries.has(Date.parse(later)),
      `and it wrote one void per lot, each carrying its own lot expiry (${voids.length} rows)`)

    console.log('\na refund of a pack')
    // The ordering bug this whole branch exists for: `refund.created` maps to
    // `revoke`, so a Pro subscriber refunding a $9 pack would have had their
    // SUBSCRIPTION cancelled by a refund of something else entirely.
    await deliver('payment.succeeded', { payment: 'pay_period_3', periodEnd: '2099-05-01T00:00:00.000Z' })
    check((await planNow()) === 'pro', 'the account is back on pro')
    const beforeRefund = await creditsNow()
    await deliver('refund.created', { plan: PACK_PLANS['single'], payment: 'pay_pack_b' })
    check((await planNow()) === 'pro', 'refunding a PACK does not cancel the subscription')
    check((await creditsNow())['purchase'] === (beforeRefund['purchase'] ?? 0) - single.credits,
      'and it takes back exactly what that pack sold')

    console.log('\na chargeback on a pack bigger than what is left')
    // Somebody buys five, uses four, then disputes. The clawback is clamped to
    // what remains: a ledger that went negative would silently make their next
    // purchase pay off a debt instead of buying interviews.
    const spendable = (await creditsNow())['purchase'] ?? 0
    await admin.from('interview_credit_entries').insert({
      user_id: userId, kind: 'spend', source: 'purchase', amount: -spendable + 1,
      reference: `verify:spend:${stamp}`,
    })
    check((await creditsNow())['purchase'] === 1, 'one purchased credit is left')
    await deliver('dispute.created', { plan: PACK_PLANS['pack5'], payment: 'pay_pack_a' })
    check((await creditsNow())['purchase'] === 0, 'the chargeback takes the last one')
    const negative = (await ledgerNow()).reduce((sum, row) => sum + row.amount, 0)
    check(negative >= 0, `and the balance never goes below zero (${negative})`)

    // Put the account back on free for the rule-9 checks that follow.
    await deliver('membership.deactivated', { status: 'expired' })
    check((await planNow()) === 'free', 'and the account is put back on free for what follows')

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
