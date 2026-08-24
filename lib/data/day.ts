/**
 * Local days.
 *
 * The daily rep quota and the streak are both questions about a day boundary,
 * and a day boundary belongs to the person, not to the server. Counting in UTC
 * gives a Colombo user a quota that resets at 05:30 and a streak that breaks
 * at breakfast.
 *
 * Isomorphic on purpose: the Server Action that spends a rep and the pill that
 * counts down to the reset must agree about which day it is, and the only way
 * to guarantee that is one implementation.
 */

/** Fallback when a profile has no timezone yet. The product is built here. */
export const DEFAULT_TIMEZONE = 'Asia/Colombo'

function safeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return DEFAULT_TIMEZONE
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone })
    return timeZone
  } catch {
    // A timezone the runtime does not know is a timezone we cannot count in.
    return DEFAULT_TIMEZONE
  }
}

/** `YYYY-MM-DD` in the given zone — the shape `date` columns already use. */
export function localDay(date: Date, timeZone: string | null | undefined): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: safeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/** How far the zone is from UTC at this instant, in milliseconds. */
function offsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date)

  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? '0')

  // `hour` comes back as 24 at midnight under hour12: false in some runtimes.
  const asUtc = Date.UTC(read('year'), read('month') - 1, read('day'), read('hour') % 24, read('minute'), read('second'))
  return asUtc - date.getTime()
}

/**
 * The instant the local day rolls over. What the reps pill counts down to.
 *
 * Computed twice: the offset at "now" is not necessarily the offset at
 * midnight, and a country that shifts its clocks between the two would
 * otherwise be an hour out on exactly the night it matters.
 */
export function nextLocalMidnight(date: Date, timeZone: string | null | undefined): Date {
  const zone = safeZone(timeZone)
  const first = offsetMs(date, zone)
  const wall = new Date(date.getTime() + first)
  const midnightWall = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() + 1)
  const approximate = new Date(midnightWall - first)
  return new Date(midnightWall - offsetMs(approximate, zone))
}

/** Whole days between two `YYYY-MM-DD` strings. Used by the streak. */
export function daysBetween(from: string, to: string): number {
  const [fy = 0, fm = 1, fd = 1] = from.split('-').map(Number)
  const [ty = 0, tm = 1, td = 1] = to.split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000)
}

/**
 * A `YYYY-MM-DD` day, shifted by whole days.
 *
 * Pure string arithmetic on a calendar date, deliberately: these strings are
 * already in somebody's LOCAL day (`localDay` put them there), so re-entering a
 * timezone here would apply the offset twice. `Date.UTC` is used only because
 * it is the calendar arithmetic that does not drift across a DST boundary.
 */
export function shiftDays(day: string, delta: number): string {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, date + delta)).toISOString().slice(0, 10)
}
