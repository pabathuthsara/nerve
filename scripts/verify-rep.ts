/**
 * The rep lifecycle, end to end, without a microphone.
 *
 *   npm run db:rep
 *
 * Everything a rep does except the voice itself: spend a quota, open a row,
 * write the transcript and the meter, record the day, store the grade, decide
 * the win, move the ladder. The transport is the one part this cannot cover —
 * WebRTC needs a browser and a microphone — and it is also the part that has
 * had a harness since M0.
 *
 * Written against the real database with a throwaway user, for the reason
 * `db:verify` exists: a path that has only ever been exercised by hand is a
 * path nobody has tested. The user is deleted at the end whatever happens.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { asJson, type Database } from '@/lib/db/types'
import { consumeRep, mayOpenSession, recordTrainingDay, syncLevel } from '@/lib/db/progress'
import { momentsFrom, toScorecard, type StoredWarmthEvent } from '@/lib/data/scorecard'
import { uiBand, uiLevel, wonFromRep } from '@/lib/data/progression'
import { ARM_THRESHOLD, KEEP_THRESHOLD } from '@/lib/data/rep-rules'
import { loadEnvLocal } from './env'

let failures = 0

function check(passed: boolean, description: string): void {
  console.log(`  ${passed ? 'pass' : 'FAIL'}  ${description}`)
  if (!passed) failures += 1
}

/** A rep that went well, in the shape the adapters actually emit (§04). */
const TURNS = [
  { speaker: 'user', text: 'That shelf looks like it has personally wronged you.', t_start: 1.2, t_end: 4.4 },
  { speaker: 'agent', text: 'It has. Repeatedly.', t_start: 5.0, t_end: 6.6 },
  { speaker: 'user', text: 'What are you actually looking for?', t_start: 7.1, t_end: 9.0 },
  { speaker: 'agent', text: 'Something for my sister. Blue cover. Impossible title.', t_start: 9.6, t_end: 13.2 },
  { speaker: 'user', text: 'Specific enough to be annoying, vague enough to be a quest.', t_start: 13.8, t_end: 17.9 },
  { speaker: 'agent', text: 'Exactly. You understand the stakes.', t_start: 18.4, t_end: 20.6 },
]

const WARMTH_EVENTS: StoredWarmthEvent[] = [
  { turnIndex: 1, delta: 4, warmthAfter: 36, reason: 'Joined her reality before asking for anything.', userText: TURNS[0]!.text },
  { turnIndex: 2, delta: 5, warmthAfter: 52, reason: 'A real question about the thing she was already doing.', userText: TURNS[2]!.text },
  { turnIndex: 3, delta: -2, warmthAfter: 50, reason: 'Slightly over-explained the joke.', userText: TURNS[4]!.text },
  { turnIndex: 4, delta: 16, warmthAfter: 66, reason: 'Made the invitation grow out of the shared bit.', userText: TURNS[4]!.text },
]

const METRIC_SCORES = [
  { key: 'talkRatio', label: 'talk ratio', band: '40%–55%', value: 0.47, points: 96, verdict: 'inside' as const },
  { key: 'questionsPer3Min', label: 'questions / 3 min', band: '3.0–8.0', value: 5.2, points: 92, verdict: 'inside' as const },
  { key: 'openClosedRatio', label: 'open : closed', band: '≥ 2.00:1', value: 3, points: 100, verdict: 'inside' as const },
  { key: 'fillerRate', label: 'fillers / min', band: '≤ 4.0', value: 1.1, points: 100, verdict: 'inside' as const },
  { key: 'longestMonologue', label: 'longest monologue', band: '≤ 22.0s', value: 8.4, points: 100, verdict: 'inside' as const },
  { key: 'meanResponseLatency', label: 'response latency', band: '≤ 1.80s', value: 1.1, points: 98, verdict: 'inside' as const },
]

