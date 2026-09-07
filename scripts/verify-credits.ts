/**
 * The interview credit, against the real database (INTERVIEW-PLAN A1, A2, A5).
 *
 *   npm run db:credits
 *
 * `db:rep` drives the dating rep lifecycle without a microphone. This is the
 * same thing for the credit an interview is bought with, and it exists because
 * every claim below is about money and none of them is provable at a desk:
 *
 *   a balance is a sum over an append-only ledger, and nobody can edit it
 *   a rep that connects HOLDS a credit rather than spending it
 *   two connects on one session cannot spend two
 *   a rep killed before the scorecard leaves the balance untouched
 *   a rep that reaches the scorecard has spent exactly one
 *   a provider error gives it back; a rep the user walked out of does not
 *   a grant dies at its period boundary and takes its spends with it
 *   a purchase never expires, and a screener only buys the screener round
 *   the daily spend ceiling rises with the credits and only with them
 *
 * The user is deleted at the end whatever happens.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/db/types'
import { SPEND_POLICY } from '@/lib/db/spend'
import {
  ROUND_TYPES,
  SCREENER_ROUND,
  creditBalance,
  nextLotToSpend,
  type CreditLot,
} from '@/lib/data/interview-credits'
import { interviewCreditable } from '@/lib/data/interview-rules'

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
  const email = `credits-${stamp}@nerve.test`
  const password = `pw-${stamp}-xyz`
  let userId = ''

  const balance = async () => {
    const { data, error } = await admin.rpc('interview_credit_balance', { p_user_id: userId })
    if (error) throw new Error(`interview_credit_balance failed: ${error.message}`)
    const rows = (Array.isArray(data) ? data : [data]) as { source: string; remaining: number; held: number }[]
    const total = rows.reduce((sum, row) => sum + (row.remaining ?? 0), 0)
    const held = rows.reduce((sum, row) => sum + (row.held ?? 0), 0)
    return { total, held, available: Math.max(0, total - held), rows }
  }

  const openSession = async (slug: string) => {
    const { data, error } = await admin
      .from('sessions')
      .insert({ user_id: userId, persona_slug: slug, provider: 'elevenlabs', model: 'elevenlabs-pipeline' })
      .select('id, track')
      .single()
    if (error) throw new Error(`could not open a session: ${error.message}`)
    return data
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

    /**
     * ── WHAT AN ACCOUNT IS BORN WITH (D5, E1) ──────────────────────────
     *
     * Until 7 September this read "the balance starts empty", and it was true:
     * nothing granted a credit until somebody ran `db:interview` by hand. D5
     * put the free five-minute screener in `handle_new_user`, so every account
     * now arrives holding exactly one — and the trigger that fires off that
     * insert opens the interview track on it, which is E1.
     *
     * Everything below therefore counts in `plus(n)` rather than in `n`. That
     * is deliberately noisier than deleting the screener would be: the screener
     * IS part of the balance now, and a harness that quietly removed it would
     * stop testing the arithmetic the product actually does.
     */
    console.log('\nwhat a new account is born with (D5)')
    const empty = await balance()
    const screener = empty.rows.find((row) => row.source === 'screener')?.remaining ?? 0
    check(screener === 1 && empty.total === 1, `one free screener and nothing else (${empty.total})`)
    check(empty.available === 1, 'and it is spendable — on the five-minute round only')
    const { data: bornWith } = await admin
      .from('profiles').select('unlocked_tracks').eq('id', userId).maybeSingle()
    check((bornWith?.unlocked_tracks ?? []).includes('interview'),
      'and the credit landing opened the interview track (E1)')

    /** `n` paid credits, plus the free screener the account was born with. */
    const plus = (n: number) => n + screener

    console.log('\nrule 11 — no user write path')
    const { error: insertDenied } = await user.from('interview_credit_entries').insert({
      user_id: userId, kind: 'purchase', source: 'purchase', amount: 99, reference: 'forged',
    })
    check(!!insertDenied, 'the owner cannot grant themselves a credit')
    const { error: holdDenied } = await user.from('interview_credit_holds').insert({
      user_id: userId, session_id: crypto.randomUUID(), source: 'purchase', round: 'technical',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    })
    check(!!holdDenied, 'the owner cannot write themselves a hold')

    console.log('\nthe ledger is append-only')
    await admin.from('interview_credit_entries').insert({
      user_id: userId, kind: 'purchase', source: 'purchase', amount: 5, reference: `pack:${stamp}`,
    })
    const { data: row } = await admin
      .from('interview_credit_entries').select('id').eq('user_id', userId).limit(1).maybeSingle()
    const { error: updateBlocked } = await admin
      .from('interview_credit_entries').update({ amount: 500 }).eq('id', row?.id ?? '')
    check(!!updateBlocked, 'even the service role cannot edit a row it wrote')
    // A SERVICE-ROLE DELETE IS PERMITTED, AND THAT IS THE DESIGN.
    //
    // The trigger covers UPDATE only, exactly as `usage_ledger`'s does. A DELETE
    // trigger here blocks the cascade from `auth.users` and makes every account
    // undeletable — §16.7 requires the opposite, and this suite spent a day
    // printing "test user removed" while removing nothing.
    //
    // What makes the ledger append-only for the person it is about is RLS:
    // `authenticated` has a SELECT policy and no other, asserted above.
    const { error: userDelete } = await user
      .from('interview_credit_entries').delete().eq('user_id', userId)
    const { data: survived } = await admin
      .from('interview_credit_entries').select('id').eq('user_id', userId)
    check(!!userDelete || (survived ?? []).length > 0,
      'the owner cannot delete a row from their own ledger')

    const purchased = await balance()
    check(purchased.total === plus(5), 'a pack of five reads as five')

    console.log('\nidempotency')
    const { error: replay } = await admin.from('interview_credit_entries').insert({
      user_id: userId, kind: 'purchase', source: 'purchase', amount: 5, reference: `pack:${stamp}`,
    })
    check(!!replay, 'the same purchase reference cannot be applied twice')
    check((await balance()).total === plus(5), 'and the balance did not move')

    console.log('\na rep that connects holds rather than spends')
    const held = await openSession('dan-whitfield')
    check(held.track === 'interview', 'the session records the interview track from the persona')
    await admin.from('interview_credit_holds').insert({
      user_id: userId, session_id: held.id, source: 'purchase', round: 'technical',
      expires_at: new Date(Date.now() + 45 * 60_000).toISOString(),
    })
    const holding = await balance()
    check(holding.total === plus(5) && holding.held === 1 && holding.available === plus(4),
      'the balance is still five, one is held, four are spendable')

    console.log('\ntwo connects on one session cannot spend two')
    const { error: doubleHold } = await admin.from('interview_credit_holds').insert({
      user_id: userId, session_id: held.id, source: 'purchase', round: 'technical',
      expires_at: new Date(Date.now() + 45 * 60_000).toISOString(),
    })
    check(!!doubleHold, 'a second hold on the same session is refused by the primary key')

    console.log('\na rep killed before the scorecard leaves the balance alone')
    await admin.from('interview_credit_holds')
      .update({ state: 'released', settled_at: new Date().toISOString() })
      .eq('session_id', held.id)
    const released = await balance()
    check(released.total === plus(5) && released.held === 0 && released.available === plus(5),
      'releasing the hold gives the credit straight back')

    console.log('\na rep that reaches the scorecard spends exactly one')
    const spent = await openSession('marcus-vance')
    await admin.from('interview_credit_holds').insert({
      user_id: userId, session_id: spent.id, source: 'purchase', round: 'technical',
      expires_at: new Date(Date.now() + 45 * 60_000).toISOString(),
    })
    await admin.from('interview_credit_entries').insert({
      user_id: userId, kind: 'spend', source: 'purchase', amount: -1,
      session_id: spent.id, reference: `spend:${spent.id}`,
    })
    await admin.from('interview_credit_holds')
      .update({ state: 'settled', settled_at: new Date().toISOString() })
      .eq('session_id', spent.id)
    const afterSpend = await balance()
    check(afterSpend.total === plus(4) && afterSpend.available === plus(4), 'four left, none held')

    const { error: doubleSpend } = await admin.from('interview_credit_entries').insert({
      user_id: userId, kind: 'spend', source: 'purchase', amount: -1,
      session_id: spent.id, reference: `spend:${spent.id}`,
    })
    check(!!doubleSpend, 'and the same rep cannot be charged twice')

    console.log('\nthe refund rule (A2)')
    check(interviewCreditable({ endedBy: 'error', heardUser: true }),
      'a provider error at minute fourteen is creditable')
    check(!interviewCreditable({ endedBy: 'user', heardUser: true }),
      'a rep the user ended at 18:00 of 20:00 is not')
    check(interviewCreditable({ endedBy: 'cap', heardUser: false }),
      'and a rep that heard nothing still is')
    await admin.from('interview_credit_entries').insert({
      user_id: userId, kind: 'refund', source: 'purchase', amount: 1,
      session_id: spent.id, reference: `refund:${spent.id}`,
    })
    check((await balance()).total === plus(5), 'a refund puts it back')

    console.log('\nexpiry: a grant dies at the period boundary, a purchase never does (§5.5)')
    const dead = new Date(Date.now() - 60_000).toISOString()
    await admin.from('interview_credit_entries').insert([
      { user_id: userId, kind: 'grant', source: 'grant', amount: 1, expires_at: dead, reference: `grant:past:${stamp}` },
      { user_id: userId, kind: 'spend', source: 'grant', amount: -1, expires_at: dead, reference: `grant:past:spend:${stamp}` },
    ])
    const lapsed = await balance()
    check(lapsed.total === plus(5),
      'an expired grant and the spend charged to it fall out of the balance together')
    check(lapsed.rows.every((entry) => entry.remaining >= 0),
      'and no source goes negative — the invariant that makes the balance a filtered sum')

    const alive = new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString()
    await admin.from('interview_credit_entries').insert({
      user_id: userId, kind: 'grant', source: 'grant', amount: 1, expires_at: alive, reference: `grant:live:${stamp}`,
    })
    check((await balance()).total === plus(6), 'a live grant counts')

    console.log('\nthe purchase constraint the terms are quoted on')
    const { error: expiringPurchase } = await admin.from('interview_credit_entries').insert({
      user_id: userId, kind: 'purchase', source: 'purchase', amount: 1,
      expires_at: alive, reference: `bad:${stamp}`,
    })
    check(!!expiringPurchase, 'a purchase with an expiry is refused by the database itself')

    console.log('\nspend order (§5.5) and the screener (§5.6)')
    const lots: CreditLot[] = [
      { source: 'purchase', remaining: 5, expiresAt: null },
      { source: 'grant', remaining: 1, expiresAt: alive },
      { source: 'screener', remaining: 1, expiresAt: null },
    ]
    check(nextLotToSpend(lots, { round: 'technical' })?.source === 'grant',
      'the expiring credit is spent before the one that was paid for')
    check(nextLotToSpend([lots[2]!], { round: 'technical' }) === null,
      'a screener credit cannot buy a real round')
    check(nextLotToSpend([lots[2]!], { round: SCREENER_ROUND })?.source === 'screener',
      'and buys the screener round')
    check(creditBalance({ lots, holds: 2 }).available === 5, 'holds come off the spendable balance')

    console.log('\nthe daily ceiling knows about credits (A5)')
    const { data: withCredits } = await admin.rpc('voice_daily_cap_cents', { p_user_id: userId })
    check(Number(withCredits) > SPEND_POLICY.DAILY_CAP_CENTS.free!,
      `an account holding credits has more room than free's ${SPEND_POLICY.DAILY_CAP_CENTS.free}c (${withCredits}c)`)

    // The half that matters most: an account with NO credits meets exactly the
    // numbers a dating account has always met.
    const { data: bare, error: bareError } = await admin.auth.admin.createUser({
      email: `nocredits-${stamp}@nerve.test`, password, email_confirm: true,
    })
    if (bareError || !bare.user) throw new Error('could not create the second test user')
    try {
      const { data: plain } = await admin.rpc('voice_daily_cap_cents', { p_user_id: bare.user.id })
      check(Number(plain) === SPEND_POLICY.DAILY_CAP_CENTS.free,
        `an account with no credits gets free's cap unchanged (${plain}c)`)
    } finally {
      await admin.auth.admin.deleteUser(bare.user.id)
    }

    console.log('\nthe rounds')
    for (const round of ROUND_TYPES) {
      check(round.durationMs > 0 && round.questions > 0,
        `${round.id} is ${round.durationMs / 60_000} min, ~${round.questions} questions, ${round.credits} credit(s)`)
    }
  } finally {
    // ASSERTED, NOT ASSUMED (§16.7, `LAUNCH-GAP.md` B6).
    //
    // This printed "test user removed" for a day while removing nothing. The
    // ledger's append-only trigger covered DELETE as well as UPDATE, so the
    // cascade from `auth.users` raised and every account deletion failed —
    // including a real one, had anybody asked. Six harness accounts had piled up
    // before the collision surfaced somewhere else entirely. A teardown nobody
    // checks is a teardown that is not happening.
    if (userId) {
      const { error } = await admin.auth.admin.deleteUser(userId)
      check(!error, `the account can actually be deleted${error ? ` (${error.message})` : ''}`)
      const { data: orphans } = await admin
        .from('interview_credit_entries').select('id').eq('user_id', userId)
      check((orphans ?? []).length === 0, 'and its credit ledger goes with it')
    }
    console.log('\ntest user removed.')
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`)
    process.exit(1)
  }
  console.log('\nAll checks passed.')
}

void main()
