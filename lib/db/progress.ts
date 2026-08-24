import 'server-only'

/**
 * Quota, streak and level — the three numbers a user must not be able to write.
 *
 * All three live on tables (or columns) with no user write path, and every
 * function here goes through the service role. That is the same rule the
 * ledger follows and for the same reason: a user who can zero their own
 * counter has a free product, and a user who can set their own level has
 * skipped the part that makes the level mean anything (§14, §08).
 *
 * Nothing here throws. A rep is a live voice session; losing a streak
 * increment is a bad day, and losing the conversation to a failed UPDATE is a
 * bug the user cannot forgive.
 */

import { supabaseAdmin } from './admin'
import { daysBetween, localDay } from '@/lib/data/day'
import { engineRung, qualifyingByLevel, uiLevel, unlockedLevels, UNLOCK_RULES } from '@/lib/data/progression'
import { unlockedTier, type FieldHistory } from '@/lib/field/assignment'
import type { Level } from '@/lib/data/types'
import { recordUnlocks } from './unlocks'

export interface QuotaResult {
  ok: boolean
  message: string | null
  remaining: number | null
}

async function timezoneFor(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin().from('profiles').select('timezone').eq('id', userId).maybeSingle()
  return data?.timezone ?? null
}

/**
 * Spends one rep, or refuses.
 *
 * The daily counter carries the local day it belongs to, so a counter from
 * yesterday is simply not today's counter — the reset needs nothing scheduled
 * and cannot be missed by a cron that did not fire.
 *
 * The UPDATE is conditional on the row still holding the values it was read
 * with. Two tabs opening a rep at the same moment would otherwise both read
 * "none used" and both spend the same one.
 */
export async function consumeRep(userId: string): Promise<QuotaResult> {
  const admin = supabaseAdmin()
  const zone = await timezoneFor(userId)
  const today = localDay(new Date(), zone)

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data: row } = await admin
      .from('entitlements')
      .select('reps_per_day, reps_used_today, reps_day')
      .eq('user_id', userId)
      .maybeSingle()

    // No entitlement row is a sign-up trigger that has not landed. Let the rep
    // happen; an unmetered rep is a smaller failure than a user who cannot
    // train at all, and the ledger still records what it cost.
    if (!row) return { ok: true, message: null, remaining: null }

    const used = row.reps_day === today ? row.reps_used_today : 0
    if (used >= row.reps_per_day) {
      return { ok: false, message: 'You are out of reps for today.', remaining: 0 }
    }

    const { data: updated } = await admin
      .from('entitlements')
      .update({ reps_used_today: used + 1, reps_day: today })
      .eq('user_id', userId)
      .eq('reps_day', row.reps_day)
      .eq('reps_used_today', row.reps_used_today)
      .select('reps_per_day, reps_used_today')
      .maybeSingle()

    if (updated) {
      return { ok: true, message: null, remaining: Math.max(0, updated.reps_per_day - updated.reps_used_today) }
    }
    // Somebody else moved the row between the read and the write. Read again.
  }

  return { ok: false, message: 'Could not reserve a rep. Try again.', remaining: null }
}

/**
 * May this user open a voice session at all?
 *
 * The quota is spent when the transport connects, but the credential is minted
 * before that — so the mint has to answer the same question or the meter is a
 * suggestion. §14: the routes that spend money are the ones that need this.
 *
 * A rep already in flight is allowed through. Its quota is spent, and a
 * connection that drops thirty seconds in must be able to come back without
 * being told the user is out of reps for something they are still doing.
 */
export async function mayOpenSession(userId: string): Promise<{ ok: boolean; message: string | null }> {
  const admin = supabaseAdmin()
  const zone = await timezoneFor(userId)
  const today = localDay(new Date(), zone)

  const { data: row } = await admin
    .from('entitlements')
    .select('reps_per_day, reps_used_today, reps_day')
    .eq('user_id', userId)
    .maybeSingle()

  // No row is a sign-up trigger that has not landed. Let them train.
  if (!row) return { ok: true, message: null }

  const used = row.reps_day === today ? row.reps_used_today : 0
  if (used < row.reps_per_day) return { ok: true, message: null }

  const since = new Date(Date.now() - RECONNECT_WINDOW_MS).toISOString()
  const { count } = await admin
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('ended_at', null)
    .gte('started_at', since)

  if ((count ?? 0) > 0) return { ok: true, message: null }
  return { ok: false, message: 'You are out of reps for today.' }
}

/** How long a dropped rep may reconnect on the quota it already spent. */
const RECONNECT_WINDOW_MS = 10 * 60 * 1000

/**
 * The streak, on a day somebody actually trained.
 *
 * A rep counts and a logged ask counts, which is the point of §09: the field
 * costs no voice minutes, so the day the quota runs out is still a day the
 * habit can hold. §14 calls that out explicitly — running out must never break
 * the streak, or the paywall is also a churn event.
 *
 * Consecutive local days, and a second entry on the same day changes nothing.
 * §01 is one rep a day, and a streak that rewards six reps on Sunday is a
 * streak that teaches bingeing.
 */
export async function recordTrainingDay(userId: string): Promise<void> {
  const admin = supabaseAdmin()
  const zone = await timezoneFor(userId)
  const today = localDay(new Date(), zone)

  const { data: row } = await admin
    .from('streaks')
    .select('current, longest, last_active_on')
    .eq('user_id', userId)
    .maybeSingle()

  if (!row || row.last_active_on === today) return

  const continued = row.last_active_on !== null && daysBetween(row.last_active_on, today) === 1
  const streak = continued ? row.current + 1 : 1

  await admin
    .from('streaks')
    .update({
      current: streak,
      longest: Math.max(row.longest, streak),
      last_active_on: today,
    })
    .eq('user_id', userId)
}

