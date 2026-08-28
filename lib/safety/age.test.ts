/**
 * The age gate's arithmetic (§16.4).
 *
 * The only interesting case in an age check is the birthday itself, and it is
 * the one nobody can reproduce by hand — which is exactly why `checkAge` takes
 * today's date as an argument instead of reading the clock.
 *
 * The refusal messages are asserted too. They are the product's whole voice at
 * the one moment it is turning somebody away, and §16.6's register rules out
 * the tone that comes naturally there.
 */

import { describe, expect, it } from 'vitest'
import { ageOn, checkAge, latestEligibleDob, MIN_AGE } from './age'

const today = new Date(Date.UTC(2026, 7, 28))

describe('ageOn', () => {
  it('counts whole years', () => {
    expect(ageOn(new Date(Date.UTC(2000, 7, 28)), today)).toBe(26)
  })

  it('counts the birthday itself', () => {
    // Eighteen today is eighteen. Off by one here is a day of somebody being
    // told they are too young on their own birthday.
    expect(ageOn(new Date(Date.UTC(2008, 7, 28)), today)).toBe(18)
  })

  it('does not count the day before the birthday', () => {
    expect(ageOn(new Date(Date.UTC(2008, 7, 29)), today)).toBe(17)
  })

  it('handles a birthday later in the year', () => {
    expect(ageOn(new Date(Date.UTC(2008, 11, 1)), today)).toBe(17)
  })

  it('handles a birthday earlier in the year', () => {
    expect(ageOn(new Date(Date.UTC(2008, 0, 1)), today)).toBe(18)
  })
})

describe('checkAge', () => {
  it('accepts somebody who turned eighteen today', () => {
    const result = checkAge('2008-08-28', today)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.age).toBe(MIN_AGE)
  })

  it('refuses somebody one day short', () => {
    const result = checkAge('2008-08-29', today)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toBe('Nerve is 18+. Come back when you are.')
  })

  it('refuses without hinting at what would have worked', () => {
    // A gate that coaches you through it is not a gate.
    const result = checkAge('2015-01-01', today)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).not.toContain('2008')
      expect(result.message).not.toMatch(/older|earlier|before/i)
    }
  })

  it('refuses a date that does not exist', () => {
    // `new Date('2007-02-31')` silently becomes the third of March. A gate
    // that rolls a nonsense date forward is a gate you can type past.
    const result = checkAge('2007-02-31', today)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toBe('That is not a real date.')
  })

  it('accepts a real leap day', () => {
    expect(checkAge('2008-02-29', today).ok).toBe(true)
  })

  it('refuses a leap day in a year that had none', () => {
    expect(checkAge('2007-02-29', today).ok).toBe(false)
  })

  it('refuses a date in the future', () => {
    const result = checkAge('2030-01-01', today)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toBe('That date is in the future.')
  })

  it('refuses a mistyped year', () => {
    const result = checkAge('0208-08-28', today)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toBe('Check the year on that one.')
  })

  it('refuses an empty field with something to do about it', () => {
    const result = checkAge('', today)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toBe('Enter your date of birth to continue.')
  })

  it('refuses anything that is not an ISO date', () => {
    for (const value of ['28/08/2008', '2008-8-28', 'yesterday', '2008']) {
      expect(checkAge(value, today).ok).toBe(false)
    }
  })

  it('keeps the date it was given, trimmed', () => {
    const result = checkAge(' 2000-01-01 ', today)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.dob).toBe('2000-01-01')
  })
})

describe('latestEligibleDob', () => {
  it('is exactly the date that turns eighteen today', () => {
    expect(latestEligibleDob(today)).toBe('2008-08-28')
  })

  it('agrees with the gate, both sides of the boundary', () => {
    // The browser attribute and the server check have to draw the line in the
    // same place, or the picker refuses a date the gate would have accepted.
    const max = latestEligibleDob(today)
    expect(checkAge(max, today).ok).toBe(true)
    const dayAfter = new Date(Date.UTC(2008, 7, 29)).toISOString().slice(0, 10)
    expect(checkAge(dayAfter, today).ok).toBe(false)
  })
})
