/**
 * The field loop, end to end, against the real database.
 *
 *   npm run db:field
 *
 * A throwaway user is assigned a challenge, accepts it with a prediction,
 * logs what actually happened, and the harness checks the things the loop has
 * to get right:
 *
 *   the assignment is the same challenge however many times you ask
 *   the prediction cannot be revised once the ask has happened
 *   an ask made carries the streak on a day with no rep (§09, §14)
 *   a log cannot be rewritten, by anybody, ever
 *   the counters match a hand count of the rows
 *   the tenth rejection fires its milestone, once, and the eleventh does not
 *
 * The user is deleted at the end whatever happens.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/db/types'
import { fieldHistory, recordTrainingDay, syncFieldTier } from '@/lib/db/progress'
import { announceMilestone, recordRejectionMilestones } from '@/lib/db/unlocks'
import { anxietySeries } from '@/lib/field/anxiety'
import { chooseChallenge, T4_ASK_DAYS, unlockedTier } from '@/lib/field/assignment'
import { milestoneRef } from '@/lib/field/milestones'
import { localDay, shiftDays } from '@/lib/data/day'

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

    console.log('\nthe counters, and the chart behind them')
    // Nine more rejections, so the account sits on ten with the one above.
    // Predictions descend and actuals stay low, which is the shape the chart
    // exists to show — and is checked here rather than assumed.
    for (let index = 0; index < 9; index += 1) {
      const { error } = await user.from('field_logs').insert({
        user_id: userId,
        challenge_id: pick?.id ?? null,
        challenge_title: library?.[0]?.title ?? 'challenge',
        tier: 1,
        asked: true,
        outcome: 'declined',
        anxiety_pre: 8 - Math.floor(index / 3),
        anxiety_post: 3,
        logged_on: today,
      })
      if (error) check(false, `could not log rejection ${index + 2} (${error.message})`)
    }

    // One yes and one honest "could not do it", so the counters have something
    // to get wrong. Only the refusals may reach the headline number (§09).
    await user.from('field_logs').insert({
      user_id: userId, challenge_id: pick?.id ?? null, challenge_title: 'a yes',
      tier: 1, asked: true, outcome: 'accepted', anxiety_pre: 6, anxiety_post: 2, logged_on: today,
    })
    await user.from('field_logs').insert({
      user_id: userId, challenge_id: pick?.id ?? null, challenge_title: 'not asked',
      tier: 1, asked: false, outcome: 'not_asked', anxiety_pre: 9, anxiety_post: null, logged_on: today,
    })

    const { data: allLogs } = await user
      .from('field_logs')
      .select('asked, outcome, anxiety_pre, anxiety_post, logged_on')
      .eq('user_id', userId)
    const rows = allLogs ?? []
    const byHand = {
      total: rows.length,
      asks: rows.filter((row) => row.asked).length,
      rejections: rows.filter((row) => row.outcome === 'declined').length,
    }
    check(byHand.total === 12, `twelve rows were written (counted ${byHand.total})`)
    check(byHand.rejections === 10, `rejections collected is ten, not twelve (counted ${byHand.rejections})`)
    check(byHand.asks === 11, `asks made is eleven — the yes counts, the one not asked does not (counted ${byHand.asks})`)

    const series = anxietySeries(rows.map((row) => ({
      anxietyPre: row.anxiety_pre, anxietyPost: row.anxiety_post, loggedOn: row.logged_on,
    })))
    check(series.points.length === 11, `the chart plots the eleven asks with both numbers (got ${series.points.length})`)
    check(
      (series.meanGap ?? 0) > 0,
      `and it lands easier than predicted — ${series.meanPredicted} expected, ${series.meanActual} actual`,
    )

    console.log('\nthe milestone, once and only once')
    const crossed = await recordRejectionMilestones(userId, 9, 10)
    check(crossed.length === 1 && crossed[0]?.at === 10, 'the tenth rejection crosses the milestone')

    const pendingQuery = () => user
      .from('unlocks')
      .select('ref, announced_at')
      .eq('kind', 'milestone')
      .is('announced_at', null)
    const { data: pending } = await pendingQuery()
    check(pending?.length === 1 && pending[0]?.ref === 'rejections:10', 'it is waiting to be shown, exactly once')

    // The retry case: the same ask logged twice must not double the moment.
    await recordRejectionMilestones(userId, 9, 10)
    const { count: rowCount } = await user
      .from('unlocks')
      .select('ref', { count: 'exact', head: true })
      .eq('kind', 'milestone')
      .eq('ref', milestoneRef(10))
    check(rowCount === 1, 'recording it twice still leaves one row')

    await announceMilestone(userId, milestoneRef(10))
    const { data: afterShown } = await pendingQuery()
    check((afterShown?.length ?? 0) === 0, 'once shown, it never comes back')

    // The eleventh rejection is the acceptance criterion: no second sheet.
    const eleventh = await recordRejectionMilestones(userId, 10, 11)
    check(eleventh.length === 0, 'the eleventh rejection fires nothing')

    const { error: forged } = await user
      .from('unlocks')
      .insert({ user_id: userId, kind: 'milestone', ref: milestoneRef(100) })
    check(!!forged, 'and a user cannot award themselves one')

    console.log('\nthe tier-4 gate, counted off the log (§09)')
    // The pure rule is asserted in `assignment.test.ts`. What can only be
    // checked here is the counting: that `fieldHistory` reads DISTINCT DAYS of
    // tier-3 asks off real rows, and that the two ways of not earning it —
    // asking twice in one day, and honestly logging that you did not ask —
    // really do not count.
    check((await fieldHistory(userId)).tier3AskDays === 0, 'a new account has no tier-3 days')

    const tier3 = (library ?? []).find((row) => row.tier === 3)
    check(!!tier3, 'the library carries a tier-3 challenge to log against')

    const logTier3 = async (day: string, asked: boolean) => {
      await admin.from('field_logs').insert({
        user_id: userId,
        challenge_id: tier3?.id ?? null,
        challenge_title: tier3?.title ?? 'tier 3',
        tier: 3,
        asked,
        outcome: asked ? 'declined' : 'not_asked',
        logged_on: day,
      })
    }

    await logTier3(shiftDays(today, -1), true)
    await logTier3(shiftDays(today, -1), true)
    check((await fieldHistory(userId)).tier3AskDays === 1, 'two asks on one day is one day, not two')

    await logTier3(shiftDays(today, -2), false)
    check((await fieldHistory(userId)).tier3AskDays === 1, 'a day you did not ask does not count')

    for (let day = 3; day <= 5; day += 1) await logTier3(shiftDays(today, -day), true)
    const short = await fieldHistory(userId)
    check(short.tier3AskDays === T4_ASK_DAYS - 1, `${T4_ASK_DAYS - 1} days is not yet enough`)
    check(unlockedTier(4, short) === 3, 'and the gate is still shut on the last day before')

    await logTier3(shiftDays(today, -6), true)
    const earned = await fieldHistory(userId)
    check(earned.tier3AskDays === T4_ASK_DAYS, `${T4_ASK_DAYS} distinct days of asking is counted`)
    check(unlockedTier(4, earned) === 4, 'the top rung plus the field days opens tier 4')
    check(unlockedTier(2, earned) === 2, 'and the field days alone never do')

    // The moment fires from the log path rather than waiting for the next
    // graded rep, which is the whole reason `syncFieldTier` exists. The account
    // has to be on the top rung for it: field days are necessary, never
    // sufficient.
    const tierRows = () => user.from('unlocks').select('ref').eq('kind', 'tier').eq('ref', '4')

    await syncFieldTier(userId)
    const { data: beforeRung } = await tierRows()
    check((beforeRung?.length ?? 0) === 0, 'the field days alone record no moment')

    await admin.from('profiles').update({ current_level: 4 }).eq('id', userId)
    await syncFieldTier(userId)
    const { data: afterRung } = await tierRows()
    check((afterRung?.length ?? 0) === 1, 'the moment is recorded from the log path')

    // Logging another ask must not fire a second sheet for the same tier.
    await syncFieldTier(userId)
    const { data: twice } = await tierRows()
    check((twice?.length ?? 0) === 1, 'and running it again still leaves one row')
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
