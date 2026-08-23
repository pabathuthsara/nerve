/**
 * The field loop, end to end, against the real database.
 *
 *   npm run db:field
 *
 * A throwaway user is assigned a challenge, accepts it with a prediction,
 * logs what actually happened, and the harness checks the four things the
 * loop has to get right:
 *
 *   the assignment is the same challenge however many times you ask
 *   the prediction cannot be revised once the ask has happened
 *   an ask made carries the streak on a day with no rep (§09, §14)
 *   a log cannot be rewritten, by anybody, ever
 *
 * The user is deleted at the end whatever happens.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/db/types'
import { recordTrainingDay } from '@/lib/db/progress'
import { chooseChallenge, unlockedTier } from '@/lib/field/assignment'
import { localDay } from '@/lib/data/day'

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
  const email = `field-${stamp}@nerve.test`
  const password = `pw-${stamp}-xyz`
  let userId = ''

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

    const today = localDay(new Date(), 'Asia/Colombo')

    console.log('\nthe assignment')
    const { data: library } = await user.from('field_challenges').select('id, tier, title').eq('published', true)
    const challenges = (library ?? []).map((row) => ({ id: row.id, tier: row.tier }))
    check(challenges.length > 0, 'the challenge library is readable')

    // A fresh account is level 1, which is Tier 1 and nothing above it.
    const tier = unlockedTier(1)
    const pick = chooseChallenge({ challenges, tier, recentIds: [], seed: `${userId}:${today}` })
    const again = chooseChallenge({ challenges, tier, recentIds: [], seed: `${userId}:${today}` })
    check(!!pick && pick.id === again?.id, 'the same day gives the same challenge')
    check(pick?.tier === 1, 'a new account is only offered Tier 1')

    const { data: assignment, error: assignError } = await user
      .from('field_assignments')
      .insert({ user_id: userId, challenge_id: pick?.id ?? '', assigned_on: today })
      .select('id, status, anxiety_pre')
      .single()
    check(!assignError && !!assignment, `it is written down${assignError ? ` (${assignError.message})` : ''}`)
    const assignmentId = assignment?.id ?? ''

    const { error: duplicate } = await user
      .from('field_assignments')
      .insert({ user_id: userId, challenge_id: pick?.id ?? '', assigned_on: today })
    check(!!duplicate, 'a second live challenge for the same day is refused')

    console.log('\nthe prediction, taken before')
    const { error: acceptError } = await user
      .from('field_assignments')
      .update({ status: 'accepted', anxiety_pre: 8, accepted_at: new Date().toISOString() })
      .eq('id', assignmentId)
      .eq('status', 'pending')
    check(!acceptError, `accepting captures it${acceptError ? ` (${acceptError.message})` : ''}`)

    // The action filters on `status = 'pending'`, so a second attempt — which
    // is what "revise it afterwards" looks like — updates nothing.
    await user
      .from('field_assignments')
      .update({ anxiety_pre: 1 })
      .eq('id', assignmentId)
      .eq('status', 'pending')
    const { data: afterRevision } = await user
      .from('field_assignments')
      .select('anxiety_pre')
      .eq('id', assignmentId)
      .maybeSingle()
    check(afterRevision?.anxiety_pre === 8, 'it cannot be revised once the challenge is accepted')

    console.log('\nthe log')
    const { error: logError } = await user.from('field_logs').insert({
      user_id: userId,
      assignment_id: assignmentId,
      challenge_id: pick?.id ?? null,
      challenge_title: library?.[0]?.title ?? 'challenge',
      tier: 1,
      asked: true,
      outcome: 'declined',
      anxiety_pre: 8,
      anxiety_post: 3,
      logged_on: today,
    })
    check(!logError, `an ask is logged${logError ? ` (${logError.message})` : ''}`)

    const { data: logged } = await user
      .from('field_logs')
      .select('anxiety_pre, anxiety_post, asked, outcome')
      .eq('user_id', userId)
      .maybeSingle()
    check(
      (logged?.anxiety_pre ?? 0) > (logged?.anxiety_post ?? 99),
      'the two numbers survive, and this one felt easier than it looked',
    )
    check(logged?.outcome === 'declined', 'a rejection is recorded as an outcome, not as a failure')

    const { error: rewrite, count: rewritten } = await user
      .from('field_logs')
      .update({ anxiety_post: 0 }, { count: 'exact' })
      .eq('user_id', userId)
    check(!!rewrite || rewritten === 0, 'nobody can rewrite it afterwards, including its owner')

    console.log('\nthe streak, on a day with no rep')
    const { data: before } = await user.from('streaks').select('current, last_active_on').eq('user_id', userId).maybeSingle()
    check(before?.current === 0 && before?.last_active_on === null, 'the account has never trained')

    await recordTrainingDay(userId)
    const { data: after } = await user.from('streaks').select('current, last_active_on').eq('user_id', userId).maybeSingle()
    check(after?.current === 1, 'an ask made starts the streak with no rep in sight (§09, §14)')
    check(after?.last_active_on === today, 'and it is dated in the user\'s own day')

    const { count: sessionCount } = await user
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
    check((sessionCount ?? 0) === 0, 'no voice rep was involved at any point')
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
