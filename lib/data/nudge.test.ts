import { describe, expect, it } from 'vitest'

import { MIN_STREAK, NUDGE_HOUR, nudgeDue, streakNudgeEmail } from './nudge'

// 19:00 in Colombo is 13:30 UTC.
const evening = new Date('2026-09-03T13:30:00.000Z')
const zone = 'Asia/Colombo'

const due = (over: Partial<Parameters<typeof nudgeDue>[0]> = {}) => nudgeDue({
  now: evening,
  timeZone: zone,
  streak: 5,
  activeToday: false,
  lastNudgedOn: null,
  today: '2026-09-03',
  ...over,
})

describe('when a streak nudge is due', () => {
  it('fires in the evening where the user actually is', () => {
    expect(due()).toBe(true)
    // The same instant is mid-morning in London, and nobody there is nudged.
    expect(due({ timeZone: 'Europe/London' })).toBe(false)
  })

  it('is one hour wide, not open-ended', () => {
    // An `hour >= NUDGE_HOUR` condition would fire again at 20:00, 21:00 and
    // midnight, which is four emails for one missed day.
    const later = new Date('2026-09-03T15:30:00.000Z')
    expect(nudgeDue({ now: later, timeZone: zone, streak: 5, activeToday: false, lastNudgedOn: null, today: '2026-09-03' })).toBe(false)
    expect(NUDGE_HOUR).toBe(19)
  })

  it('never nudges a day that has already been claimed', () => {
    // A rep or an ask claims the day (§09). Telling somebody who trained at
    // breakfast that their streak is at risk is a lie.
    expect(due({ activeToday: true })).toBe(false)
  })

  it('leaves day one alone', () => {
    // There is no habit to protect yet, and this is the message most likely to
    // make somebody unsubscribe from everything.
    expect(due({ streak: MIN_STREAK - 1 })).toBe(false)
    expect(due({ streak: MIN_STREAK })).toBe(true)
  })

  it('sends at most one a day', () => {
    expect(due({ lastNudgedOn: '2026-09-03' })).toBe(false)
    expect(due({ lastNudgedOn: '2026-09-02' })).toBe(true)
  })
})

describe('what it says', () => {
  const mail = streakNudgeEmail({
    streak: 5,
    challengeTitle: 'Ask for a discount',
    trainUrl: 'https://www.hellonerve.com/train',
    settingsUrl: 'https://www.hellonerve.com/profile/settings',
  })

  it('names the day rather than what is about to be lost', () => {
    // §4 of the audit: no guilt copy, and nothing that punishes absence. The
    // product already costs the user courage.
    expect(mail.subject).toBe('Day 6 — nothing logged yet')
    expect(mail.body).toMatch(/^Day 6, and nothing is logged yet\./)
  })

  it('never threatens the streak or shames the absence', () => {
    for (const phrase of [/lose/i, /don't miss/i, /miss out/i, /you failed/i, /disappoint/i]) {
      expect(mail.body).not.toMatch(phrase)
    }
  })

  it('offers the cheapest thing that keeps the day', () => {
    expect(mail.body).toContain('Ask for a discount')
    expect(mail.body).toContain('costs no voice reps')
  })

  it('always carries a way to stop receiving it', () => {
    // An email about a habit that cannot be turned off is one that gets marked
    // as spam, and a spam complaint costs the domain the trial notice needs.
    expect(mail.body).toContain('Turn these off: https://www.hellonerve.com/profile/settings')
  })

  it('says something true when no challenge is assigned', () => {
    const bare = streakNudgeEmail({ streak: 2, challengeTitle: null, trainUrl: 'x', settingsUrl: 'y' })
    expect(bare.body).toContain('A logged field rep keeps the day')
  })
})
