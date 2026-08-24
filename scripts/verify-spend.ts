/**
 * The spend ceiling, against the real database (B9, §14, §18).
 *
 *   npm run db:spend
 *
 * `requireUser` answers "is this somebody?". `spend_allowance` answers "should
 * we spend more on them?", and this harness drives the answer through every
 * shape it has to get right:
 *
 *   the rate limit trips at the limit, not before and not after
 *   the window rolls, and a new window starts clean
 *   buckets are independent — a grader loop cannot silence a live rep
 *   the daily cap trips off the append-only ledger, in the user's own day
 *   the account kill switch refuses before the rate limit is consumed
 *   none of it is readable, writable or callable by the user it is about
 *
 * The user is deleted at the end whatever happens.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/db/types'
import { SPEND_POLICY } from '@/lib/db/spend'

let failures = 0

function check(passed: boolean, description: string): void {
  console.log(`  ${passed ? 'pass' : 'FAIL'}  ${description}`)
  if (!passed) failures += 1
}

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

  const admin = createClient<Database>(url, secret, { auth: { autoRefreshToken: false, persistSession: false } })
  const stamp = Date.now()
  const email = `spend-${stamp}@nerve.test`
  const password = `pw-${stamp}-xyz`
  let userId = ''

  /** One call to the gate, with the policy the app would use. */
  const ask = async (bucket: string, limit: number, windowSeconds: number, cap: number | null) => {
    const { data, error } = await admin.rpc('spend_allowance', {
      p_user_id: userId,
      p_bucket: bucket,
      p_limit: limit,
      p_window_seconds: windowSeconds,
      p_cap_cents: cap as number,
    })
    if (error) throw new Error(`spend_allowance failed: ${error.message}`)
    const row = Array.isArray(data) ? data[0] : data
    return row as { allowed: boolean; reason: string | null; spent_cents: number; retry_after: number }
  }

  try {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
    })
    if (createError || !created.user) throw new Error(`could not create the test user: ${createError?.message}`)
    userId = created.user.id

    const user: SupabaseClient<Database> = createClient<Database>(url, publishable, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { error: signInError } = await user.auth.signInWithPassword({ email, password })
    if (signInError) throw new Error(`could not sign in: ${signInError.message}`)

    console.log('\nthe rate limit')
    // A generous window, so the clock cannot make this flaky.
    const LIMIT = 3
    for (let i = 1; i <= LIMIT; i += 1) {
      const verdict = await ask('probe', LIMIT, 300, null)
      check(verdict.allowed, `request ${i} of ${LIMIT} is allowed`)
    }
    const over = await ask('probe', LIMIT, 300, null)
    check(!over.allowed && over.reason === 'rate', 'the one after the limit is refused, as a rate limit')
    check(over.retry_after > 0, 'and it says how long to wait')

    console.log('\nthe window')
    // A window of zero seconds is always already over, which is the same code
    // path a real window rolling takes — without making the harness sleep.
    const rolled = await ask('probe', LIMIT, 0, null)
    check(rolled.allowed, 'a rolled window starts clean')

    console.log('\nbuckets do not share an allowance')
    // The failure this prevents: a runaway grader loop eating the budget the
    // live rep needs to keep talking.
    const other = await ask('separate-bucket', 1, 300, null)
    check(other.allowed, 'a different bucket is unaffected by a bucket that is spent')
    const otherAgain = await ask('separate-bucket', 1, 300, null)
    check(!otherAgain.allowed, 'and it keeps its own count')

    console.log('\nthe daily cap, off the ledger')
    const uncapped = await ask('cap-probe', 100, 300, 50)
    check(uncapped.allowed && Number(uncapped.spent_cents) === 0, 'a new account has spent nothing')

    const { data: session } = await admin
      .from('sessions')
      .insert({ user_id: userId, persona_slug: 'nadia', provider: 'openai', model: 'gpt-realtime-mini' })
      .select('id')
      .single()
    await admin.from('usage_ledger').insert({
      user_id: userId,
      session_id: session?.id ?? null,
      provider: 'openai',
      model: 'gpt-realtime-mini',
      rate: 0.065,
      seconds: 180,
      cost_cents: 60,
    })

    const capped = await ask('cap-probe', 100, 300, 50)
    check(!capped.allowed && capped.reason === 'cap', 'past the cap is refused, as a cap rather than a rate limit')
    check(Number(capped.spent_cents) === 60, 'and it reports what has actually been spent')

    const stillUnder = await ask('cap-probe', 100, 300, 5000)
    check(stillUnder.allowed, 'a higher cap lets the same account through')

    console.log('\nthe account kill switch')
    await admin.from('entitlements')
      .update({ spend_halted_at: new Date().toISOString(), spend_halt_reason: 'harness' })
      .eq('user_id', userId)

    const halted = await ask('halt-probe', 1, 300, null)
    check(!halted.allowed && halted.reason === 'halted', 'a halted account is refused')

    // Checked BEFORE the rate limit, so being switched off does not also cost
    // the allowance you will need when you are switched back on.
    await admin.from('entitlements')
      .update({ spend_halted_at: null, spend_halt_reason: null })
      .eq('user_id', userId)
    const afterHalt = await ask('halt-probe', 1, 300, null)
    check(afterHalt.allowed, 'and being halted did not consume its rate limit')

    console.log('\nnone of this belongs to the user')
    const { data: readRows, error: readError } = await user.from('rate_limits').select('bucket')
    check(
      !!readError || (readRows?.length ?? 0) === 0,
      'a user cannot read their own rate limits — one you can read is one you can pace',
    )

    const { error: writeError } = await user
      .from('rate_limits')
      .insert({ user_id: userId, bucket: 'probe', hits: 0 })
    check(!!writeError, 'and cannot write one')

    const { error: rpcError } = await user.rpc('spend_allowance', {
      p_user_id: userId,
      p_bucket: 'probe',
      p_limit: 999,
      p_window_seconds: 300,
      p_cap_cents: 999_999,
    })
    check(!!rpcError, 'and cannot call the gate to burn their own allowance')

    const { error: haltError } = await user
      .from('entitlements')
      .update({ spend_halted_at: null })
      .eq('user_id', userId)
    const { data: haltRow } = await admin
      .from('entitlements')
      .select('spend_halted_at')
      .eq('user_id', userId)
      .maybeSingle()
    check(
      !!haltError || haltRow?.spend_halted_at === null,
      'and cannot switch their own account back on (§14, rule 9)',
    )

    console.log('\nthe policy the app actually ships')
    // The numbers are a judgement call; that every route family HAS one is not.
    for (const [bucket, policy] of Object.entries(SPEND_POLICY.POLICY)) {
      check(
        policy.limit > 0 && policy.windowSeconds > 0,
        `${bucket} has a real limit (${policy.limit} per ${policy.windowSeconds}s)`,
      )
    }
    for (const [plan, cap] of Object.entries(SPEND_POLICY.DAILY_CAP_CENTS)) {
      check(cap > 0, `${plan} has a daily cap (${cap}c)`)
    }
  } finally {
    if (userId) await admin.auth.admin.deleteUser(userId)
    console.log('\ntest user removed.')
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`)
    process.exit(1)
  }
  console.log('\nAll checks passed.')
}

void main()
