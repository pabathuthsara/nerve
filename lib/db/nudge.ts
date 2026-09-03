import 'server-only'

/**
 * Sending the streak-at-risk email (RETENTION-AUDIT R6).
 *
 * Service role and hourly, exactly like `generateWeeklyReviews` beside it and
 * for the same reason: Vercel crons run in UTC and "evening" is the user's
 * evening, so the schedule asks each person's own clock rather than assuming
 * they share one.
 *
 * ── WHAT MAKES IT SEND ONCE ──────────────────────────────────────────────
 *
 * Two independent guards, because an unprompted email sent twice is worse than
 * one not sent at all.
 *
 *   the hour window   `nudgeDue` matches exactly one hourly run per local day
 *   `nudge_last`      one key in `profiles.ui_flags`, holding the last local
 *                     day this account was nudged
 *
 * The flag lives in `ui_flags` rather than in a table of its own, which is the
 * column's stated purpose — a note about what has been *displayed* — and the
 * boundary is the one `lib/data/ui-flags.ts` names: `ui_flags` is user-writable,
 * so the worst a user can do by clearing it is receive one duplicate. Anything
 * *earned* still goes to `unlocks`. One key, overwritten, rather than a growing
 * set of dates.
 *
 * ── NOTHING HERE THROWS ──────────────────────────────────────────────────
 *
 * A provider having a bad evening must not turn the cron into a 500 and a
 * retry, because a retry is a second email. Failures are counted and reported.
 * With no `RESEND_API_KEY` every send is a logged no-op (`lib/email/send.ts`),
 * which is a supported configuration: this whole path is dormant until the key
 * and `CRON_SECRET` are both set.
 */

import { supabaseAdmin } from './admin'
import { localDay } from '@/lib/data/day'
import { nudgeDue, streakNudgeEmail } from '@/lib/data/nudge'
import { sendEmail } from '@/lib/email/send'
import { siteUrl } from '@/lib/site/origin'

/** The `ui_flags` key holding the last local day this account was nudged. */
export const NUDGE_FLAG = 'nudge_last'

export interface NudgeResult {
  sent: number
  skipped: number
  failed: number
}

export async function sendStreakNudges(now = new Date()): Promise<NudgeResult> {
  const admin = supabaseAdmin()
  const { data: profiles } = await admin.from('profiles').select('id, timezone, ui_flags')

  const result: NudgeResult = { sent: 0, skipped: 0, failed: 0 }
  if (!profiles?.length) return result

  const { data: streaks } = await admin.from('streaks').select('user_id, current, last_active_on')
  const streakByUser = new Map((streaks ?? []).map((row) => [row.user_id, row]))

  for (const profile of profiles) {
    const zone = profile.timezone ?? null
    const today = localDay(now, zone)
    const streak = streakByUser.get(profile.id)
    const flags = (profile.ui_flags ?? {}) as Record<string, unknown>
    const lastNudgedOn = typeof flags[NUDGE_FLAG] === 'string' ? (flags[NUDGE_FLAG] as string) : null

    const due = nudgeDue({
      now,
      timeZone: zone,
      streak: streak?.current ?? 0,
      activeToday: streak?.last_active_on === today,
      lastNudgedOn,
      today,
    })
    if (!due) { result.skipped += 1; continue }

    // Stamped BEFORE the send, not after. If the write succeeds and the send
    // fails, one person misses one nudge; if the send succeeds and the stamp
    // fails, everybody in that hour gets a second copy on the next run. Those
    // are not comparable, so the recoverable failure is the one chosen.
    const { error: stampError } = await admin
      .from('profiles')
      .update({ ui_flags: { ...flags, [NUDGE_FLAG]: today } })
      .eq('id', profile.id)
    if (stampError) { result.failed += 1; continue }

    const address = await addressFor(profile.id)
    if (!address) { result.skipped += 1; continue }

    const { subject, body } = streakNudgeEmail({
      streak: streak?.current ?? 0,
      challengeTitle: await todaysChallenge(profile.id, today),
      trainUrl: siteUrl('/train'),
      settingsUrl: siteUrl('/profile/settings'),
    })

    const sent = await sendEmail({ to: address, subject, body })
    if (sent.ok) result.sent += 1
    else result.failed += 1
  }

  return result
}

/**
 * The address that can actually sign in and act on this.
 *
 * Same read as `lib/billing/notify.ts`, and the same reasoning: the account's
 * own address, never one carried on a payload.
 */
async function addressFor(userId: string): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin().auth.admin.getUserById(userId)
    if (error || !data.user?.email) return null
    return data.user.email
  } catch {
    return null
  }
}

/**
 * Today's field challenge, if one has been assigned.
 *
 * Named in the email because it is the cheapest thing that keeps a day — §09's
 * whole point is that the field costs no voice minutes, so the day the quota
 * runs out is still a day the habit can hold. Null is fine: the copy has a
 * version that does not name one.
 */
async function todaysChallenge(userId: string, today: string): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin()
      .from('field_assignments')
      .select('field_challenges (title)')
      .eq('user_id', userId)
      .eq('assigned_on', today)
      .maybeSingle()
    const challenge = data?.field_challenges as { title?: string } | null | undefined
    return challenge?.title ?? null
  } catch {
    return null
  }
}
