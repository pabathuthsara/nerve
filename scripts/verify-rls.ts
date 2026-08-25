/**
 * Proves the "RLS on every table, no exceptions" rule, against the real
 * database, with two real users.
 *
 *   npm run db:verify
 *
 * A policy that has never been tested from a second account is a policy that
 * has never been tested. This creates two throwaway users, has each try to
 * reach the other's rows, and deletes them at the end whatever happens.
 *
 * Every check states what SHOULD happen, so a failure names the hole rather
 * than just going red.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/db/types'
import { loadEnvLocal } from './env'

type Client = SupabaseClient<Database>

/** The six §07 names, as `scores.focus` writes them. */
const SUB_SCORES = ['opening', 'curiosity', 'listening', 'signalReading', 'composure', 'close']

let failures = 0

function check(passed: boolean, description: string): void {
  console.log(`  ${passed ? 'pass' : 'FAIL'}  ${description}`)
  if (!passed) failures += 1
}

async function main(): Promise<void> {
  await loadEnvLocal()

  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']
  const publishable = process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']
  const secret = process.env['SUPABASE_SECRET_KEY']
  if (!url || !publishable || !secret) {
    console.error('Need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY.')
    process.exit(1)
  }

  const admin = createClient<Database>(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const stamp = Date.now()
  const people = [
    { email: `rls-a-${stamp}@nerve.test`, password: `pw-a-${stamp}-xyz` },
    { email: `rls-b-${stamp}@nerve.test`, password: `pw-b-${stamp}-xyz` },
  ]
  const ids: string[] = []
  const clients: Client[] = []

  try {
    for (const person of people) {
      const { data, error } = await admin.auth.admin.createUser({
        email: person.email,
        password: person.password,
        email_confirm: true,
      })
      if (error || !data.user) throw new Error(`could not create ${person.email}: ${error?.message}`)
      ids.push(data.user.id)

      const client = createClient<Database>(url, publishable, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
      const { error: signInError } = await client.auth.signInWithPassword(person)
      if (signInError) throw new Error(`could not sign in ${person.email}: ${signInError.message}`)
      clients.push(client)
    }

    const [aId, bId] = ids as [string, string]
    const [a, b] = clients as [Client, Client]

    console.log('\nprofiles')
    const { data: aProfile } = await a.from('profiles').select('id').eq('id', aId).maybeSingle()
    check(aProfile?.id === aId, 'a profile row is created by trigger on sign-up')
    const { data: bSeesA } = await b.from('profiles').select('id').eq('id', aId)
    check((bSeesA ?? []).length === 0, 'B cannot read A\'s profile')

    console.log('\nsessions')
    const { data: session, error: insertError } = await a
      .from('sessions')
      .insert({ user_id: aId, persona_slug: 'nadia', provider: 'openai', model: 'gpt-realtime-mini' })
      .select('id')
      .single()
    check(!insertError && !!session, `A can insert her own session${insertError ? ` (${insertError.message})` : ''}`)
    const sessionId = session?.id ?? ''

    const { data: bList } = await b.from('sessions').select('id')
    check((bList ?? []).length === 0, 'B cannot read A\'s sessions')

    const { error: forgery } = await b
      .from('sessions')
      .insert({ user_id: aId, persona_slug: 'nadia', provider: 'openai', model: 'gpt-realtime-mini' })
    check(!!forgery, 'B cannot insert a session attributed to A')

    const { error: bDelete, count: deleted } = await b
      .from('sessions')
      .delete({ count: 'exact' })
      .eq('id', sessionId)
    check(!bDelete && deleted === 0, 'B cannot delete A\'s session')

    console.log('\ntranscripts and scores')
    const { error: transcriptError } = await a
      .from('transcripts')
      .insert({ session_id: sessionId, user_id: aId, turns: [] })
    check(!transcriptError, `A can write her own transcript${transcriptError ? ` (${transcriptError.message})` : ''}`)
    const { data: bTranscripts } = await b.from('transcripts').select('session_id')
    check((bTranscripts ?? []).length === 0, 'B cannot read A\'s transcript')

    console.log('\npersonas (content)')
    const { data: personas } = await a.from('personas').select('slug')
    check((personas ?? []).length > 0, 'a signed-in user can read published personas')
    const { error: personaWrite } = await a
      .from('personas')
      .update({ name: 'Tampered' })
      .eq('slug', 'nadia')
    const { data: stillNadia } = await admin.from('personas').select('name').eq('slug', 'nadia').single()
    check(
      !!personaWrite || stillNadia?.name === 'Nadia',
      'a user cannot rewrite a character',
    )

    console.log('\nthe library (§10 D)')
    // The cards were seeded in M3's content pass and had no reader until the
    // `/library` route landed. What is checked here is the seam: the policy
    // lets a signed-in user read them, and every sub-score the scorecard can
    // name has a card to point at — §07 promises that link.
    const { data: cards } = await a.from('techniques').select('slug, kind, targets').eq('published', true)
    check((cards ?? []).length > 0, 'a signed-in user can read the library')

    const covered = new Set(
      (cards ?? [])
        .filter((row) => row.kind === 'technique')
        .flatMap((row) => (row.targets ?? []) as string[]),
    )
    const missing = SUB_SCORES.filter((sub) => !covered.has(sub))
    check(missing.length === 0, `every sub-score has a technique to link to${missing.length ? ` (missing ${missing.join(', ')})` : ''}`)

    const { error: cardWrite } = await a
      .from('techniques')
      .update({ title: 'Tampered' })
      .eq('slug', (cards ?? [])[0]?.slug ?? '')
    const { data: stillCard } = await admin
      .from('techniques').select('title').eq('slug', (cards ?? [])[0]?.slug ?? '').maybeSingle()
    check(
      !!cardWrite || stillCard?.title !== 'Tampered',
      'and cannot rewrite one — the library is content, reviewed in a pull request (§09, §16)',
    )

    console.log('\nusage_ledger (§14)')
    const { error: ledgerForgery } = await a.from('usage_ledger').insert({
      user_id: aId, session_id: sessionId, seconds: 1, provider: 'openai',
      model: 'gpt-realtime-mini', rate: 0.065, cost_cents: 0.1,
    })
    check(!!ledgerForgery, 'a user cannot write their own meter')

    const { data: ledgerRow, error: adminLedger } = await admin
      .from('usage_ledger')
      .insert({
        user_id: aId, session_id: sessionId, seconds: 120, provider: 'openai',
        model: 'gpt-realtime-mini', rate: 0.065, cost_cents: 13,
      })
      .select('id')
      .single()
    check(!adminLedger, `the service role can append${adminLedger ? ` (${adminLedger.message})` : ''}`)

    const { error: mutate } = await admin
      .from('usage_ledger')
      .update({ cost_cents: 0 })
      .eq('id', ledgerRow?.id ?? 0)
    check(!!mutate, 'the ledger cannot be rewritten, even by the service role')

    const { data: aLedger } = await a.from('usage_ledger').select('id')
    check((aLedger ?? []).length === 1, 'A can read her own meter')
    const { data: bLedger } = await b.from('usage_ledger').select('id')
    check((bLedger ?? []).length === 0, 'B cannot read A\'s meter')

    console.log('\nentitlements (§14)')
    // Same rule as the ledger, one layer up: a user who can raise their own
    // quota or set their own plan has a free product.
    const { error: planForgery } = await a
      .from('entitlements')
      .update({ plan: 'elite', reps_per_day: 99, reps_used_today: 0 })
      .eq('user_id', aId)
    const { data: aPlan } = await a.from('entitlements').select('plan, reps_per_day').eq('user_id', aId).maybeSingle()
    check(
      !!planForgery || (aPlan?.plan === 'free' && aPlan?.reps_per_day === 1),
      'a user cannot grant themselves a plan',
    )

    const { error: entitlementInsert } = await a
      .from('entitlements')
      .insert({ user_id: aId, plan: 'elite', reps_per_day: 99 })
    check(!!entitlementInsert, 'a user cannot insert an entitlement row')

    check(!!aPlan, 'A can read her own entitlement')
    const { data: bSeesPlan } = await b.from('entitlements').select('user_id').eq('user_id', aId)
    check((bSeesPlan ?? []).length === 0, 'B cannot read A\'s entitlement')

    console.log('\nstorage')
    const bytes = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' })
    const { error: ownUpload } = await a.storage
      .from('session-audio')
      .upload(`${aId}/${sessionId}.webm`, bytes, { contentType: 'audio/webm' })
    check(!ownUpload, `A can upload under her own prefix${ownUpload ? ` (${ownUpload.message})` : ''}`)

    const { error: crossUpload } = await b.storage
      .from('session-audio')
      .upload(`${aId}/stolen.webm`, bytes, { contentType: 'audio/webm' })
    check(!!crossUpload, 'B cannot upload into A\'s folder')

    const { error: crossRead } = await b.storage
      .from('session-audio')
      .download(`${aId}/${sessionId}.webm`)
    check(!!crossRead, 'B cannot download A\'s audio')

    console.log('\nthe field (§09)')
    const { data: publishedChallenges } = await a.from('field_challenges').select('id, slug, tier').limit(50)
    check((publishedChallenges ?? []).length > 0, 'a signed-in user can read the challenge library')
    const challengeId = publishedChallenges?.[0]?.id ?? ''

    const { error: challengeWrite } = await a
      .from('field_challenges')
      .update({ title: 'Tampered' })
      .eq('id', challengeId)
    const { data: stillTitled } = await admin.from('field_challenges').select('title').eq('id', challengeId).single()
    check(
      !!challengeWrite || stillTitled?.title !== 'Tampered',
      'a user cannot rewrite a challenge',
    )

    const today = new Date().toISOString().slice(0, 10)
    const { data: assignment, error: assignError } = await a
      .from('field_assignments')
      .insert({ user_id: aId, challenge_id: challengeId, assigned_on: today, status: 'accepted', anxiety_pre: 7 })
      .select('id')
      .single()
    check(!assignError && !!assignment, `A can be assigned a challenge${assignError ? ` (${assignError.message})` : ''}`)

    const { data: bSeesAssignment } = await b.from('field_assignments').select('id').eq('user_id', aId)
    check((bSeesAssignment ?? []).length === 0, 'B cannot read A\'s assignment')

    const { error: logError } = await a.from('field_logs').insert({
      user_id: aId,
      assignment_id: assignment?.id ?? null,
      challenge_id: challengeId,
      challenge_title: publishedChallenges?.[0]?.slug ?? 'challenge',
      tier: publishedChallenges?.[0]?.tier ?? 1,
      asked: true,
      outcome: 'declined',
      anxiety_pre: 7,
      anxiety_post: 3,
      logged_on: today,
    })
    check(!logError, `A can log her own ask${logError ? ` (${logError.message})` : ''}`)

    const { data: bSeesLog } = await b.from('field_logs').select('id').eq('user_id', aId)
    check((bSeesLog ?? []).length === 0, 'B cannot read A\'s log')

    // No UPDATE policy anywhere on field_logs, including for its owner. The
    // predicted-versus-actual chart is only evidence if the numbers cannot be
    // revised after the fact (§09).
    const { error: rewriteLog, count: rewritten } = await a
      .from('field_logs')
      .update({ anxiety_post: 0 }, { count: 'exact' })
      .eq('user_id', aId)
    check(!!rewriteLog || rewritten === 0, 'nobody can rewrite a logged ask, including its owner')

    console.log('\nprogression and money (§08, §14)')
    const { data: ownStreak } = await a.from('streaks').select('current').eq('user_id', aId).maybeSingle()
    check(!!ownStreak, 'A has a streak row from the sign-up trigger')
    const { error: streakForgery, count: streakRows } = await a
      .from('streaks')
      .update({ current: 999, longest: 999 }, { count: 'exact' })
      .eq('user_id', aId)
    check(!!streakForgery || streakRows === 0, 'a user cannot write their own streak')
    const { data: bSeesStreak } = await b.from('streaks').select('user_id').eq('user_id', aId)
    check((bSeesStreak ?? []).length === 0, 'B cannot read A\'s streak')

    const { error: unlockForgery } = await a
      .from('unlocks')
      .insert({ user_id: aId, kind: 'level', ref: '8' })
    check(!!unlockForgery, 'a user cannot grant themselves an unlock')

    const { error: subscriptionForgery } = await a
      .from('subscriptions')
      .insert({ user_id: aId, provider: 'manual', plan: 'elite' })
    check(!!subscriptionForgery, 'a user cannot write themselves a subscription')

    const { error: reviewForgery } = await a
      .from('weekly_reviews')
      .insert({ user_id: aId, week_start: today, copy: 'forged' })
    check(!!reviewForgery, 'a user cannot write their own weekly review')

    // The strongest case for a read-only table in the whole product: turning
    // your own difficulty down is exactly the thing that would make every
    // score after it meaningless (§08, §14).
    const { error: difficultyForgery } = await a
      .from('difficulty_offsets')
      .insert({ user_id: aId, level: 8, start_bonus: 6, gain_bonus: 0.25 })
    check(!!difficultyForgery, 'a user cannot make a character easier for themselves')

    const { data: ownOffsets } = await a.from('difficulty_offsets').select('level').eq('user_id', aId)
    check(Array.isArray(ownOffsets), 'but they can read what their own difficulty is set to')

    const { data: bOffsets } = await b.from('difficulty_offsets').select('level').eq('user_id', aId)
    check((bOffsets?.length ?? 0) === 0, "and B cannot read A's")

    // Share cards (§18). The token is the capability and the public page
    // resolves it with the service role, which is exactly why this table has
    // one owner-read policy and no anonymous policy at all.
    const token = 'a'.repeat(32)
    const { error: cardForgery } = await a
      .from('share_cards')
      .insert({ user_id: aId, token, kind: 'rejections', payload: {} })
    check(!!cardForgery, 'a user cannot mint their own share card')

    const { data: adminCard } = await admin
      .from('share_cards')
      .insert({ user_id: aId, token, kind: 'rejections', payload: { headline: '25' } })
      .select('token')
      .single()
    check(!!adminCard, 'the service role can, because it assembles the payload')

    const { data: aCards } = await a.from('share_cards').select('token')
    check((aCards ?? []).length === 1, 'A can list what she has published, in order to revoke it')
    const { data: bCards } = await b.from('share_cards').select('token')
    check((bCards ?? []).length === 0, "B cannot enumerate A's cards")

    const { error: badToken } = await admin
      .from('share_cards')
      .insert({ user_id: aId, token: 'not-32-hex', kind: 'streak', payload: {} })
    check(!!badToken, 'a token that is not 32 hex characters is refused by the column itself')

    console.log('\nsafety (§16)')
    const { error: reportError } = await a
      .from('safety_events')
      .insert({ user_id: aId, kind: 'report', detail: { note: 'audio cut out' } })
    check(!reportError, `A can report a problem${reportError ? ` (${reportError.message})` : ''}`)

    // A moderation flag a user can write is a moderation flag that proves
    // nothing. Only 'report' passes the policy.
    const { error: flagForgery } = await a
      .from('safety_events')
      .insert({ user_id: aId, kind: 'moderation', detail: {} })
    check(!!flagForgery, 'a user cannot forge a moderation event')

    const { data: bSeesSafety } = await b.from('safety_events').select('id').eq('user_id', aId)
    check((bSeesSafety ?? []).length === 0, 'B cannot read A\'s safety events')

    console.log('\ntext mode (P1)')
    // The one training surface that costs no quota. It is still per-account,
    // and it is still the user's own — all four verbs, like `persona_memory`,
    // because starting fresh is theirs and nobody would pay to change what
    // they themselves typed.
    const { error: threadError } = await a
      .from('text_threads')
      .insert({
        user_id: aId,
        persona_slug: 'nadia',
        turns: [{ speaker: 'user', text: 'that shelf looks like it wronged you', at: new Date().toISOString() }],
      })
    check(!threadError, `A can start her own text thread${threadError ? ` (${threadError.message})` : ''}`)

    const { data: bSeesThread } = await b.from('text_threads').select('id').eq('user_id', aId)
    check((bSeesThread ?? []).length === 0, "B cannot read A's text thread")

    const { error: threadForgery } = await b
      .from('text_threads')
      .insert({ user_id: aId, persona_slug: 'maya', turns: [] })
    check(!!threadForgery, 'B cannot start a thread attributed to A')

    const { data: bWrote } = await b
      .from('text_threads')
      .update({ turns: [] })
      .eq('user_id', aId)
      .select('id')
    check((bWrote ?? []).length === 0, "B cannot rewrite A's thread")

    const { data: bDeletedThread } = await b
      .from('text_threads')
      .delete()
      .eq('user_id', aId)
      .select('id')
    check((bDeletedThread ?? []).length === 0, "B cannot delete A's thread")

    // One rolling conversation per character, not a list of past chats. The
    // continuity rule is that this is ONE encounter a later hello does not
    // restart, and the unique index is what makes that true of the data.
    const { error: secondThread } = await a
      .from('text_threads')
      .insert({ user_id: aId, persona_slug: 'nadia', turns: [] })
    check(!!secondThread, 'a second thread against the same character is refused')

    // The promise the whole mode is built on: typing at her never touches the
    // counter. Read back rather than assumed.
    const { data: afterText } = await a
      .from('entitlements')
      .select('reps_used_today')
      .eq('user_id', aId)
      .maybeSingle()
    check(afterText?.reps_used_today === 0, 'a text thread spends no rep')

    const { data: clearedThread } = await a
      .from('text_threads')
      .delete()
      .eq('user_id', aId)
      .eq('persona_slug', 'nadia')
      .select('id')
    check((clearedThread ?? []).length === 1, 'start fresh clears the thread')

    console.log('\nthe interview setup and the CV bucket')
    const { error: setupError } = await a
      .from('interview_setups')
      .insert({ user_id: aId, role_title: 'Senior Product Designer', company: 'Northstar' })
    check(!setupError, `A can save her own interview setup${setupError ? ` (${setupError.message})` : ''}`)
    const { data: bSeesSetup } = await b.from('interview_setups').select('user_id').eq('user_id', aId)
    check((bSeesSetup ?? []).length === 0, 'B cannot read A\'s interview setup')

    const cv = new Blob([new Uint8Array([37, 80, 68, 70])], { type: 'application/pdf' })
    const { error: ownCv } = await a.storage.from('cv').upload(`${aId}/cv.pdf`, cv, { contentType: 'application/pdf' })
    check(!ownCv, `A can upload her own CV${ownCv ? ` (${ownCv.message})` : ''}`)
    const { error: crossCv } = await b.storage.from('cv').download(`${aId}/cv.pdf`)
    check(!!crossCv, 'B cannot download A\'s CV')

    console.log('\nexport (§16.7)')
    const { data: exported, error: exportError } = await a.rpc('export_my_data')
    const bundle = (exported ?? {}) as Record<string, unknown>
    check(!exportError && !!exported, `A can export everything we hold${exportError ? ` (${exportError.message})` : ''}`)
    check(Array.isArray(bundle['field_logs']) && (bundle['field_logs'] as unknown[]).length === 1, 'the export carries her field log')
    // §16.7 says everything we hold. A table of things the user typed is
    // exactly that, and the export has to move when a table like this arrives.
    check(Array.isArray(bundle['text_threads']), 'the export knows about text mode')
    check(Array.isArray(bundle['persona_memory']), 'and about what characters remember')
    // The other half of §18's cost story: the routes that spend money can ask
    // what today has already cost before spending more.
    const { data: spentToday } = await a.rpc('spend_today_cents')
    check(Number(spentToday) >= 13, 'A can read what today has cost on her account')
    const { data: bSpent } = await b.rpc('spend_today_cents')
    check(Number(bSpent) === 0, 'B\'s spend does not include A\'s')

    const { data: bExport } = await b.rpc('export_my_data')
    const bBundle = (bExport ?? {}) as Record<string, unknown>
    check(
      Array.isArray(bBundle['sessions']) && (bBundle['sessions'] as unknown[]).length === 0,
      'B\'s export contains none of A\'s rows',
    )

    console.log('\ncascade and detach')
    const { error: ownDelete } = await a.from('sessions').delete().eq('id', sessionId)
    check(!ownDelete, `A can delete her own rep${ownDelete ? ` (${ownDelete.message})` : ''}`)

    const { data: orphanTranscripts } = await admin
      .from('transcripts')
      .select('session_id')
      .eq('session_id', sessionId)
    check((orphanTranscripts ?? []).length === 0, 'deleting a session takes its transcript with it')

    // The rep is gone; the charge is not. Deleting a session must never be a
    // way to erase what it cost (§14).
    const { data: survivingLedger } = await admin
      .from('usage_ledger')
      .select('id, session_id, cost_cents')
      .eq('user_id', aId)
    check(
      (survivingLedger ?? []).length === 1 && survivingLedger?.[0]?.session_id === null,
      'the ledger row survives its rep, detached',
    )
    check(
      Number(survivingLedger?.[0]?.cost_cents) === 13,
      'the detached ledger row keeps what it charged',
    )
  } finally {
    for (const id of ids) {
      await admin.storage.from('session-audio').remove([`${id}/`])
      await admin.storage.from('cv').remove([`${id}/cv.pdf`])
      await admin.auth.admin.deleteUser(id)
    }
    console.log('\ntest users removed.')
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`)
    process.exit(1)
  }
  console.log('\nAll checks passed.')
}

void main()
