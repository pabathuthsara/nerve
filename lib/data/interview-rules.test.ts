import { describe, expect, it } from 'vitest'
import {
  INTERVIEW_WRAP_UP_MAX_MS,
  INTERVIEW_WRAP_UP_MIN_MS,
  creditRefundReason,
  interviewCreditable,
  interviewDurationMs,
  interviewOutcomeLine,
  interviewResultReading,
  interviewWrapUpMs,
  type EndedBy,
} from './interview-rules'
import { ROUND_TYPES } from './interview-credits'
import { INTERVIEW_THRESHOLD, WRAP_UP_MS } from './rep-rules'

describe('the interview wind-down', () => {
  it('is longer than the dating one on every round', () => {
    for (const round of ROUND_TYPES) {
      expect([round.id, interviewWrapUpMs(round.id) > WRAP_UP_MS]).toEqual([round.id, true])
    }
  })

  it('scales with the round and stays inside its bounds', () => {
    expect(interviewWrapUpMs('screener')).toBe(45_000)
    expect(interviewWrapUpMs('recruiter')).toBe(90_000)
    expect(interviewWrapUpMs('technical')).toBe(120_000)
    expect(interviewWrapUpMs('deep_technical')).toBe(120_000)
    for (const round of ROUND_TYPES) {
      const wrap = interviewWrapUpMs(round.id)
      expect(wrap).toBeGreaterThanOrEqual(INTERVIEW_WRAP_UP_MIN_MS)
      expect(wrap).toBeLessThanOrEqual(INTERVIEW_WRAP_UP_MAX_MS)
    }
  })

  it('always leaves the greater part of the round to the interview itself', () => {
    for (const round of ROUND_TYPES) {
      expect([round.id, interviewWrapUpMs(round.id) < interviewDurationMs(round.id) / 2])
        .toEqual([round.id, true])
    }
  })
})

describe('when a credit is owed back', () => {
  const cases: Array<[EndedBy, boolean, boolean]> = [
    // ended_by         heardUser  creditable
    ['error', true, true],
    ['error', false, true],
    ['user', false, true],
    ['cap', false, true],
    ['character', false, true],
    ['user', true, false],
    ['cap', true, false],
    ['character', true, false],
  ]

  it.each(cases)('%s / heard=%s', (endedBy, heardUser, creditable) => {
    expect(interviewCreditable({ endedBy, heardUser })).toBe(creditable)
  })

  it('does not refund a rep the user walked out of at eighteen minutes of twenty', () => {
    expect(interviewCreditable({ endedBy: 'user', heardUser: true })).toBe(false)
  })

  it('refunds a rep the provider killed at minute fourteen', () => {
    expect(interviewCreditable({ endedBy: 'error', heardUser: true })).toBe(true)
  })

  it('names the two reasons apart, because they have different fixes', () => {
    expect(creditRefundReason({ endedBy: 'error', heardUser: true })).toBe('provider')
    expect(creditRefundReason({ endedBy: 'cap', heardUser: false })).toBe('silent')
    expect(creditRefundReason({ endedBy: 'cap', heardUser: true })).toBeNull()
  })
})

describe('reading an interview result', () => {
  it('reads against the interview threshold and not the dating one', () => {
    expect(interviewResultReading({ decisionWarmth: 66, finalWarmth: 66, won: false }).threshold)
      .toBe(INTERVIEW_THRESHOLD)
  })

  it('clears at the threshold and not a point below', () => {
    expect(interviewResultReading({ decisionWarmth: 70, finalWarmth: 70, won: false }).cleared).toBe(true)
    expect(interviewResultReading({ decisionWarmth: 69.9, finalWarmth: 69.9, won: false }).cleared).toBe(false)
  })

  it('names a late surge, the same way the dating arm does', () => {
    const reading = interviewResultReading({ decisionWarmth: 66, finalWarmth: 74, won: false })
    expect(reading.lateSurge).toBe(true)
    expect(reading.nearMiss).toBe(true)
    expect(reading.close).toBe(4)
  })

  it('calls a four-point miss a near miss and a thirty-point one nothing of the kind', () => {
    expect(interviewResultReading({ decisionWarmth: 66, finalWarmth: 66, won: false }).nearMiss).toBe(true)
    expect(interviewResultReading({ decisionWarmth: 40, finalWarmth: 41, won: false }).nearMiss).toBe(false)
  })

  it('treats a recorded win as cleared however the meter finished', () => {
    expect(interviewResultReading({ decisionWarmth: 40, finalWarmth: 40, won: true }).cleared).toBe(true)
  })
})

describe('the outcome line', () => {
  const readings = [
    interviewResultReading({ decisionWarmth: 80, finalWarmth: 80, won: true }),
    interviewResultReading({ decisionWarmth: 66, finalWarmth: 74, won: false }),
    interviewResultReading({ decisionWarmth: 66, finalWarmth: 66, won: false }),
    interviewResultReading({ decisionWarmth: 30, finalWarmth: 30, won: false }),
  ]

  it('says something different on every branch', () => {
    const lines = readings.map(interviewOutcomeLine)
    expect(new Set(lines).size).toBe(lines.length)
  })

  /**
   * §11 and B7. "Number" is the dating rep's ending and this track does not
   * have one — a screen that borrowed the word would describe a thing that did
   * not happen.
   */
  it('never uses the word "number", on any branch', () => {
    for (const reading of readings) {
      expect(interviewOutcomeLine(reading).toLowerCase()).not.toContain('number')
    }
  })

  /** §07, and it matters more here: the outcome is worth zero points. */
  it('never claims a job, an offer or a hire', () => {
    for (const reading of readings) {
      const line = interviewOutcomeLine(reading).toLowerCase()
      for (const banned of ['job', 'offer', 'hired', 'hire']) expect(line).not.toContain(banned)
    }
  })
})
