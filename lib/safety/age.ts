/**
 * The age gate (§16.4).
 *
 * *"18+ only. Age gate at sign-up. The category attracts teenagers and we are
 * not equipped for them."* That is the whole requirement, and the honest thing
 * to say about any age gate on the internet is that it is a question, not a
 * proof. What it buys is real anyway, and it is worth being precise about what:
 *
 *   1. We asked, before the account existed, and the answer is on the record.
 *      `profiles.age_confirmed_at` is the stamp, and it is stamped by the
 *      server after this function has agreed with the date — not by whatever
 *      the form posted.
 *   2. A thirteen-year-old has to lie to get in, deliberately, in a field that
 *      names the rule. That is the difference between a product that admits
 *      minors and one that excludes them, and it is the difference an app
 *      store, a merchant of record and a regulator all ask about.
 *   3. Terms clause 02 can say the account is closed if we learn otherwise,
 *      and mean it, because there is a date to compare against.
 *
 * A date of birth rather than a checkbox, for one reason: a tick box asking
 * "are you 18?" is answered by everybody and records nothing. A date is a
 * claim, and it is the claim clause 02 acts on.
 *
 * Pure, and dated by its caller. Age arithmetic that reads the clock cannot be
 * tested at the boundary, and the boundary — the birthday itself — is the only
 * interesting case in the file.
 */

/** §16.4. Not a dial. */
export const MIN_AGE = 18

/**
 * The oldest date this will accept, as an age.
 *
 * Not a judgement about anybody, and it does not gate the product: it catches
 * a mistyped year, which on a three-field date picker is the overwhelmingly
 * common way a birth date comes out wrong. 120 is past the record.
 */
export const MAX_AGE = 120

export type AgeCheck =
  | { ok: true; dob: string; age: number }
  | { ok: false; message: string }

/** Whole years elapsed, with the birthday counting on the day itself. */
export function ageOn(dob: Date, today: Date): number {
  let years = today.getUTCFullYear() - dob.getUTCFullYear()
  const month = today.getUTCMonth() - dob.getUTCMonth()
  // Not yet reached this year's birthday. The day-of-month comparison is what
  // makes the birthday itself count: on the day, neither branch fires.
  if (month < 0 || (month === 0 && today.getUTCDate() < dob.getUTCDate())) years -= 1
  return years
}

/**
 * `YYYY-MM-DD` in, a verdict out. The messages are the ones the form shows.
 *
 * Parsed by hand rather than by `new Date(value)`, which accepts a great deal
 * that is not a date and silently rolls over what it cannot fit — `2007-02-31`
 * becomes the third of March, which would let a nonsense date pass the gate on
 * a technicality.
 */
export function checkAge(value: string, today: Date): AgeCheck {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return { ok: false, message: 'Enter your date of birth to continue.' }

  const [, yearText = '', monthText = '', dayText = ''] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)

  const dob = new Date(Date.UTC(year, month - 1, day))
  // The roll-over check. If any component came back different, the date the
  // person typed does not exist.
  if (
    dob.getUTCFullYear() !== year
    || dob.getUTCMonth() !== month - 1
    || dob.getUTCDate() !== day
  ) {
    return { ok: false, message: 'That is not a real date.' }
  }

  const age = ageOn(dob, today)
  if (age < 0) return { ok: false, message: 'That date is in the future.' }
  if (age > MAX_AGE) return { ok: false, message: 'Check the year on that one.' }
  if (age < MIN_AGE) {
    // No shaming, no lecture, and no hint about what would have worked. The
    // sentence states the rule and stops (§16.6's register, and §01's).
    return { ok: false, message: `Nerve is ${MIN_AGE}+. Come back when you are.` }
  }

  return { ok: true, dob: value.trim(), age }
}

/**
 * The latest date of birth that passes, as `YYYY-MM-DD`.
 *
 * The `max` attribute on the date field, so a browser's own picker refuses
 * before the form is posted. Convenience only — `checkAge` is the gate, on the
 * server, and an attribute is a suggestion to whoever is holding the browser.
 */
export function latestEligibleDob(today: Date): string {
  const date = new Date(Date.UTC(
    today.getUTCFullYear() - MIN_AGE,
    today.getUTCMonth(),
    today.getUTCDate(),
  ))
  return date.toISOString().slice(0, 10)
}
