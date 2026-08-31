/**
 * The rep lifecycle, end to end, without a microphone.
 *
 *   npm run db:rep
 *
 * Everything a rep does except the voice itself: spend a quota, open a row,
 * write the transcript and the meter, record the day, store the grade, decide
 * the win, move the ladder, and leave her with one line she still has in mind.
 * The transport is the one part this cannot cover — WebRTC needs a browser and
 * a microphone — and it is also the part that has had a harness since M0.
 *
 * Written against the real database with a throwaway user, for the reason
 * `db:verify` exists: a path that has only ever been exercised by hand is a
 * path nobody has tested. The user is deleted at the end whatever happens.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { asJson } from '@/lib/db/json'
import type { Database } from '@/lib/db/types'
import { consumeRep, mayOpenSession, recordTrainingDay, refundRep, syncLevel } from '@/lib/db/progress'
import { momentsFrom, toScorecard, type StoredWarmthEvent } from '@/lib/data/scorecard'
import { qualifyingByLevel, uiBand, uiLevel, unlockedLevels, wonFromRep } from '@/lib/data/progression'
import { rankFor, type Rank } from '@/lib/data/rank'
import { toProgressPoint } from '@/lib/data/queries'
import { announceUnlock, recordUnlocks } from '@/lib/db/unlocks'
import { ARM_THRESHOLD, KEEP_THRESHOLD, resultReading } from '@/lib/data/rep-rules'
import { memoryLineFrom } from '@/lib/grade/memory'
import { retestDue } from '@/lib/data/baseline'
import { localDay, shiftDays } from '@/lib/data/day'
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

    console.log('\nthe sign-up rep (P2) — one voice rep, once, ever')
    // A brand-new account is on free, which grants no reps a day. Everything it
    // can spend is the one-off sign-up grant.
    const first = await consumeRep(userId)
    check(first.ok, 'a fresh free account can spend its sign-up rep')
    check(first.remaining === 0, 'and that is the only voice rep it has')

    const { data: stamped } = await admin
      .from('entitlements')
      .select('onboarding_rep_used_at')
      .eq('user_id', userId)
      .maybeSingle()
    check(!!stamped?.onboarding_rep_used_at, 'spending it stamps the grant, so it cannot be spent twice')

    const second = await consumeRep(userId)
    check(!second.ok, 'the second rep is refused')
    check(
      second.refusal === 'upgrade',
      'and refused as the upgrade moment, not as "out of reps for today"',
    )
    check(
      !!second.message && !second.message.includes('today'),
      'a free account is never told to wait for a midnight that changes nothing',
    )

    console.log('\nthe refund — a rep that recorded no speech (§14)')
    const refund = await refundRep(userId)
    check(refund.ok && refund.remaining === 1, 'a rep nobody spoke in is given back')

    const { data: cleared } = await admin
      .from('entitlements')
      .select('onboarding_rep_used_at')
      .eq('user_id', userId)
      .maybeSingle()
    check(
      cleared?.onboarding_rep_used_at === null,
      'refunding the sign-up rep clears the stamp — a muted microphone must not cost the only rep there is',
    )

    const respent = await consumeRep(userId)
    check(respent.ok && respent.remaining === 0, 'and the returned rep can actually be spent again')

    // Down to an unspent counter, then two more. The floor is what stops a
    // refund loop minting reps out of nothing.
    await refundRep(userId)
    await refundRep(userId)
    const floor = await refundRep(userId)
    check(
      floor.ok && floor.remaining === 1,
      'refunding an unspent counter cannot mint reps past the cap',
    )

    console.log('\ntomorrow — the grant does not come back')
    // The counter resets with the local day; the grant does not. Spend it, then
    // roll the day forward and confirm the account has nothing left.
    await consumeRep(userId)
    const { data: zone } = await admin.from('profiles').select('timezone').eq('id', userId).maybeSingle()
    const yesterday = shiftDays(localDay(new Date(), zone?.timezone ?? null), -1)
    await admin
      .from('entitlements')
      .update({ reps_day: yesterday, reps_used_today: 0 })
      .eq('user_id', userId)

    const tomorrow = await consumeRep(userId)
    check(!tomorrow.ok, 'a new day does not hand a free account another voice rep')
    check(tomorrow.refusal === 'upgrade', 'and the refusal is still the upgrade moment')

    console.log('\nthe plan is what grants voice')
    await admin.from('entitlements').update({ plan: 'pro', reps_per_day: 3 }).eq('user_id', userId)
    const onPro = await consumeRep(userId)
    check(onPro.ok && onPro.remaining === 2, 'Pro grants three reps a day and the counter reflects it')
    await consumeRep(userId)
    await consumeRep(userId)
    const proExhausted = await consumeRep(userId)
    check(!proExhausted.ok, 'a Pro account still runs out')
    check(
      proExhausted.refusal === 'daily' && !!proExhausted.message?.includes('today'),
      'but it runs out for TODAY, which is a different sentence and a different screen',
    )
    await admin.from('entitlements').update({ plan: 'free', reps_per_day: 0 }).eq('user_id', userId)

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

    // The account is back on free with the sign-up rep spent, so it has no
    // allowance at all — which means this is the in-flight branch and not the
    // counter's.
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

    // The warmth the ending was DECIDED on. Deliberately below the arm
    // threshold while the rep finishes above it — the real Nadia rep that
    // exposed this finished at 71.25 having been at 63.68 when she was told to
    // leave, and the result screen showed the wrong one of those two.
    const decisionWarmth = 63.68
    const { error: closeError } = await user
      .from('sessions')
      .update({
        ended_at: new Date().toISOString(),
        duration_s: 178,
        ended_by: 'character',
        start_warmth: 32,
        final_warmth: finalWarmth,
        peak_warmth: peakWarmth,
        decision_warmth: decisionWarmth,
        final_band: 'OPEN',
        won,
      })
      .eq('id', sessionId)
    check(!closeError, 'the rep closes with the meter on the row')

    const { data: decided } = await user
      .from('sessions').select('decision_warmth, final_warmth').eq('id', sessionId).maybeSingle()
    check(Number(decided?.decision_warmth) === decisionWarmth, 'and with the warmth the ending turned on')

    const reading = resultReading({
      decisionWarmth: Number(decided?.decision_warmth),
      finalWarmth: 71.25,
      interview: false,
      won: false,
    })
    check(reading.warmth === decisionWarmth, 'the result screen reads the decision, not the finish')
    check(
      reading.lateSurge,
      `and names the late surge: ${decisionWarmth} when she decided, 71.25 at the end`,
    )
    check(
      resultReading({ decisionWarmth: null, finalWarmth: 71.25, interview: false, won: false }).fallback,
      'a rep recorded before the column existed falls back and says so',
    )

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
    check((profile?.current_level ?? 0) > 1, 'a graded rep moves the ladder position')
    check(uiLevel(profile?.current_level ?? 1) === 2, 'tier 2 is open and nothing above it')

    // The §08 rail. Derived by `rankFor` and mirrored onto the profile by
    // `syncLevel`, so what the home screen reads and what the unlocks were
    // computed from cannot be two different answers.
    const rankNow = async () =>
      (await user.from('profiles').select('rank').eq('id', userId).maybeSingle()).data?.rank

    // One qualifying rep is not a rank. §08 asks for two, uniformly, and the
    // rail must not move on the first one — a rank you get for showing up is
    // the badge shelf §08 explicitly does not want.
    check(await rankNow() === 'rookie', 'one qualifying rep leaves you a Rookie')


    // §08's rule, against the real join. One rep scoring 79 is not two, so the
    // tier above must stay shut — the gate is demonstrated skill, and this is
    // the half that proves it does not open early.
    const openNow = async () => {
      const { data: rows } = await user.from('sessions').select('id, persona_slug').not('ended_at', 'is', null)
      const { data: scored } = await user.from('scores').select('session_id, composite')
      const byId = new Map((scored ?? []).map((row) => [row.session_id, row.composite]))
      return unlockedLevels(qualifyingByLevel((rows ?? []).map((row) => ({
        // Nadia is rung 2 since Tess took the bottom of the ladder.
        level: uiLevel(row.persona_slug === 'nadia' ? 2 : 8),
        composite: byId.get(row.id) ?? null,
      }))))
    }
    check(!(await openNow()).has(3), 'one qualifying rep does not open the tier above')

    console.log('\nthe unlock, once and only once (§12)')
    const pending = (kind: 'level' | 'tier') => user
      .from('unlocks')
      .select('kind, ref, announced_at')
      .eq('kind', kind)
      .is('announced_at', null)

    // Roster tiers 1 and 2 are open from the start, so they are not moments —
    // telling somebody they have unlocked what they were given is worse than
    // saying nothing.
    const { data: levelsWaiting } = await pending('level')
    check((levelsWaiting?.length ?? 0) === 0, 'a roster tier that was always open is never announced')

    // The field tier is a different story and SHOULD be here. A fresh account
    // reaches engine level 4 the moment its first rep is graded, because UI
    // tiers 1 and 2 are free, and §09 opens Tier 2 challenges at sim level 4.
    const { data: tiersWaiting } = await pending('tier')
    check(
      tiersWaiting?.length === 1 && tiersWaiting[0]?.ref === '2',
      'the field tier the sim level just opened is waiting to be shown (§09)',
    )

    // Force the earned case: record tier 3 the way syncLevel would.
    await recordUnlocks(userId, [{ kind: 'level', ref: '3' }])
    const { data: waiting } = await pending('level')
    check(waiting?.length === 1 && waiting[0]?.ref === '3', 'an earned tier waits to be shown, exactly once')

    await recordUnlocks(userId, [{ kind: 'level', ref: '3' }])
    const { count: rowCount } = await user
      .from('unlocks')
      .select('ref', { count: 'exact', head: true })
      .eq('kind', 'level')
      .eq('ref', '3')
    check(rowCount === 1, 'recording it twice still leaves one row')

    await announceUnlock(userId, 'level', '3')
    const { data: afterShown } = await pending('level')
    check((afterShown?.length ?? 0) === 0, 'once shown, it never comes back')

    const { error: forgedUnlock } = await user
      .from('unlocks')
      .insert({ user_id: userId, kind: 'level', ref: '4' })
    check(!!forgedUnlock, 'and a user cannot unlock a level for themselves')

    console.log('\nthe baseline (§08)')
    // Written by the first graded rep and filtered on `baseline_session_id is
    // null`, so it is written once however the timing falls. A baseline that
    // moves is not a baseline — the week-four comparison would be measuring
    // against a target walking towards it.
    const setBaseline = (id: string, score: number) => user
      .from('profiles')
      .update({ baseline_session_id: id, baseline_score: score })
      .eq('id', userId)
      .is('baseline_session_id', null)

    await setBaseline(sessionId, composite)
    const { data: withBaseline } = await user
      .from('profiles').select('baseline_session_id, baseline_score').eq('id', userId).maybeSingle()
    check(withBaseline?.baseline_session_id === sessionId, 'the first graded rep becomes the baseline')
    check(withBaseline?.baseline_score === composite, 'and its composite is kept beside it')

    // A second rep must not move it.
    await setBaseline('00000000-0000-0000-0000-000000000000', 99)
    const { data: stillBaseline } = await user
      .from('profiles').select('baseline_session_id, baseline_score').eq('id', userId).maybeSingle()
    check(
      stillBaseline?.baseline_session_id === sessionId && stillBaseline?.baseline_score === composite,
      'a later rep never revises it',
    )

    check(
      !retestDue({
        baseline: { sessionId, personaId: 'nadia', score: composite, takenAt: new Date().toISOString() },
        retest: null,
        now: new Date(),
        timezone: 'Asia/Colombo',
      }),
      'the week-four offer stays shut on day one',
    )

    console.log('\nwhat she remembers (§08)')
    // The filter decides; nothing reaches the table without clearing it. These
    // two are the plan's own examples and they are the reason this table is
    // safe to write to at all — a character who is pleased to see you is a
    // companion app, and §14 says that is a payment account waiting to be
    // closed.
    check(
      memoryLineFrom('You were doing well until you asked about work.') === null,
      'a line about how he did never becomes a memory',
    )
    check(
      memoryLineFrom("I've been hoping you'd come back.") === null,
      'and neither does a line about wanting to see him again',
    )

    const GOOD_LINE = "Still looking for the blue one. Sister's birthday is Thursday."
    const line = memoryLineFrom(GOOD_LINE)
    check(line === GOOD_LINE, 'a line about her own situation survives the filter')

    const { error: memoryError } = await user.from('persona_memory').upsert(
      { user_id: userId, persona_id: persona?.id ?? '', summary: line ?? '', last_seen_at: new Date().toISOString() },
      { onConflict: 'user_id,persona_id' },
    )
    check(!memoryError, `it is written down${memoryError ? ` (${memoryError.message})` : ''}`)

    // What the live page reads to build the character contract. If this comes
    // back empty the rep opens cold whatever is in the table.
    const recall = async () => {
      const { data } = await user
        .from('persona_memory')
        .select('summary')
        .eq('user_id', userId)
        .eq('persona_id', persona?.id ?? '')
        .maybeSingle()
      return data?.summary ?? null
    }
    check((await recall()) === GOOD_LINE, 'the next rep opens with it')

    // A second rep must replace the line rather than accumulate lines.
    await user.from('persona_memory').upsert(
      { user_id: userId, persona_id: persona?.id ?? '', summary: 'The train was twenty minutes late again.', last_seen_at: new Date().toISOString() },
      { onConflict: 'user_id,persona_id' },
    )
    const { count: memoryRows } = await user
      .from('persona_memory')
      .select('user_id', { count: 'exact', head: true })
      .eq('user_id', userId)
    check(memoryRows === 1, 'a later rep replaces the line rather than stacking another')

    // The reset, which is the whole reason `persona_memory` grants its owner
    // DELETE rather than being service-role write like the ladder position.
    const { error: forgetError } = await user
      .from('persona_memory')
      .delete()
      .eq('user_id', userId)
      .eq('persona_id', persona?.id ?? '')
    check(!forgetError, `one tap clears it${forgetError ? ` (${forgetError.message})` : ''}`)
    check((await recall()) === null, 'and the rep after that opens cold')

    // The reset clears the line and nothing else. This is what the copy beside
    // the control promises, so it is asserted rather than trusted.
    const { count: survivingSessions } = await user
      .from('sessions').select('id', { count: 'exact', head: true }).eq('user_id', userId)
    const { count: survivingScores } = await user
      .from('scores').select('session_id', { count: 'exact', head: true }).eq('user_id', userId)
    const { data: afterForget } = await user
      .from('profiles').select('current_level').eq('id', userId).maybeSingle()
    check(
      survivingSessions === 1 && survivingScores === 1 && afterForget?.current_level === profile?.current_level,
      'forgetting takes the line and leaves the rep, the score and the ladder alone',
    )

    // Deliberately last. It adds a second graded rep, and the memory checks
    // above count rows — a harness that quietly changes the fixture other
    // checks are reading is a harness that passes for the wrong reason.
    console.log('\nthe progress read (§10 E)')
    // `/progress` digs the two habit metrics out of a jsonb array by key. A
    // rename in `METRIC_BANDS` would turn both lines flat with nothing failing,
    // so a real stored row is put through the real mapping here.
    const { data: progressRow } = await user
      .from('scores')
      .select('session_id, graded_at, composite, opening, curiosity, listening, signal_reading, composure, close, metric_scores')
      .eq('session_id', sessionId)
      .maybeSingle()
    check(!!progressRow, 'the graded rep is readable in the shape /progress asks for')

    if (progressRow) {
      const point = toProgressPoint(progressRow as never, 'nadia')
      check(point.composite === composite, 'the composite survives the mapping')
      check(Object.keys(point.subScores).length === 6, `all six sub-scores map (got ${Object.keys(point.subScores).length})`)
      check(point.talkRatio !== null, 'talk ratio is found in the stored metric array')
      check(point.fillerRate !== null, 'and so is the filler rate')
    }

    console.log('\nthe rank rail (§08)')
    const { data: secondRep } = await admin
      .from('sessions')
      .insert({ user_id: userId, persona_slug: 'nadia', provider: 'openai', model: 'gpt-realtime-mini', ended_at: new Date().toISOString() })
      .select('id')
      .single()
    await admin.from('scores').insert({
      session_id: secondRep?.id ?? '', user_id: userId, composite: 82,
      model_version: 'harness', voice_provider: 'openai',
    })
    await syncLevel(userId)

    const promoted = await rankNow()
    check(promoted === 'regular', `a second qualifying rep makes you a Regular (got ${promoted})`)
    // Two qualifying reps against Nadia, who stands on tier 2 since Tess took
    // the bottom of the ladder. The tier the reps were run at is the input
    // `rankFor` takes, so this number moves with the roster.
    check(rankFor({ 2: 2 }) === (promoted as Rank), 'and the mirror agrees with the function that decides it')
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
