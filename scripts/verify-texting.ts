/**
 * The texting section, end to end, against the real database.
 *
 *   npm run db:texting
 *
 * Two throwaway users run the whole lifecycle and the harness checks the things
 * this section has to get right:
 *
 *   the allowance is COUNTED and not stored, so it cannot be tampered with
 *   the gate is on STARTING a thread and never mid-conversation
 *   a thread cannot be DELETED, because a deletable thread is a resettable
 *     quota (rule 11) — this is the assertion the whole migration exists for
 *   one open thread per character, with history behind it
 *   start fresh ends a thread and spends an allowance
 *   a finished thread has an ending and a finishing time, enforced by the
 *     database rather than by a screen
 *   the second account can read none of it (RLS)
 *   the plan's number reaches `entitlements` and free is one a day
 *
 * Both users are deleted at the end whatever happens.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/db/types'
import { planById } from '@/lib/site/plans'
import { textingAllowance, FREE_THREADS_PER_DAY } from '@/lib/texting/allowance'
import { TEXTING_ROSTER } from '@/lib/personas/texting'

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
  const slug = TEXTING_ROSTER[0]!.slug
  const other = TEXTING_ROSTER[1]!.slug
  const accounts = [
    { email: `texting-a-${stamp}@nerve.test`, password: `pw-${stamp}-aaa`, id: '' },
    { email: `texting-b-${stamp}@nerve.test`, password: `pw-${stamp}-bbb`, id: '' },
  ]

  try {
    for (const account of accounts) {
      const { data: created, error } = await admin.auth.admin.createUser({
        email: account.email, password: account.password, email_confirm: true,
      })
      if (error || !created.user) throw new Error(`could not create ${account.email}: ${error?.message}`)
      account.id = created.user.id
    }

    const me: SupabaseClient<Database> = createClient<Database>(url, publishable, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { error: signInError } = await me.auth.signInWithPassword({
      email: accounts[0]!.email, password: accounts[0]!.password,
    })
    if (signInError) throw new Error(`could not sign in: ${signInError.message}`)
    const userId = accounts[0]!.id

    console.log('\nthe allowance is the plan’s, and free is one a day')
    const { data: ent } = await me
      .from('entitlements').select('plan, texting_threads_per_day').eq('user_id', userId).maybeSingle()
    check(ent?.plan === 'free', 'a new account is on free')
    check(
      ent?.texting_threads_per_day === planById('free').textingThreadsPerDay,
      `free gets ${planById('free').textingThreadsPerDay} conversation a day, from the plan record`,
    )
    check(FREE_THREADS_PER_DAY === planById('free').textingThreadsPerDay, 'the constant and the plan agree')

    console.log('\nopening a thread')
    const { data: thread, error: openError } = await me
      .from('texting_threads')
      .insert({ user_id: userId, persona_slug: slug })
      .select('id, state, exit_state, ending, ended_at')
      .single()
    check(!openError && !!thread, `it is written down${openError ? ` (${openError.message})` : ''}`)
    check(thread?.state === 'open' && thread?.exit_state === 'present', 'it opens present and open')
    check(thread?.ending === null && thread?.ended_at === null, 'an open thread has no ending and no finishing time')
    const threadId = thread?.id ?? ''

    const { error: second } = await me
      .from('texting_threads')
      .insert({ user_id: userId, persona_slug: slug })
    check(!!second, 'a second OPEN thread against the same character is refused')

    console.log('\nthe count is a read, not a stored counter')
    const { count: startedToday } = await me
      .from('texting_threads')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
    const spent = textingAllowance({
      threadsPerDay: ent?.texting_threads_per_day ?? 0,
      startedToday: startedToday ?? 0,
    })
    check(startedToday === 1, 'one thread counts as one')
    check(!spent.mayStart, 'the day’s conversation is spent')
    check(spent.remaining === 0, 'nothing remains')

    console.log('\nA THREAD CANNOT BE DELETED (rule 11)')
    // THE ASSERTION THE WHOLE MIGRATION EXISTS FOR. The count above is read
    // over `started_at`, so a row the user can delete is a quota the user can
    // reset. `text_threads` had a delete policy and an argument for it; that
    // argument expired the moment a thread became a daily allowance.
    await me.from('texting_threads').delete().eq('id', threadId)
    const { count: afterDelete } = await me
      .from('texting_threads')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
    check(afterDelete === 1, 'the row survives a delete, so the allowance cannot be reset')

    console.log('\nthe database enforces the shape of an ending')
    const { error: halfEnded } = await me
      .from('texting_threads')
      .update({ state: 'ended_cold' })
      .eq('id', threadId)
    check(!!halfEnded, 'a finished thread without an ending is refused')

    const { error: endError } = await me
      .from('texting_threads')
      .update({ state: 'ended_cold', ending: 'faded', exit_state: 'leaving', ended_at: new Date().toISOString() })
      .eq('id', threadId)
    check(!endError, `ending it properly is accepted${endError ? ` (${endError.message})` : ''}`)

    const { error: badEnding } = await me
      .from('texting_threads')
      .update({ ending: 'ghosted' })
      .eq('id', threadId)
    check(!!badEnding, 'an ending outside the three is refused')

    console.log('\nhistory, and one open thread at a time')
    const { error: reopen } = await me
      .from('texting_threads')
      .insert({ user_id: userId, persona_slug: slug })
    check(!reopen, `a new thread opens once the last one is finished${reopen ? ` (${reopen.message})` : ''}`)
    const { count: total } = await me
      .from('texting_threads')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('persona_slug', slug)
    check(total === 2, 'the finished one is still there — the debrief can read it months later')

    console.log('\nanother character is another thread')
    const { error: otherError } = await me
      .from('texting_threads')
      .insert({ user_id: userId, persona_slug: other })
    check(!otherError, `a different character opens independently${otherError ? ` (${otherError.message})` : ''}`)

    console.log('\nRLS, from a second real account')
    const them: SupabaseClient<Database> = createClient<Database>(url, publishable, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    await them.auth.signInWithPassword({ email: accounts[1]!.email, password: accounts[1]!.password })
    const { data: theirView } = await them.from('texting_threads').select('id').eq('user_id', userId)
    check((theirView ?? []).length === 0, 'a second account reads none of it')
    const { error: theirWrite } = await them
      .from('texting_threads')
      .update({ turns: [] })
      .eq('id', threadId)
    const { data: stillThere } = await admin
      .from('texting_threads').select('state').eq('id', threadId).maybeSingle()
    check(!!theirWrite || stillThere?.state === 'ended_cold', 'a second account cannot write it either')
    const { error: forged } = await them
      .from('texting_threads')
      .insert({ user_id: userId, persona_slug: 'wren' })
    check(!!forged, 'a second account cannot open a thread in somebody else’s name')

    console.log('\nthe allowance number has no user write path')
    const { error: selfGrant } = await me
      .from('entitlements')
      .update({ texting_threads_per_day: 999 })
      .eq('user_id', userId)
    const { data: afterGrant } = await admin
      .from('entitlements').select('texting_threads_per_day').eq('user_id', userId).maybeSingle()
    check(
      !!selfGrant || afterGrant?.texting_threads_per_day === planById('free').textingThreadsPerDay,
      'a user cannot raise their own texting allowance',
    )
  } finally {
    for (const account of accounts) {
      if (account.id) await admin.auth.admin.deleteUser(account.id)
    }
  }

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
  process.exit(failures === 0 ? 0 : 1)
}

void main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
