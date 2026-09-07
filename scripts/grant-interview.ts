/**
 * Opens the interview track on an account, and puts credits in it.
 *
 *   npm run db:interview -- you@example.com
 *   npm run db:interview -- you@example.com 5          # five credits
 *   npm run db:interview -- you@example.com --screener # the free 5-min round
 *   npm run db:interview -- you@example.com --close    # shut the door again
 *
 * ── WHY THIS EXISTS, AND WHY IT IS A SCRIPT ──────────────────────────────
 *
 * Exactly the reason `db:plan` does. Both of the things this writes have **no
 * user write path on purpose** (rule 11): `profiles.unlocked_tracks` is what
 * `lib/data/guards.ts` reads to decide whether `/interview*` renders at all, and
 * `interview_credit_entries` is the balance an interview is bought out of. A
 * user who can write either has a free product.
 *
 * ── WHAT IT IS NOT, NOW THAT D AND E HAVE SHIPPED ───────────────────────
 *
 * It is no longer the only way in. A pack purchase credits the account through
 * the webhook (D3), a subscription grants one a month (D4), every account is
 * born with the free screener (D5), and any credit landing opens the track by
 * trigger (E1). This is the developer override that has to exist alongside all
 * of that — `db:plan` stayed after the webhook shipped for exactly the same
 * reason: an account that has to be fixed by hand at 2am should not need a
 * merchant of record to be reachable.
 *
 * `--close` is the one thing here with no product equivalent, and it is why the
 * guard in `lib/data/guards.ts` is still a guard.
 *
 * Every credit it writes is a `purchase` with a `dev:` reference, so it is
 * obvious in the ledger which credits were bought and which were handed over by
 * somebody with the key.
 */

import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/db/types'
import { loadEnvLocal } from './env'

const TRACK = 'interview'

async function main(): Promise<void> {
  await loadEnvLocal()

  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']
  const secret = process.env['SUPABASE_SECRET_KEY']
  if (!url || !secret) {
    console.error('Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local.')
    process.exit(1)
  }

  const args = process.argv.slice(2)
  const email = args.find((arg) => arg.includes('@'))
  const close = args.includes('--close')
  const screener = args.includes('--screener')
  const count = Number(args.find((arg) => /^\d+$/.test(arg)) ?? 3)

  if (!email) {
    console.error(
      'Which email?\n\n'
      + '  npm run db:interview -- you@example.com            # open the track, 3 credits\n'
      + '  npm run db:interview -- you@example.com 10         # ten credits\n'
      + '  npm run db:interview -- you@example.com --screener # add the free 5-minute screener\n'
      + '  npm run db:interview -- you@example.com --close    # shut the door again',
    )
    process.exit(1)
  }

  const admin = createClient<Database>(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const user = users?.users.find((entry) => entry.email?.toLowerCase() === email.toLowerCase())
  if (!user) {
    console.error(`No user with the address ${email}.`)
    process.exit(1)
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('unlocked_tracks')
    .eq('id', user.id)
    .maybeSingle()

  const current = profile?.unlocked_tracks ?? ['dating']

  if (close) {
    // The credits stay. Closing the door is not a refund, and a user whose
    // track was switched off should still have what they paid for when it
    // comes back.
    const next = current.filter((track) => track !== TRACK)
    const { error } = await admin.from('profiles').update({ unlocked_tracks: next }).eq('id', user.id)
    if (error) { console.error(`Could not close the track: ${error.message}`); process.exit(1) }
    console.log(`${email} — interview track closed. Credits left alone.`)
    return
  }

  // Opened here as well as by the trigger, because `--close` exists: an account
  // whose track was deliberately shut and which already holds credits would
  // otherwise stay shut, since the trigger only fires on a NEW credit.
  if (!current.includes(TRACK)) {
    const { error } = await admin
      .from('profiles')
      .update({ unlocked_tracks: [...current, TRACK] })
      .eq('id', user.id)
    if (error) { console.error(`Could not open the track: ${error.message}`); process.exit(1) }
  }

  const rows: Database['public']['Tables']['interview_credit_entries']['Insert'][] = []
  if (count > 0) {
    rows.push({
      user_id: user.id,
      kind: 'purchase',
      source: 'purchase',
      amount: count,
      // A purchase never expires (§5.5), and the CHECK constraint enforces it.
      reference: `dev:purchase:${Date.now()}`,
      metadata: { granted_by: 'db:interview' },
    })
  }
  if (screener) {
    rows.push({
      user_id: user.id,
      kind: 'screener',
      source: 'screener',
      amount: 1,
      // Once per account, which is what the reference makes true: a second run
      // collides on the unique index rather than minting a second one.
      reference: `screener:${user.id}`,
      metadata: { granted_by: 'db:interview' },
    })
  }

  for (const row of rows) {
    const { error } = await admin.from('interview_credit_entries').insert(row)
    // A duplicate is the screener's idempotency doing its job, not a failure.
    if (error && error.code !== '23505') {
      console.error(`Could not write the ${row.kind} credit: ${error.message}`)
      process.exit(1)
    }
    if (error) console.log(`  ${row.kind}: already granted, left alone.`)
  }

  const { data: balance } = await admin.rpc('interview_credit_balance', { p_user_id: user.id })
  const rowsBack = (Array.isArray(balance) ? balance : []) as { source: string; remaining: number; held: number }[]
  const total = rowsBack.reduce((sum, entry) => sum + (entry.remaining ?? 0), 0)
  const held = rowsBack.reduce((sum, entry) => sum + (entry.held ?? 0), 0)

  console.log(
    `${email} — interview track open.\n`
    + `  balance ${total} credit${total === 1 ? '' : 's'}`
    + `${held ? `, ${held} held by a rep in flight` : ''}\n`
    + `${rowsBack.map((entry) => `    ${entry.source}: ${entry.remaining}`).join('\n')}\n\n`
    + '  Then: /interview → set up the role → pick an interviewer → Start interview.',
  )
}

void main()