async function main(): Promise<void> {
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
  const email = `rep-${stamp}@nerve.test`
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

    console.log('\nthe daily quota (§14)')
    const first = await consumeRep(userId)
    check(first.ok, 'a fresh account can spend its first rep')
    check(first.remaining === 0, 'free is one rep a day, and this was it')

    const second = await consumeRep(userId)
    check(!second.ok, 'the second rep of the day is refused')

    console.log('\nthe session row')
    const { data: persona } = await user.from('personas').select('id').eq('slug', 'nadia').maybeSingle()
    const { data: session, error: openError } = await user
      .from('sessions')
      .insert({
        user_id: userId,
        persona_id: persona?.id ?? null,
        persona_slug: 'nadia',
        provider: 'openai',
        model: 'gpt-realtime-mini',
      })
      .select('id')
      .single()
    check(!openError && !!session, `the rep opens a row when the transport connects${openError ? ` (${openError.message})` : ''}`)
    const sessionId = session?.id ?? ''

    const reconnect = await mayOpenSession(userId)
    check(reconnect.ok, 'a rep already in flight may reconnect on the quota it spent')

    // The same rule from the other side: a reload during a rep finds the open
    // row and does not spend a second one.
    const { data: reopened } = await user
      .from('sessions')
      .select('id')
      .eq('user_id', userId)
      .eq('persona_slug', 'nadia')
      .is('ended_at', null)
      .gte('started_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
      .maybeSingle()
    check(reopened?.id === sessionId, 'a reload during a rep resumes the row it already opened')

    console.log('\nthe three-minute rep')
    // Armed at 71, finished at 58: a dip, not a collapse, so she still offers.
    const peakWarmth = 71
    const finalWarmth = 58
    const won = wonFromRep({ peakWarmth, finalWarmth })
    check(
      won,
      `armed at ${peakWarmth} (≥ ${ARM_THRESHOLD}) and held at ${finalWarmth} (≥ ${KEEP_THRESHOLD}), so she gave her number`,
    )
    check(
      !wonFromRep({ peakWarmth, finalWarmth: KEEP_THRESHOLD - 1 }),
      'a collapse in the last thirty seconds takes it away again',
    )
    check(
      !wonFromRep({ peakWarmth: 60, finalWarmth: 60 }),
      'finishing warm without ever having armed is not a win',
    )

    const { error: closeError } = await user
      .from('sessions')
      .update({
        ended_at: new Date().toISOString(),
        duration_s: 178,
        ended_by: 'character',
        start_warmth: 32,
        final_warmth: finalWarmth,
        peak_warmth: peakWarmth,
        final_band: 'OPEN',
        won,
      })
      .eq('id', sessionId)
    check(!closeError, 'the rep closes with the meter on the row')

    const { data: closed } = await user
      .from('sessions')
      .select('duration_s, won, final_band')
      .eq('id', sessionId)
      .maybeSingle()
    check((closed?.duration_s ?? 999) <= 180, 'a dating rep is at most three minutes long')
    check(closed?.won === true, 'the win is stored')
    check(uiBand(closed?.final_band) === 'OPEN', 'the closing band survives the round trip')

    const { error: transcriptError } = await user.from('transcripts').upsert(
      { session_id: sessionId, user_id: userId, turns: asJson(TURNS), warmth: asJson(WARMTH_EVENTS) },
      { onConflict: 'session_id' },
    )
    check(!transcriptError, `the transcript and the gutter are stored${transcriptError ? ` (${transcriptError.message})` : ''}`)

    console.log('\nthe streak')
    await recordTrainingDay(userId)
    const { data: afterRep } = await user.from('streaks').select('current, longest, last_active_on').eq('user_id', userId).maybeSingle()
    check(afterRep?.current === 1, 'a first rep starts a one-day streak')
    check(afterRep?.longest === 1, 'the longest streak keeps up')

    await recordTrainingDay(userId)
    const { data: afterSecond } = await user.from('streaks').select('current').eq('user_id', userId).maybeSingle()
    check(afterSecond?.current === 1, 'a second rep on the same day does not inflate it')

    console.log('\nthe grade (§07)')
    const composite = 79
    const { error: scoreError } = await user.from('scores').insert({
      session_id: sessionId,
      user_id: userId,
      composite,
      opening: 84, curiosity: 80, listening: 78, signal_reading: 72, composure: 86, close: 70,
      deterministic_score: 98,
      metrics: asJson({ talkRatio: 0.47 }),
      metric_scores: asJson(METRIC_SCORES),
      evidence: asJson({}),
      went_well: 'He built on the thing she had just said instead of resetting.',
      focus: ['close', 'signalReading'],
      outcome: 'receptive',
      model_version: 'gpt-4.1',
      voice_provider: 'openai',
    })
    check(!scoreError, `the grade is written once${scoreError ? ` (${scoreError.message})` : ''}`)

    const { data: scoreRow } = await user
      .from('scores')
      .select('composite, metric_scores, focus, went_well, opening, curiosity, listening, signal_reading, composure, close')
      .eq('session_id', sessionId)
      .maybeSingle()

    const card = toScorecard({ sessionId, score: scoreRow!, events: WARMTH_EVENTS })
    const audit = card.metrics.reduce((sum, metric) => sum + metric.points, 0) + (card.judgement?.points ?? 0)
    check(audit === composite, `the visible rows add up to the composite (${audit} = ${composite})`)
    check(card.metrics.length === 6, 'all six deterministic metrics survive the round trip')
    check(card.tryNext.length > 0, 'the rep ends with one instruction to try next time')

    const moments = momentsFrom(WARMTH_EVENTS)
    check(moments.best?.delta === 16, 'the best moment is the turn that moved her most')
    check(moments.worst?.delta === -2, 'the worst moment is the one that cost him')

    console.log('\nthe ladder (§08)')
    await syncLevel(userId)
    const { data: profile } = await user.from('profiles').select('current_level').eq('id', userId).maybeSingle()
    check((profile?.current_level ?? 0) > 1, 'a win moves the ladder position')
    check(uiLevel(profile?.current_level ?? 1) === 2, 'one win at tier 1 opens tier 2 and no further')
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
