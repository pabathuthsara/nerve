import { describe, expect, it } from 'vitest'
import { START_FOCUS_SUB, START_KICKER, START_SCENES, startScene } from './start-scenes'

describe('startScene (START-FIRST-SCREEN-PLAN B1)', () => {
  it('returns the authored line for each ad that has one', () => {
    expect(startScene('library')).toBe('Study group. She just sat down next to you.')
    expect(startScene('gaming')).toBe('Six hours on voice chat. Now it’s in person.')
  })

  it('reads the tag the way the beacon stores it', () => {
    expect(startScene('  Library ')).toBe(START_SCENES['library'])
  })

  it('keeps the kicker (null) for an unknown or missing tag', () => {
    for (const content of ['post-0927a', 'librar', '', null, undefined]) {
      expect(startScene(content)).toBeNull()
    }
  })

  it('never returns what every object inherits', () => {
    for (const content of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      expect(startScene(content)).toBeNull()
    }
  })

  it('authors every line short, non-empty and keyed the way a tag can be', () => {
    for (const [key, line] of Object.entries(START_SCENES)) {
      expect(key).toMatch(/^[a-z0-9._-]{1,40}$/)
      expect(line.trim().length).toBeGreaterThan(0)
      expect(line.length).toBeLessThanOrEqual(60)
    }
  })

  /**
   * D21 and rule 12: the first screen argues in copy only. No number that
   * could be a prevalence claim, no clinical word, British spellings caught
   * because the ads run in the US. "3 minutes" is the rep's length, a product
   * fact, and is the one digit the sub-line is allowed.
   */
  it('makes no statistic or clinical claim, in US spelling', () => {
    const copy = [START_KICKER, START_FOCUS_SUB, ...Object.values(START_SCENES)]
    for (const line of copy) {
      expect(line).not.toMatch(/%|percent|\bmost (men|people)\b|\d+ (in|out of) \d+/i)
      expect(line).not.toMatch(/anxiety|therapy|therapist|treat|cure|disorder|clinical|diagnos/i)
      expect(line).not.toMatch(/practise|colour|behaviour|apologis|recognis|realis/i)
    }
    expect(START_FOCUS_SUB.replace('3 minutes', '')).not.toMatch(/\d/)
    for (const line of Object.values(START_SCENES)) expect(line).not.toMatch(/\d/)
  })
})
