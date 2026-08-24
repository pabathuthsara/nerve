import { describe, expect, it } from 'vitest'

import { EMPTY_WEEK, REVIEW_HOUR, reviewCopy, reviewDue, weekStartFor, type WeekStats } from './weekly'

const COLOMBO = 'Asia/Colombo'
const LONDON = 'Europe/London'

/** Sunday 06:30 in Colombo. The same instant is Sunday 01:00 UTC. */
const SUNDAY_MORNING_COLOMBO = new Date('2026-08-23T01:00:00.000Z')

describe('when a review is due', () => {
  it('reads the hour in each user\'s own zone', () => {
    // One instant, three answers. Colombo has had breakfast; London and UTC
    // are on the same Sunday but hours behind it, so the review is not theirs
    // yet. A cron that used its own clock would send all three at once.
    expect(reviewDue(SUNDAY_MORNING_COLOMBO, COLOMBO)).toBe(true)
    expect(reviewDue(SUNDAY_MORNING_COLOMBO, LONDON)).toBe(false)
    expect(reviewDue(SUNDAY_MORNING_COLOMBO, 'UTC')).toBe(false)
  })

  it('reads the DAY in each user\'s own zone too', () => {
    // THE RULE THIS EXISTS FOR. Sunday 19:00 UTC is already Monday half past
    // midnight in Colombo. A job that trusted the server's weekday would post
    // a Sunday letter into somebody's Monday.
    const sundayEveningUtc = new Date('2026-08-23T19:00:00.000Z')
    expect(reviewDue(sundayEveningUtc, 'UTC')).toBe(true)
    expect(reviewDue(sundayEveningUtc, COLOMBO)).toBe(false)
  })

  it('waits until the morning', () => {
    // Sunday 00:30 Colombo is Saturday 19:00 UTC. Sunday, but not yet six.
    const tooEarly = new Date('2026-08-22T19:00:00.000Z')
    expect(reviewDue(tooEarly, COLOMBO)).toBe(false)
    expect(REVIEW_HOUR).toBe(6)
  })

  it('stays due for the rest of Sunday, so a missed hour is not a missed week', () => {
    // 14:00 UTC is 19:30 Sunday in Colombo — still their Sunday.
    expect(reviewDue(new Date('2026-08-23T14:00:00.000Z'), COLOMBO)).toBe(true)
  })

  it('is not due on a Monday', () => {
    expect(reviewDue(new Date('2026-08-24T04:00:00.000Z'), COLOMBO)).toBe(false)
  })
})

describe('which week is being reviewed', () => {
  it('is the Monday six days before the Sunday it fires on', () => {
    expect(weekStartFor(SUNDAY_MORNING_COLOMBO, COLOMBO)).toBe('2026-08-17')
  })

  it('is stable across the whole of that Sunday, so a second run writes nothing', () => {
    const morning = weekStartFor(SUNDAY_MORNING_COLOMBO, COLOMBO)
    const evening = weekStartFor(new Date('2026-08-23T14:00:00.000Z'), COLOMBO)
    expect(evening).toBe(morning)
  })
})

describe('the copy', () => {
  const week = (over: Partial<WeekStats>): WeekStats => ({ ...EMPTY_WEEK, ...over })

  it('uses §09\'s own line when the number fits', () => {
    const copy = reviewCopy(week({ asksMade: 9, rejections: 7 }))
    expect(copy).toContain("You were turned down 7 times this week. You're still fine.")
  })

  it('keeps the real number rather than a template', () => {
    // The line only lands because the number is true. A model writing this
    // would be writing "seven" without knowing whether it was seven.
    expect(reviewCopy(week({ asksMade: 12, rejections: 11 }))).toContain('11 times')
  })

  it('never congratulates a yes', () => {
    // §09 counts refusals. A weekly note that celebrates acceptances quietly
    // turns the headline counter around.
    const copy = reviewCopy(week({ reps: 4, wins: 3, asksMade: 5, rejections: 1 }))
    expect(copy.toLowerCase()).not.toMatch(/\b(yes|accepted|success|won)\b/)
  })

  it('has something honest to say about an empty week', () => {
    const copy = reviewCopy(EMPTY_WEEK)
    expect(copy).toContain('Nothing this week')
    expect(copy).not.toContain('undefined')
    expect(copy).not.toContain('NaN')
  })

  it('reports a fall as readily as a rise', () => {
    const down = reviewCopy(week({ reps: 3, meanScore: 55, previousMeanScore: 70 }))
    expect(down).toContain('15 points down')
    const up = reviewCopy(week({ reps: 3, meanScore: 75, previousMeanScore: 60 }))
    expect(up).toContain('15 points up')
  })

  it('does not invent a trend from one week of data', () => {
    const copy = reviewCopy(week({ reps: 3, meanScore: 71, previousMeanScore: null }))
    expect(copy).toContain('averaged 71')
    expect(copy).not.toContain('last week')
  })

  it('reads as sentences, never as a slot-filled template', () => {
    for (const stats of [
      week({ reps: 1, asksMade: 1, rejections: 1 }),
      week({ reps: 5, asksMade: 0 }),
      week({ reps: 0, asksMade: 3, rejections: 2, streak: 9 }),
    ]) {
      const copy = reviewCopy(stats)
      expect(copy).not.toMatch(/\s{2,}|\bundefined\b|\bNaN\b|\bnull\b/)
      expect(copy.endsWith('.')).toBe(true)
    }
  })
})