/**
 * The field's own record of somebody, for the tier-4 gate (§09).
 *
 * Counted off `field_logs` rather than kept as a counter, for the same reason
 * the ladder is derived: a stored number can disagree with the history it is
 * supposed to summarise, and this one decides whether a person is handed the
 * hardest ask on the ladder.
 *
 * DISTINCT DAYS, and asks MADE. Five asks in one afternoon is one exposure;
 * `asked = false` is an honest log of a challenge somebody did not do, and §09
 * is explicit that honesty keeps the challenge but does not keep the credit.
 */
export async function fieldHistory(userId: string): Promise<FieldHistory> {
  const admin = supabaseAdmin()
  const { data } = await admin
    .from('field_logs')
    .select('logged_on')
    .eq('user_id', userId)
    .eq('tier', 3)
    .eq('asked', true)

  return { tier3AskDays: new Set((data ?? []).map((row) => row.logged_on)).size }
}

/**
 * Opens the field tier that the field itself has earned, and records the moment.
 *
 * `syncLevel` runs after a graded rep, which is the wrong event for T4: it is
 * earned by going outside and asking, so waiting for the next rep would mean a
 * user unlocks it on a Tuesday and is told on Thursday. This runs from the log
 * path instead, so the moment fires when the thing actually happened.
 *
 * Idempotent, like every other unlock write — `recordUnlocks` is the one that
 * guarantees a moment fires once ever.
 */
export async function syncFieldTier(userId: string): Promise<void> {
  const admin = supabaseAdmin()
  const { data: profile } = await admin
    .from('profiles')
    .select('current_level')
    .eq('id', userId)
    .maybeSingle()
  if (!profile) return

  const tier = unlockedTier(profile.current_level, await fieldHistory(userId))
  if (tier > 1) await recordUnlocks(userId, [{ kind: 'tier', ref: String(tier) }])
}

/**
 * Recomputes the ladder position from the reps that actually scored.
 *
 * Derived rather than incremented: an unlock is a fact about your history, and
 * a counter that drifts from that history is a user who is either stuck or
 * promoted for a rep they never ran. Levels only ever go up here — a bad week
 * does not take a character away, and a downward adjustment is never announced
 * (§08, §12).
 *
 * Also the one place that RECORDS an unlock. What is unlocked stays derived;
 * the row exists so the moment can fire once and so a cohort's time-to-Level-3
 * is answerable later. Recording is idempotent, so running this after every
 * grade costs nothing after the first.
 */
export async function syncLevel(userId: string): Promise<void> {
  const admin = supabaseAdmin()

  const [{ data: personas }, { data: sessions }, { data: scores }, { data: profile }] =
    await Promise.all([
      admin.from('personas').select('slug, level'),
      admin.from('sessions').select('id, persona_slug').eq('user_id', userId).not('ended_at', 'is', null),
      admin.from('scores').select('session_id, composite').eq('user_id', userId),
      admin.from('profiles').select('current_level').eq('id', userId).maybeSingle(),
    ])

  if (!profile) return

  // §08's rule: two sessions scoring 70+ at a level opens the one above. The
  // join is the point — the gate used to read `sessions.won`, which is whether
  // she gave her number, and §07 is careful to make that never the thing that
  // counts.
  const levelBySlug = new Map((personas ?? []).map((row) => [row.slug, uiLevel(row.level)]))
  const compositeBySession = new Map((scores ?? []).map((row) => [row.session_id, row.composite]))

  const reps = (sessions ?? []).flatMap((session) => {
    const level = levelBySlug.get(session.persona_slug)
    return level ? [{ level, composite: compositeBySession.get(session.id) ?? null }] : []
  })

  const open = unlockedLevels(qualifyingByLevel(reps))

  // Tiers 1 and 2 are open from the start, so they are not moments — telling
  // somebody they have unlocked what they were given is worse than saying
  // nothing. Only a tier with a rule can be earned.
  await recordUnlocks(userId, [...open]
    .filter((tier) => UNLOCK_RULES[tier] !== null)
    .map((tier) => ({ kind: 'level' as const, ref: String(tier) })))

  const topTier = Math.max(...open) as Level
  // The rung the roster offers at that tier, which is where the ladder position
  // sits. This was `topTier * 2` — the inverse of the old eight-rungs-over-four-
  // tiers mapping — and it has to keep being the exact inverse of `uiLevel`, so
  // it reads from the one table rather than repeating the arithmetic.
  const engineLevel = engineRung(topTier)

  // Field tiers 2 and 3 ride on the sim level (§09), so they open at the same
  // moment and are recorded from the same place. T1 is day one and is not
  // earned; T4 is earned in the field and cannot open here, so the history is
  // read rather than assumed — a rep is not the event that opens it, but a rep
  // must not close it either once it has been earned.
  const fieldTier = unlockedTier(
    Math.max(engineLevel, profile.current_level),
    await fieldHistory(userId),
  )
  if (fieldTier > 1) {
    await recordUnlocks(userId, [{ kind: 'tier', ref: String(fieldTier) }])
  }

  // Only ever upward. A bad week does not take a character away, and a
  // downward adjustment is never announced (§08, §12).
  if (engineLevel <= profile.current_level) return
  await admin.from('profiles').update({ current_level: engineLevel }).eq('id', userId)
}
