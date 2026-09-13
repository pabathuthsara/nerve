import { describe, expect, it } from 'vitest'
import { dripReference, dripsOwed, grantWindowMs } from './drip'
import { OFFERS, offerFor, type PlanOffer } from '@/lib/site/plans'

const YEARLY = offerFor('pro', 'yearly') as PlanOffer
const MONTHLY = offerFor('pro', 'monthly') as PlanOffer
const WEEKLY = offerFor('pro', 'weekly') as PlanOffer

const START = '2026-09-13T00:00:00.000Z'
const day = (n: number) => new Date(Date.parse(START) + n * 24 * 60 * 60 * 1000)

describe('the offers this applies to at all', () => {
  it('drips only where a period holds more than one grant', () => {
    expect(YEARLY.creditGrants).toBe(12)
    expect(MONTHLY.creditGrants).toBe(1)
    expect(WEEKLY.creditGrants).toBe(1)
  })

  /**
   * The guard rule 19 asks for: a period added above the month must not start
   * dripping by accident, and one that bills monthly or faster must keep
   * reaching exactly the code it reaches today.
   */
  it('returns nothing for every single-grant offer, whatever the elapsed time', () => {
    for (const offer of OFFERS.filter((entry) => entry.creditGrants === 1)) {
      expect(dripsOwed({ offer, periodStart: START, now: day(400) })).toEqual([])
    }
  })

  it('holds the cadence every surface prints — a drip is a month', () => {
    // `creditCadenceNoun` writes "month" off `creditGrants > 1`. This is the
    // arithmetic that has to agree with that word.
    expect(Math.round(grantWindowMs(YEARLY) / (24 * 60 * 60 * 1000))).toBe(30)
  })
})

describe('dripsOwed', () => {
  it('owes nothing on the day the subscription starts', () => {
    expect(dripsOwed({ offer: YEARLY, periodStart: START, now: day(0) })).toEqual([])
  })

  /**
   * The trial is the case this whole design exists for. Seven days in, the
   * account holds the webhook's two credits and not one more — so a $0 trial
   * authorisation cannot walk away with a year of interviews, and the daily
   * spend ceiling is still 300c + 180c rather than 300c + 2,160c.
   */
  it('owes nothing across a seven-day trial', () => {
    expect(dripsOwed({ offer: YEARLY, periodStart: START, now: day(7) })).toEqual([])
  })

  it('never returns index 0, which is the webhook grant', () => {
    const drips = dripsOwed({ offer: YEARLY, periodStart: START, now: day(365) })
    expect(drips.map((drip) => drip.index)).not.toContain(0)
    expect(drips[0]?.index).toBe(1)
  })

  it('owes one month once a month has fully elapsed', () => {
    expect(dripsOwed({ offer: YEARLY, periodStart: START, now: day(29) })).toEqual([])
    expect(dripsOwed({ offer: YEARLY, periodStart: START, now: day(31) }).map((d) => d.index))
      .toEqual([1])
  })

  /**
   * Self-healing after a missed run. A cron that granted only the newest slot
   * would lose a month permanently to one bad night, and the customer has paid
   * for it.
   */
  it('names every slot the period has reached, not just the newest', () => {
    const drips = dripsOwed({ offer: YEARLY, periodStart: START, now: day(200) })
    expect(drips.map((drip) => drip.index)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('stops at the number of grants the period actually holds', () => {
    const full = dripsOwed({ offer: YEARLY, periodStart: START, now: day(365) })
    expect(full).toHaveLength(11)
    expect(full[full.length - 1]?.index).toBe(11)
  })

  /**
   * A subscription whose renewal event never arrived must not keep minting off
   * a stale anchor — eleven is the ceiling however long the clock runs.
   */
  it('does not keep minting past the end of a period that never renewed', () => {
    const late = dripsOwed({ offer: YEARLY, periodStart: START, now: day(3000) })
    expect(late).toHaveLength(11)
  })

  it('totals the year at what the offer promises, webhook grant included', () => {
    const drips = dripsOwed({ offer: YEARLY, periodStart: START, now: day(365) })
    const granted = (drips.length + 1) * YEARLY.interviewCredits
    expect(granted).toBe(YEARLY.interviewCredits * YEARLY.creditGrants)
    expect(granted).toBe(24)
  })

  it('expires each drip when the next one lands, so nothing accumulates', () => {
    const drips = dripsOwed({ offer: YEARLY, periodStart: START, now: day(200) })
    for (const drip of drips) {
      const life = Date.parse(drip.expiresAt) - Date.parse(START)
      expect(Math.round(life / grantWindowMs(YEARLY))).toBe(drip.index + 1)
    }
  })

  it('survives a period start it cannot parse', () => {
    expect(dripsOwed({ offer: YEARLY, periodStart: 'not a date', now: day(200) })).toEqual([])
  })
})

describe('dripReference', () => {
  it('is unique per slot and per period, so a renewal does not collide', () => {
    const first = dripReference({ periodEnd: '2027-09-13T00:00:00.000Z', index: 3 })
    const second = dripReference({ periodEnd: '2028-09-13T00:00:00.000Z', index: 3 })
    expect(first).not.toBe(second)
    expect(first).toBe(dripReference({ periodEnd: '2027-09-13T00:00:00.000Z', index: 3 }))
  })
})
