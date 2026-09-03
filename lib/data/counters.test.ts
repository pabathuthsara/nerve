import { describe, expect, it } from 'vitest'

import { currentStreak, lifetimeLine, pressureMinutes } from './counters'
import { daysBetween } from './day'

describe('minutes under pressure', () => {
  it('never prints zero for a rep that happened', () => {
    // A fifty-second rep that reads `0 minutes` reads as a rep that did not
    // count, and a counter whose first increment is zero is not believed after.
    expect(pressureMinutes(50_000)).toBe(1)
    expect(pressureMinutes(180_000)).toBe(3)
    expect(pressureMinutes(1_140_000)).toBe(19)
  })

  it('keeps zero for genuinely nothing', () => {
    expect(pressureMinutes(0)).toBe(0)
    expect(pressureMinutes(-1)).toBe(0)
    expect(pressureMinutes(Number.NaN)).toBe(0)
  })
})

describe('the line on the loss screen', () => {
  it('is the sentence the audit asked for', () => {
    expect(lifetimeLine({ reps: 7, totalMs: 1_140_000 })).toBe('Rep 7 · 19 minutes under pressure')
  })

  it('says minute rather than minutes on the first one', () => {
    expect(lifetimeLine({ reps: 1, totalMs: 62_000 })).toBe('Rep 1 · 1 minute under pressure')
  })

  it('says nothing at all before there is anything to say', () => {
    // Silence, not `Rep 0`. The counter exists to be evidence of showing up.
    expect(lifetimeLine({ reps: 0, totalMs: 0 })).toBeNull()
  })
})

describe('the streak as it actually stands', () => {
  const read = (lastActiveOn: string | null, today: string, stored = 6) =>
    currentStreak({ stored, lastActiveOn, today, daysBetween })

  it('holds while today or yesterday counted', () => {
    expect(read('2026-09-03', '2026-09-03')).toBe(6)
    expect(read('2026-09-02', '2026-09-03')).toBe(6)
  })

  it('is zero after a day was missed', () => {
    // The R15 defect: `streaks.current` is only rewritten when somebody trains,
    // so a fortnight away still read as a live six-day streak on Train.
    expect(read('2026-09-01', '2026-09-03')).toBe(0)
    expect(read('2026-08-20', '2026-09-03')).toBe(0)
  })

  it('is zero for an account that has never trained', () => {
    expect(read(null, '2026-09-03')).toBe(0)
  })

  it('does not wipe a streak over a clock that moved backwards', () => {
    // A timezone change, or a device with the wrong date. Trusting the stored
    // number is the recoverable direction.
    expect(read('2026-09-04', '2026-09-03')).toBe(6)
  })
})
