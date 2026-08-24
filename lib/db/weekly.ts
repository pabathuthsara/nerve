import 'server-only'

/**
 * Generating the Sunday review (§09, §11).
 *
 * Service role, because it runs from a cron with no user session and writes a
 * table that is read-only to its owner — a letter you can write yourself is
 * not a letter.
 *
 * **Stored, never recomputed on read.** It is a letter about one specific
 * week: "You were turned down seven times this week" has to keep saying seven
 * in October, when the numbers behind it have moved on.
 */

import { supabaseAdmin } from './admin'
import { localDay, shiftDays } from '@/lib/data/day'
import { EMPTY_WEEK, reviewCopy, reviewDue, weekStartFor, type WeekStats } from '@/lib/data/weekly'

export interface ReviewResult {
  written: number
  skipped: number
}

/**
 * Write a review for every user whose local clock has just passed Sunday 06:00.
 *
 * The cron runs hourly and this asks each user's own timezone, because Vercel
 * crons run in UTC and "Sunday morning" is the user's Sunday. A second run in
 * the same week writes nothing: `(user_id, week_start)` is unique and the
 * insert ignores duplicates.
 */
export async function generateWeeklyReviews(now = new Date()): Promise<ReviewResult> {
  const admin = supabaseAdmin()
  const { data: profiles } = await admin.from('profiles').select('id, timezone')

  let written = 0
  let skipped = 0

  for (const profile of profiles ?? []) {
    const zone = profile.timezone ?? null
    if (!reviewDue(now, zone)) { skipped += 1; continue }

    const weekStart = weekStartFor(now, zone)
    const { data: existing } = await admin
      .from('weekly_reviews')
      .select('id')
      .eq('user_id', profile.id)
      .eq('week_start', weekStart)
      .maybeSingle()
    if (existing) { skipped += 1; continue }

    const stats = await collectWeek(profile.id, weekStart, now, zone)
    const { error } = await admin.from('weekly_reviews').insert({
      user_id: profile.id,
      week_start: weekStart,
      stats: stats as unknown as never,
      copy: reviewCopy(stats),
    })
    if (error) { skipped += 1; continue }
    written += 1
  }

  return { written, skipped }
}

/**
 * The week's numbers, counted rather than estimated.
 *
 * The previous week's mean is collected alongside so the copy can report a
 * trend — and can decline to invent one when there is no previous week.
 */
async function collectWeek(
  userId: string,
  weekStart: string,
  now: Date,
  zone: string | null,
): Promise<WeekStats> {
  const admin = supabaseAdmin()
  const end = localDay(now, zone)
  const previousStart = shiftDays(weekStart, -7)

  const [{ data: sessions }, { data: logs }, { data: streak }] = await Promise.all([
    admin
      .from('sessions')
      .select('id, won, started_at')
      .eq('user_id', userId)
      .not('ended_at', 'is', null)
      .gte('started_at', `${previousStart}T00:00:00Z`),
    admin
      .from('field_logs')
      .select('asked, outcome, logged_on')
      .eq('user_id', userId)
      .gte('logged_on', weekStart)
      .lte('logged_on', end),
    admin.from('streaks').select('current').eq('user_id', userId).maybeSingle(),
  ])

  const inWeek = (iso: string) => {
    const day = localDay(new Date(iso), zone)
    return day >= weekStart && day <= end
  }
  const inPreviousWeek = (iso: string) => {
    const day = localDay(new Date(iso), zone)
    return day >= previousStart && day < weekStart
  }

  const all = sessions ?? []
  const thisWeek = all.filter((row) => inWeek(row.started_at))
  const lastWeek = all.filter((row) => inPreviousWeek(row.started_at))

  const { data: scores } = all.length
    ? await admin.from('scores').select('session_id, composite').in('session_id', all.map((row) => row.id))
    : { data: [] as { session_id: string; composite: number }[] }
  const byId = new Map((scores ?? []).map((row) => [row.session_id, row.composite]))

  const mean = (rows: typeof all) => {
    const values = rows
      .map((row) => byId.get(row.id))
      .filter((value): value is number => typeof value === 'number')
    if (values.length === 0) return null
    return values.reduce((sum, value) => sum + value, 0) / values.length
  }

  const asks = logs ?? []
  return {
    ...EMPTY_WEEK,
    reps: thisWeek.length,
    wins: thisWeek.filter((row) => row.won === true).length,
    asksMade: asks.filter((row) => row.asked).length,
    rejections: asks.filter((row) => row.outcome === 'declined').length,
    streak: streak?.current ?? 0,
    meanScore: mean(thisWeek),
    previousMeanScore: mean(lastWeek),
  }
}

