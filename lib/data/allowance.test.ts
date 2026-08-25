import { describe, expect, it } from 'vitest'
import { DAY_ONE_REPS, isDayOne, repsAllowedToday } from './allowance'

describe('repsAllowedToday', () => {
  it('gives everybody three on the day they signed up', () => {
    expect(repsAllowedToday({ repsPerDay: 1, createdOn: '2026-08-25', today: '2026-08-25' }))
      .toBe(DAY_ONE_REPS)
  })

  it('goes back to the plan on day two', () => {
    expect(repsAllowedToday({ repsPerDay: 1, createdOn: '2026-08-25', today: '2026-08-26' }))
      .toBe(1)
  })

  it('is a floor, never a cap — a paid plan keeps its own number on day one', () => {
    expect(repsAllowedToday({ repsPerDay: 6, createdOn: '2026-08-25', today: '2026-08-25' }))
      .toBe(6)
  })

  it('falls back to the plan when the creation day is unknown', () => {
    expect(repsAllowedToday({ repsPerDay: 1, createdOn: null, today: '2026-08-25' })).toBe(1)
  })

  it('never returns a negative allowance', () => {
    expect(repsAllowedToday({ repsPerDay: -3, createdOn: null, today: '2026-08-25' })).toBe(0)
  })

  it('a zeroed plan still gets day one, because day one is the product', () => {
    expect(repsAllowedToday({ repsPerDay: 0, createdOn: '2026-08-25', today: '2026-08-25' }))
      .toBe(DAY_ONE_REPS)
  })
})

describe('isDayOne', () => {
  it('is true only on the account’s own first local day', () => {
    expect(isDayOne('2026-08-25', '2026-08-25')).toBe(true)
    expect(isDayOne('2026-08-24', '2026-08-25')).toBe(false)
    expect(isDayOne(null, '2026-08-25')).toBe(false)
  })
})
