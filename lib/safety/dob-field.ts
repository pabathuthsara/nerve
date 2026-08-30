/**
 * What a keystroke does to a date-of-birth field (§16.4).
 *
 * The gate itself is `checkAge` in `age.ts` and it stays there. This is the
 * typing: which digit lands in which box, when the caret moves on by itself,
 * what an arrow key steps to, and what a pasted string means. It lives here
 * rather than in the component for the same reason the rep rules do — it is
 * all pure, all edge cases, and none of it is testable through a DOM the test
 * runner does not have.
 *
 * Three boxes rather than one `<input type="date">`, for two reasons:
 *
 *   1. The browser's own picker is a month-by-month calendar. A birth date is
 *      thirty years back, and nobody arrows through three hundred and sixty
 *      months. Every real date-of-birth field on the internet is typed.
 *   2. It cannot be styled. Chrome renders its panel in its own light theme
 *      and its own type, in the middle of a screen that is neither.
 *
 * The month is a name — APR, not 04. `12/06/2008` means two different days
 * depending on where the reader grew up, and a field that decides whether an
 * account may exist is the wrong place to be guessing. Names cost nothing and
 * the digits still work: typing `0` `4` shows APR.
 */

import { MAX_AGE } from './age'

export type Segment = 'day' | 'month' | 'year'

export interface DobParts {
  day: string
  month: string
  year: string
}

export const EMPTY_PARTS: DobParts = { day: '', month: '', year: '' }

/** In the boxes. */
export const MONTH_LABELS = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
] as const

/** In the line underneath, where there is room to say it properly. */
export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

/** How many characters each box holds when it is full. */
export const SEGMENT_LENGTH: Record<Segment, number> = { day: 2, month: 2, year: 4 }

/**
 * Where the year arrows start from on an empty box.
 *
 * Deliberately not `MIN_AGE`. The first press of an arrow key should not be a
 * wink at the answer — `AgeStep` refuses once and offers no second attempt,
 * and a wheel that opens on the youngest eligible year would undo that. Thirty
 * says nothing about the rule.
 */
const ANCHOR_AGE = 30

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** 1-based wrap, so stepping down from January lands on December. */
function wrap(value: number, max: number): number {
  return ((value - 1 + max) % max + max) % max + 1
}

export interface YearBounds {
  min: number
  max: number
  anchor: number
}

export function yearBounds(today: Date): YearBounds {
  const year = today.getUTCFullYear()
  return { min: year - MAX_AGE, max: year, anchor: year - ANCHOR_AGE }
}

export interface TypeResult {
  value: string
  /** Whether the box can hold nothing more, so the caret should move on. */
  advance: boolean
}

/**
 * A digit into a two-character box.
 *
 * The whole trick is knowing when a box is finished, and the answer is not
 * "when it has two characters" — it is "when a second digit could not change
 * the answer". A `4` in the day box is the fourth and nothing else, so it
 * becomes `04` and the caret leaves. A `1` might be the first, the eleventh or
 * the nineteenth, so it waits.
 *
 * A digit that cannot follow what is already there starts over rather than
 * being dropped: `3` then `5` is somebody who meant the fifth, and refusing
 * the keystroke would leave them staring at a `3` they have to clear.
 */
function typeIntoPair(current: string, digit: string, max: number): TypeResult {
  const typed = Number(digit)

  if (current.length === 1) {
    const combined = Number(current) * 10 + typed
    if (combined >= 1 && combined <= max) return { value: pad(combined), advance: true }
  }

  if (typed === 0) return { value: '0', advance: false }
  if (typed * 10 > max) return { value: pad(typed), advance: true }
  return { value: String(typed), advance: false }
}

export function typeDigit(segment: Segment, current: string, digit: string): TypeResult {
  if (!/^\d$/.test(digit)) return { value: current, advance: false }
  if (segment === 'year') {
    // A fifth digit is somebody retyping the year, not appending to it.
    const base = current.length >= SEGMENT_LENGTH.year ? '' : current
    return { value: base + digit, advance: false }
  }
  return typeIntoPair(current, digit, segment === 'day' ? 31 : 12)
}

/**
 * Letters into the month box, against the prefix already typed.
 *
 * `MAR` is unambiguous at three characters, `J` is three different months, and
 * the box should not guess. It resolves the moment exactly one month is still
 * standing, which is why `ap` is April and `a` is not yet anything.
 *
 * Returns the running prefix as well as the value, because "the letters so far"
 * is state the caller has to keep — `ju` is only ambiguous if we remember `j`.
 */
export interface LetterResult extends TypeResult {
  prefix: string
}

