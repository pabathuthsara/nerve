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
import { uiLevel, unlockedLevels, wonFromOutcome } from '@/lib/data/progression'

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
 * Recomputes the ladder position from the reps that have actually been won.
 *
 * Derived rather than incremented: an unlock is a fact about your history, and
 * a counter that drifts from that history is a user who is either stuck or
 * promoted for a rep they never ran. Levels only ever go up here — a bad week
 * does not take a character away, and a downward adjustment is never announced
 * (§08, §12).
 */
export async function syncLevel(userId: string): Promise<void> {
  const admin = supabaseAdmin()

  const [{ data: personas }, { data: sessions }, { data: profile }] = await Promise.all([
    admin.from('personas').select('slug, level'),
    admin.from('sessions').select('persona_slug, won, outcome').eq('user_id', userId).not('ended_at', 'is', null),
    admin.from('profiles').select('current_level').eq('id', userId).maybeSingle(),
  ])

  if (!profile) return

  const levelBySlug = new Map((personas ?? []).map((row) => [row.slug, uiLevel(row.level)]))
  const winsByLevel: Record<number, number> = {}
  for (const session of sessions ?? []) {
    if (!(session.won ?? wonFromOutcome(session.outcome))) continue
    const level = levelBySlug.get(session.persona_slug)
    if (!level) continue
    winsByLevel[level] = (winsByLevel[level] ?? 0) + 1
  }

  const topTier = Math.max(...unlockedLevels(winsByLevel))
  // Engine levels are 1-8, two rungs per UI tier; the top of the tier is what
  // the roster will offer, so that is where the ladder position sits.
  const engineLevel = Math.min(8, topTier * 2)
  if (engineLevel <= profile.current_level) return

  await admin.from('profiles').update({ current_level: engineLevel }).eq('id', userId)
}
