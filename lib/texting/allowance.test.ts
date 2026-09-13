import { describe, expect, it } from 'vitest'
import {
  FREE_THREADS_PER_DAY,
  PAID_THREADS_PER_DAY,
  startedOnDay,
  textingAllowance,
  textingRefusal,
} from './allowance'

describe('the allowance', () => {
  it('free gets one real conversation a day', () => {
    expect(FREE_THREADS_PER_DAY).toBe(1)
    const fresh = textingAllowance({ threadsPerDay: FREE_THREADS_PER_DAY, startedToday: 0 })
    expect(fresh.mayStart).toBe(true)
    expect(fresh.remaining).toBe(1)
  })

  it('runs out after the day’s conversations, not during one', () => {
    const spent = textingAllowance({ threadsPerDay: 1, startedToday: 1 })
    expect(spent.mayStart).toBe(false)
    expect(spent.remaining).toBe(0)
  })

  it('paid is a runaway guard rather than a limit on a person', () => {
    const paid = textingAllowance({ threadsPerDay: PAID_THREADS_PER_DAY, startedToday: 12 })
    expect(paid.mayStart).toBe(true)
    expect(PAID_THREADS_PER_DAY).toBeGreaterThan(20)
  })

  it('never goes negative, whatever the counter says', () => {
    expect(textingAllowance({ threadsPerDay: 1, startedToday: 99 }).remaining).toBe(0)
    expect(textingAllowance({ threadsPerDay: -5, startedToday: 0 }).remaining).toBe(0)
  })

  it('a closed account may start nothing', () => {
    const closed = textingAllowance({ threadsPerDay: 0, startedToday: 0 })
    expect(closed.mayStart).toBe(false)
  })
})

describe('the refusal', () => {
  it('never sells and never names a price', () => {
    for (const perDay of [0, 1, 40]) {
      const sentence = textingRefusal(textingAllowance({ threadsPerDay: perDay, startedToday: perDay }))
      expect(sentence).not.toMatch(/\$|upgrade|pro\b|elite/i)
    }
  })

  it('says what happens next rather than what went wrong', () => {
    expect(textingRefusal(textingAllowance({ threadsPerDay: 1, startedToday: 1 }))).toMatch(/tomorrow/)
  })

  it('names the number when there is more than one', () => {
    expect(textingRefusal(textingAllowance({ threadsPerDay: 40, startedToday: 40 }))).toMatch(/40/)
  })
})

describe('the day boundary belongs to the person', () => {
  const now = new Date('2026-09-14T02:00:00Z')

  it('counts in the account’s own zone', () => {
    // `now` is 22:00 on the 13th in New York and 07:30 on the 14th in Colombo.
    // A thread opened at 17:00 UTC is therefore the same day for one of them
    // and yesterday for the other — which is the whole reason this is not UTC.
    expect(startedOnDay('2026-09-13T17:00:00Z', 'America/New_York', now)).toBe(true)
    expect(startedOnDay('2026-09-13T17:00:00Z', 'Asia/Colombo', now)).toBe(false)
  })

  it('falls back to the product’s own zone rather than UTC', () => {
    expect(startedOnDay(now.toISOString(), null, now)).toBe(true)
  })
})