export function typeLetter(prefix: string, letter: string): LetterResult {
  if (!/^[a-z]$/i.test(letter)) return { value: '', prefix, advance: false }

  const next = (prefix + letter).toLowerCase()
  let matches = MONTH_NAMES.filter((month) => month.toLowerCase().startsWith(next))

  // Nothing starts with this, so the letter is the beginning of a new attempt
  // rather than a typo to be swallowed.
  if (matches.length === 0) {
    const restart = letter.toLowerCase()
    matches = MONTH_NAMES.filter((month) => month.toLowerCase().startsWith(restart))
    if (matches.length === 0) return { value: '', prefix: '', advance: false }
    return resolve(matches, restart)
  }
  return resolve(matches, next)
}

function resolve(matches: readonly string[], prefix: string): LetterResult {
  if (matches.length > 1) return { value: '', prefix, advance: false }
  const index = MONTH_NAMES.indexOf(matches[0] as (typeof MONTH_NAMES)[number])
  return { value: pad(index + 1), prefix: '', advance: true }
}

/**
 * An arrow key. Day and month wrap; the year clamps, because a year that
 * rolls from 1906 round to this one is a year somebody has to chase back.
 */
export function stepSegment(segment: Segment, current: string, delta: number, bounds: YearBounds): string {
  if (segment === 'year') {
    if (current.length !== SEGMENT_LENGTH.year) return String(bounds.anchor)
    return String(clamp(Number(current) + delta, bounds.min, bounds.max))
  }

  const max = segment === 'day' ? 31 : 12
  const value = Number(current)
  if (!current || !Number.isFinite(value) || value < 1) return pad(delta > 0 ? 1 : max)
  return pad(wrap(value + delta, max))
}

/** The three boxes as `YYYY-MM-DD`, or nothing while any of them is unfinished. */
export function composeDob(parts: DobParts): string {
  const full = (Object.keys(SEGMENT_LENGTH) as Segment[]).every(
    (segment) => parts[segment].length === SEGMENT_LENGTH[segment],
  )
  if (!full) return ''
  return `${parts.year}-${parts.month}-${parts.day}`
}

/** `YYYY-MM-DD` back into the three boxes, for a field that opens with a value. */
export function splitDob(value: string): DobParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return EMPTY_PARTS
  const [, year = '', month = '', day = ''] = match
  return { day, month, year }
}

/**
 * A pasted date, in the shapes people actually have on their clipboard.
 *
 * The four-digit group is the year wherever it sits, which settles ISO against
 * everything else without asking. Between the two remaining numbers we prefer
 * day-then-month and let an impossible month overrule us — `04/23/1996` has to
 * be April the twenty-third, because there is no twenty-third month.
 */
export function parsePastedDate(text: string): DobParts | null {
  const groups = text.trim().match(/\d+/g)
  if (!groups || groups.length !== 3) return null

  const [first = '', second = '', third = ''] = groups
  let day: string
  let month: string
  let year: string

  if (first.length === 4) {
    year = first
    month = second
    day = third
  } else if (third.length === 4) {
    year = third
    if (Number(first) > 12 && Number(second) <= 12) {
      day = first
      month = second
    } else if (Number(second) > 12 && Number(first) <= 12) {
      month = first
      day = second
    } else {
      day = first
      month = second
    }
  } else {
    return null
  }

  if (day.length > 2 || month.length > 2) return null
  const parts = { day: pad(Number(day)), month: pad(Number(month)), year }
  return describeDob(parts) ? parts : null
}

/**
 * The line under the field: `23 April 1996`, once the date is real.
 *
 * The date and nothing else. It is tempting to put the age beside it — it is
 * the number the screen is actually about — but a field that counts your age
 * back at you while you type is a field you can spin until it says a number
 * you like, and `AgeStep` is explicit that the gate does not coach. Echoing
 * the date does the one job worth doing: confirming that the `04` you typed
 * was April, in a product whose users write dates three different ways.
 */
export function describeDob(parts: DobParts): string | null {
  const value = composeDob(parts)
  if (!value) return null

  const year = Number(parts.year)
  const month = Number(parts.month)
  const day = Number(parts.day)
  if (month < 1 || month > 12 || day < 1) return null

  // The roll-over check, the same one `checkAge` runs: `2007-02-31` is not a
  // date, and a browser would happily call it the third of March.
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return null

  return `${day} ${MONTH_NAMES[month - 1]} ${year}`
}

