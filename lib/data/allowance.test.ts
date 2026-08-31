import { describe, expect, it } from 'vitest'
import {
  SIGNUP_REPS,
  repsAllowedToday,
  signupRepAvailable,
  spendingSignupRep,
  voiceRefusal,
  voicelessPlan,
} from './allowance'

const SPENT = '2026-08-31T09:00:00.000Z'

describe('the sign-up rep', () => {
  it('gives a free account exactly one voice rep, ever', () => {
    // The whole shape of the change. Free grants no reps a day, so the sign-up
    // rep is the only voice a free account will ever get without paying.
    expect(repsAllowedToday({ repsPerDay: 0, onboardingRepUsedAt: null })).toBe(SIGNUP_REPS)
    expect(repsAllowedToday({ repsPerDay: 0, onboardingRepUsedAt: SPENT })).toBe(0)
  })

  it('does not come back tomorrow, which is what makes it not a quota', () => {
    // There is no day argument in this function any more, deliberately. The old
    // day-one grant of three reps keyed off the account's local day; a once-ever
    // grant that read a date would come back every time the date changed.
    const spent = { repsPerDay: 0, onboardingRepUsedAt: SPENT }
    expect(repsAllowedToday(spent)).toBe(0)
    expect(repsAllowedToday(spent)).toBe(0)
  })

  it('sits on top of a paid plan rather than replacing it', () => {
    // Additive, not a floor. Somebody who buys Pro on the day they sign up gets
    // the three reps they paid for and the one they were given.
    expect(repsAllowedToday({ repsPerDay: 3, onboardingRepUsedAt: null })).toBe(4)
    expect(repsAllowedToday({ repsPerDay: 3, onboardingRepUsedAt: SPENT })).toBe(3)
    expect(repsAllowedToday({ repsPerDay: 6, onboardingRepUsedAt: SPENT })).toBe(6)
  })

  it('never goes negative on a nonsense plan number', () => {
    expect(repsAllowedToday({ repsPerDay: -4, onboardingRepUsedAt: SPENT })).toBe(0)
    expect(repsAllowedToday({ repsPerDay: -4, onboardingRepUsedAt: null })).toBe(SIGNUP_REPS)
  })

  it('is unspent exactly while the stamp is null', () => {
    expect(signupRepAvailable(null)).toBe(true)
    expect(signupRepAvailable(SPENT)).toBe(false)
  })
})

describe('which rep is being spent', () => {
  it('spends the plan first and the grant last', () => {
    // The ordering is what lets `refundRep` decide, from the counter alone,
    // whether the rep it is handing back was the one-off one.
    const pro = { repsPerDay: 3, onboardingRepUsedAt: null }
    expect(spendingSignupRep({ ...pro, usedToday: 0 })).toBe(false)
    expect(spendingSignupRep({ ...pro, usedToday: 2 })).toBe(false)
    expect(spendingSignupRep({ ...pro, usedToday: 3 })).toBe(true)
  })

  it('makes a free account’s first rep the sign-up one', () => {
    expect(spendingSignupRep({ repsPerDay: 0, onboardingRepUsedAt: null, usedToday: 0 })).toBe(true)
  })

  it('never spends a grant that is already gone', () => {
    expect(spendingSignupRep({ repsPerDay: 0, onboardingRepUsedAt: SPENT, usedToday: 0 })).toBe(false)
    expect(spendingSignupRep({ repsPerDay: 3, onboardingRepUsedAt: SPENT, usedToday: 9 })).toBe(false)
  })
})

describe('the refusal', () => {
  it('tells a paying account to come back tomorrow', () => {
    const refusal = voiceRefusal(3)
    expect(refusal.kind).toBe('daily')
    expect(refusal.message).toContain('today')
  })

  it('does not tell a free account to wait for a midnight that changes nothing', () => {
    // The load-bearing one. A free account's reps do not reset, so the daily
    // sentence would be a lie AND would hide the only thing they can do.
    const refusal = voiceRefusal(0)
    expect(refusal.kind).toBe('upgrade')
    expect(refusal.message).not.toContain('today')
    expect(refusal.message).not.toContain('tomorrow')
  })

  it('keeps the free tier’s promise in the refusal itself', () => {
    // §14: running out must never read as losing the account. The field loop,
    // the streak and text mode are all still there, and the sentence says so.
    expect(voiceRefusal(0).message).toContain('stays open')
  })

  it('knows which plans have voice in them', () => {
    expect(voicelessPlan(0)).toBe(true)
    expect(voicelessPlan(1)).toBe(false)
    expect(voicelessPlan(-1)).toBe(true)
  })
})
