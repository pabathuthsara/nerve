/**
 * When a streak-at-risk email is due, and what it says (RETENTION-AUDIT R6).
 *
 * The audit's own words: nothing recalls the user. One cron (`purge-audio`),
 * one message (the trial charge notice), and the Sunday letter built, tested
 * and unscheduled. A streak counter is a scoreboard for people who already came
 * back; this is the organ that asks them to.
 *
 * ── THE RULES, AND WHY EACH ONE IS A RULE ────────────────────────────────
 *
 * **Evening, in their own clock.** The hourly cron asks each user's timezone,
 * for the same reason the Sunday letter does: a UTC schedule posts somebody's
 * evening nudge into their lunchtime.
 *
 * **Only a streak that exists.** `MIN_STREAK` is 2. A nudge on day one is a
 * product asking for a habit that has not started yet, and it is the message
 * most likely to make somebody unsubscribe from everything we ever send.
 *
 * **Never on a day already claimed.** A rep or a logged ask claims the day
 * (§09), and telling somebody who trained at breakfast that their streak is at
 * risk is a lie that costs the credibility of every later message.
 *
 * **Never guilt.** §4 of the audit rules out loss streaks, guilt copy and
 * anything that punishes absence, on the argument that this product already
 * costs the user courage — so the copy states a fact, names the cheapest thing
 * that keeps the day, and stops. It does not say "don't lose your streak", it
 * does not count what they are about to lose, and it never mentions anybody
 * else's numbers.
 *
 * Pure functions, tested, for the same reason `lib/email/trial.ts` is: what an
 * unprompted email to a user says should be arguable in a test file.
 */

import { localParts } from './weekly'

/** Evening where they are. Late enough to be true, early enough to act on. */
export const NUDGE_HOUR = 19

/** Below this there is no habit to protect, and the message is just mail. */
export const MIN_STREAK = 2

/**
 * Is a nudge due for this user right now?
 *
 * A one-hour window rather than "at or after", because the cron runs hourly and
 * an open-ended condition would fire it again at 20:00, 21:00 and midnight. The
 * `lastNudgedOn` check is the belt to that braces — see `sendStreakNudges`.
 */
export function nudgeDue(input: {
  now: Date
  timeZone: string | null
  streak: number
  /** Has a rep or an ask already claimed today? */
  activeToday: boolean
  /** The local day this user was last nudged, if ever. */
  lastNudgedOn: string | null
  /** Today, in their own clock. */
  today: string
}): boolean {
  if (input.activeToday) return false
  if (input.streak < MIN_STREAK) return false
  if (input.lastNudgedOn === input.today) return false
  const { hour } = localParts(input.now, input.timeZone)
  return hour === NUDGE_HOUR
}

export interface NudgeEmail {
  subject: string
  /** Plain text. Three sentences and a link, like every other message here. */
  body: string
}

/**
 * The message.
 *
 * It leads with the fact, offers the field ask second because that is the
 * cheapest thing that keeps a day, and ends with the way to stop hearing from
 * us — an email about a habit that cannot be turned off is an email that gets
 * marked as spam, and a spam complaint costs the sending domain that the trial
 * notice depends on.
 */
export function streakNudgeEmail(options: {
  streak: number
  /** Today's field challenge, when there is one assigned. */
  challengeTitle: string | null
  trainUrl: string
  settingsUrl: string
}): NudgeEmail {
  const day = options.streak + 1

  const second = options.challengeTitle
    ? `Today's field rep is "${options.challengeTitle}". Doing it and logging it keeps the day, and it costs no voice reps.`
    : 'A logged field rep keeps the day just as well as a voice rep does, and it costs no voice reps.'

  const lines = [
    `Day ${day}, and nothing is logged yet.`,
    '',
    second,
    '',
    `If today is not the day, that is fine — the reps you have already done do not go anywhere.`,
    '',
    options.trainUrl,
    '',
    `Turn these off: ${options.settingsUrl}`,
  ]

  return {
    subject: `Day ${day} — nothing logged yet`,
    body: lines.join('\n'),
  }
}