/**
 * The whole field as one value, and a keystroke as a transition on it.
 *
 * The caret is part of the state rather than something the component tracks
 * separately, because "which box does the next character go into" is answered
 * by the character before it — type `2` `3` into the day box and the `0` `4`
 * that follows belongs to the month. Threading it through here is what lets
 * somebody type `23041996` straight through without touching a separator, and
 * what lets a phone autofilling the whole date in one event land it in three
 * boxes instead of overwriting one of them three times.
 */
export interface EntryState {
  parts: DobParts
  /** Letters typed into the month box so far. `ju` is not yet a month. */
  prefix: string
  /** The box the next character goes into. */
  cursor: Segment
}

export function emptyEntry(cursor: Segment = 'day'): EntryState {
  return { parts: EMPTY_PARTS, prefix: '', cursor }
}

/** Left to right, which is the order the boxes are read and typed in. */
export const SEGMENT_ORDER: readonly Segment[] = ['day', 'month', 'year']

/** One box along, or the last box if there is nowhere further to go. */
export function nextSegment(segment: Segment): Segment | null {
  return SEGMENT_ORDER[SEGMENT_ORDER.indexOf(segment) + 1] ?? null
}

export function previousSegment(segment: Segment): Segment | null {
  const index = SEGMENT_ORDER.indexOf(segment)
  return index > 0 ? SEGMENT_ORDER[index - 1] as Segment : null
}

/** Characters into the field, from wherever the caret is. */
export function typeInto(state: EntryState, characters: string): EntryState {
  let next = state

  for (const character of characters) {
    const { cursor } = next

    if (cursor === 'month' && /[a-z]/i.test(character)) {
      const result = typeLetter(next.prefix, character)
      next = { ...next, prefix: result.prefix }
      if (!result.value) continue
      next = {
        parts: { ...next.parts, month: result.value },
        prefix: '',
        cursor: result.advance ? nextSegment(cursor) ?? cursor : cursor,
      }
      continue
    }

    const result = typeDigit(cursor, next.parts[cursor], character)
    next = {
      parts: { ...next.parts, [cursor]: result.value },
      prefix: cursor === 'month' ? '' : next.prefix,
      cursor: result.advance ? nextSegment(cursor) ?? cursor : cursor,
    }
  }

  return next
}

/* ------------------------------------------------------------------ *
 * The wheel
 * ------------------------------------------------------------------ *
 *
 * A scroll wheel needs one thing the typed boxes never did: a list of the
 * values each column may show. February has 29 days in 1996 and 28 in 1997,
 * so the day column is not a constant — and a wheel that lets you settle on a
 * 31st of February is a wheel that hands `checkAge` a date it will refuse for
 * reasons the person cannot see.
 */

/** Days in a month, with the leap rule. Month is 1-based. */
export function daysInMonth(month: number, year: number): number {
  if (month < 1 || month > 12) return 31
  // Day zero of the next month is the last day of this one, and `Date.UTC`
  // does that arithmetic including the leap rule.
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/**
 * The day, pulled back inside the month it now sits in.
 *
 * Spin the year off a leap February while the 29th is selected and the date
 * stops existing. The wheel clamps rather than clearing, because clearing
 * loses an answer the person already gave.
 */
export function clampDay(parts: DobParts): DobParts {
  const month = Number(parts.month)
  const year = Number(parts.year)
  const day = Number(parts.day)
  if (!month || !year || !day) return parts

  const last = daysInMonth(month, year)
  if (day <= last) return parts
  return { ...parts, day: String(last).padStart(2, '0') }
}

/** The rows of one column, as the strings the boxes already hold. */
export function segmentOptions(segment: Segment, parts: DobParts, bounds: YearBounds): string[] {
  if (segment === 'year') {
    const years: string[] = []
    for (let year = bounds.max; year >= bounds.min; year -= 1) years.push(String(year))
    return years
  }

  if (segment === 'month') {
    return MONTH_LABELS.map((_, index) => String(index + 1).padStart(2, '0'))
  }

  // The day column depends on the other two, which is the whole reason this
  // takes `parts`. With no month chosen yet, 31 is the honest maximum.
  const month = Number(parts.month)
  const year = Number(parts.year) || 2000
  const last = month ? daysInMonth(month, year) : 31
  return Array.from({ length: last }, (_, index) => String(index + 1).padStart(2, '0'))
}

/** What a box shows when it is empty. */
export const PLACEHOLDER: Record<Segment, string> = { day: 'DD', month: 'MMM', year: 'YYYY' }

/** What a filled month box shows. */
export function monthLabel(month: string): string {
  const index = Number(month) - 1
  return MONTH_LABELS[index] ?? month
}
