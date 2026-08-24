/**
 * The Sunday review (§09, §11) — what it says, and when it is due.
 *
 * The fourth reason to come back. Two rules here are easy to get wrong and are
 * therefore pure and tested:
 *
 * **It is the user's Sunday, not the server's.** Vercel crons run in UTC. A
 * Colombo user's Sunday morning is Saturday evening in UTC, so the honest
 * implementation checks each user's local clock rather than assuming the cron's
 * own. That is the whole reason the job runs hourly rather than weekly.
 *
 * **The copy is written, never generated.** Templates chosen by what actually
 * happened, assembled from hand-authored sentences. A model writing the letter
 * would be a model writing "you were turned down seven times this week" without
 * knowing whether it was seven — and §09's example only lands because the
 * number is true.
 */

import { localDay } from './day'

/** Local hour at which the review becomes due on a Sunday. */
export const REVIEW_HOUR = 6

export interface WeekStats {
  reps: number
  wins: number
  asksMade: number
  rejections: number
  streak: number
  /** Mean composite this week, and the week before. Null with nothing graded. */
  meanScore: number | null
  previousMeanScore: number | null
}

export const EMPTY_WEEK: WeekStats = {
  reps: 0, wins: 0, asksMade: 0, rejections: 0, streak: 0,
  meanScore: null, previousMeanScore: null,
}

/** The parts of a local timestamp the schedule cares about. */
export function localParts(now: Date, timeZone: string | null): { weekday: number; hour: number } {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timeZone ?? 'UTC',
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  })
  const parts = formatter.formatToParts(now)
  const weekdayName = parts.find((part) => part.type === 'weekday')?.value ?? 'Mon'
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0')
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return { weekday: Math.max(0, days.indexOf(weekdayName)), hour }
}

/**
 * Is a review due for this user right now?
 *
 * Sunday, at or after `REVIEW_HOUR`, in their own timezone. The hourly cron
 * asks this of every user rather than assuming any of them share a clock.
 */
export function reviewDue(now: Date, timeZone: string | null): boolean {
  const { weekday, hour } = localParts(now, timeZone)
  return weekday === 0 && hour >= REVIEW_HOUR
}

/**
 * The Monday that starts the week being reviewed.
 *
 * On the Sunday the review fires, the week under review is the six days behind
 * it plus that morning — so the Monday six days back. Stored as the row's
 * natural key, which is what makes a second run the same week write nothing.
 */
export function weekStartFor(now: Date, timeZone: string | null): string {
  const local = localDay(now, timeZone)
  const [year = 0, month = 1, day = 1] = local.split('-').map(Number)
  const monday = new Date(Date.UTC(year, month - 1, day - 6))
  return monday.toISOString().slice(0, 10)
}

/**
 * The letter.
 *
 * Assembled from hand-written sentences chosen by what happened, in a fixed
 * order: what they did, what it cost them, and one line that is allowed to be
 * kind. It never congratulates a yes — §09 counts refusals, and a weekly note
 * that celebrates acceptances quietly turns the headline counter around.
 */
export function reviewCopy(stats: WeekStats): string {
  const lines: string[] = []

  // Opening: the week that happened.
  if (stats.reps === 0 && stats.asksMade === 0) {
    lines.push('Nothing this week. That happens, and the streak is not the point — the next rep is.')
    return lines.join(' ')
  }

  if (stats.reps > 0 && stats.asksMade > 0) {
    lines.push(`${count(stats.reps, 'rep')} in the gym and ${count(stats.asksMade, 'ask')} outside it.`)
  } else if (stats.reps > 0) {
    lines.push(`${count(stats.reps, 'rep')} this week, all of them in the gym.`)
  } else {
    lines.push(`${count(stats.asksMade, 'ask')} this week, all of them out in the world.`)
  }

  // The headline counter, and §09's own line when it fits.
  if (stats.rejections >= 7) {
    lines.push(`You were turned down ${stats.rejections} times this week. You're still fine.`)
  } else if (stats.rejections > 0) {
    lines.push(`${count(stats.rejections, 'refusal')} collected. That is the part that compounds.`)
  }

  // The trend, only when there is a real one to report.
  if (stats.meanScore !== null && stats.previousMeanScore !== null) {
    const delta = Math.round(stats.meanScore - stats.previousMeanScore)
    if (delta >= 4) lines.push(`Your scores moved ${delta} points up on last week.`)
    else if (delta <= -4) lines.push(`Your scores are ${Math.abs(delta)} points down on last week. One week is one week.`)
    else lines.push('Scores are flat on last week, which at this stage is fine.')
  } else if (stats.meanScore !== null) {
    lines.push(`You averaged ${Math.round(stats.meanScore)} across the reps you were graded on.`)
  }

  if (stats.streak >= 7) lines.push(`${stats.streak} days without a gap.`)

  return lines.join(' ')
}

function count(value: number, noun: string): string {
  const words = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
  const word = value <= 10 ? words[value] ?? String(value) : String(value)
  return `${word} ${noun}${value === 1 ? '' : 's'}`
}
