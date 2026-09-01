import { describe, expect, it } from 'vitest'
import {
  SIGNUP_REPS,
  planRepsUsedToday,
  refundingSignupRep,
  repsAllowedToday,
  repsRemainingToday,
  signupRepAvailable,
  signupRepSpentOn,
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

describe('the grant is not charged to the plan', () => {
  // The bug this describes was found in production on 1 Sep: an account spent
  // its sign-up rep during onboarding, bought Pro twenty minutes later and was
  // shown two reps rather than three. The grant had been taken out of the plan
  // it is supposed to sit on top of.
  it('leaves a plan bought after the grant untouched', () => {
    expect(
      repsRemainingToday({
        repsPerDay: 3,
        onboardingRepUsedAt: SPENT,
        usedToday: 1,
        signupSpentToday: true,
      }),
    ).toBe(3)
  })

  it('still counts the plan’s own reps against the plan', () => {
    const pro = { repsPerDay: 3, onboardingRepUsedAt: SPENT, signupSpentToday: true }
    expect(repsRemainingToday({ ...pro, usedToday: 2 })).toBe(2)
    expect(repsRemainingToday({ ...pro, usedToday: 4 })).toBe(0)
    // Past the ceiling is zero, never negative.
    expect(repsRemainingToday({ ...pro, usedToday: 99 })).toBe(0)
  })

  it('gives a free account one rep and then nothing', () => {
    const free = { repsPerDay: 0 }
    expect(
      repsRemainingToday({ ...free, onboardingRepUsedAt: null, usedToday: 0, signupSpentToday: false }),
    ).toBe(SIGNUP_REPS)
    expect(
      repsRemainingToday({ ...free, onboardingRepUsedAt: SPENT, usedToday: 1, signupSpentToday: true }),
    ).toBe(0)
  })

  it('adds the grant to a plan that has not spent it', () => {
    expect(
      repsRemainingToday({
        repsPerDay: 3,
        onboardingRepUsedAt: null,
        usedToday: 3,
        signupSpentToday: false,
      }),
    ).toBe(SIGNUP_REPS)
  })

  it('does not credit the grant twice once the day has rolled', () => {
    // Tomorrow: the counter is not today's, so `usedToday` is zero and the
    // stamp is on another day. The plan comes back; the grant does not.
    expect(
      repsRemainingToday({
        repsPerDay: 3,
        onboardingRepUsedAt: SPENT,
        usedToday: 0,
        signupSpentToday: false,
      }),
    ).toBe(3)
  })

  it('separates the two buckets inside one counter', () => {
    expect(planRepsUsedToday({ usedToday: 2, signupSpentToday: true })).toBe(1)
    expect(planRepsUsedToday({ usedToday: 2, signupSpentToday: false })).toBe(2)
    expect(planRepsUsedToday({ usedToday: 0, signupSpentToday: true })).toBe(0)
  })
})

describe('when the grant was spent', () => {
  it('reads the stamp in the account’s own timezone, not UTC', () => {
    // 20:30 UTC is already the next day in Colombo (+05:30). The counter is
    // kept in local days, so the stamp has to be compared in the same ones.
    const lateUtc = '2026-08-31T20:30:00.000Z'
    expect(signupRepSpentOn(lateUtc, 'Asia/Colombo', '2026-09-01')).toBe(true)
    expect(signupRepSpentOn(lateUtc, 'Asia/Colombo', '2026-08-31')).toBe(false)
    expect(signupRepSpentOn(lateUtc, 'UTC', '2026-08-31')).toBe(true)
  })

  it('is false for a grant that was never spent, or a stamp that is nonsense', () => {
    expect(signupRepSpentOn(null, 'UTC', '2026-09-01')).toBe(false)
    expect(signupRepSpentOn('not a date', 'UTC', '2026-09-01')).toBe(false)
  })
})

describe('which rep is being handed back', () => {
  it('gives back the grant when the counter is past the plan', () => {
    expect(refundingSignupRep({ repsPerDay: 0, usedToday: 1, signupSpentToday: true })).toBe(true)
    expect(refundingSignupRep({ repsPerDay: 3, usedToday: 4, signupSpentToday: true })).toBe(true)
  })

  it('gives back the grant when the plan arrived after it was spent', () => {
    // One rep in today's counter, three plan reps untouched: the only rep there
    // is to give back is the grant, even though the counter is under the plan.
    expect(refundingSignupRep({ repsPerDay: 3, usedToday: 1, signupSpentToday: true })).toBe(true)
  })

  it('gives back a plan rep when the plan is the thing that was spent', () => {
    expect(refundingSignupRep({ repsPerDay: 3, usedToday: 3, signupSpentToday: true })).toBe(false)
    expect(refundingSignupRep({ repsPerDay: 3, usedToday: 2, signupSpentToday: false })).toBe(false)
  })

  it('never gives back a grant that was not spent today', () => {
    expect(refundingSignupRep({ repsPerDay: 0, usedToday: 1, signupSpentToday: false })).toBe(false)
  })
})
