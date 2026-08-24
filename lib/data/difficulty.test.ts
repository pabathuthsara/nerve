import { describe, expect, it } from 'vitest'

import {
  BUMP_AT,
  EASE_AT,
  MAX_GAIN_BONUS,
  MAX_START_BONUS,
  NO_OFFSET,
  nextDifficulty,
  withDifficulty,
} from './difficulty'
import { nadia } from '@/lib/personas/nadia'
import { alex } from '@/lib/personas/alex'

const from = (recent: number[], current = NO_OFFSET) => nextDifficulty({ recent, current })

describe('which way the dials move', () => {
  it('makes her HARDER after two strong reps', () => {
    // The sign is the easy thing to invert. Bumping difficulty up means she
    // opens colder and warms slower, so both bonuses go negative.
    const change = from([80, 78])
    expect(change.direction).toBe('bump')
    expect(change.offset.startBonus).toBeLessThan(0)
    expect(change.offset.gainBonus).toBeLessThan(0)
  })

  it('eases off after two weak ones', () => {
    const change = from([40, 51])
    expect(change.direction).toBe('ease')
    expect(change.offset.startBonus).toBeGreaterThan(0)
    expect(change.offset.gainBonus).toBeGreaterThan(0)
  })

  it('holds unless both reps agree', () => {
    expect(from([90, 50]).direction).toBe('hold')
    expect(from([50, 90]).direction).toBe('hold')
    // Between the two thresholds is the ordinary case and moves nothing.
    expect(from([65, 70]).direction).toBe('hold')
    // One rep is not a trend.
    expect(from([90]).direction).toBe('hold')
    expect(from([]).direction).toBe('hold')
  })

  it('reads the thresholds inclusively where the plan does', () => {
    expect(from([BUMP_AT, BUMP_AT]).direction).toBe('bump')
    expect(from([BUMP_AT - 1, BUMP_AT]).direction).toBe('hold')
    expect(from([EASE_AT - 1, EASE_AT - 1]).direction).toBe('ease')
    // At the ease threshold exactly is NOT weak — the rule is "below".
    expect(from([EASE_AT, EASE_AT]).direction).toBe('hold')
  })
})

describe('the downward path is silent (§08, §12)', () => {
  it('never announces an ease, at any depth', () => {
    // THE RULE THIS ITEM EXISTS FOR. Telling somebody who is struggling that
    // you made it easier lands as humiliation and is the fastest way to lose
    // them. Walk the offset all the way to its clamp and check every step.
    let current = NO_OFFSET
    for (let step = 0; step < 12; step += 1) {
      const change = from([10, 20], current)
      expect(change.announce, `step ${step}`).toBe(false)
      if (change.direction === 'hold') break
      expect(change.direction, `step ${step}`).toBe('ease')
      current = change.offset
    }
  })

  it('announces only the bump', () => {
    expect(from([80, 80]).announce).toBe(true)
    expect(from([40, 40]).announce).toBe(false)
    expect(from([65, 65]).announce).toBe(false)
  })

  it('says nothing when the bump changed nothing', () => {
    // Already at the clamp. "She's going to make you work today" on a rep
    // identical to the last one is a promise the rep does not keep.
    const pinned = { startBonus: -MAX_START_BONUS, gainBonus: -MAX_GAIN_BONUS }
    const change = from([90, 90], pinned)
    expect(change.direction).toBe('hold')
    expect(change.announce).toBe(false)
  })
})

describe('the clamps', () => {
  it('cannot turn Level 6 into Level 2, however long the run', () => {
    let current = NO_OFFSET
    for (let step = 0; step < 40; step += 1) current = from([0, 0], current).offset
    expect(current.startBonus).toBe(MAX_START_BONUS)
    expect(current.gainBonus).toBe(MAX_GAIN_BONUS)
  })

  it('clamps the hard direction just as tightly', () => {
    let current = NO_OFFSET
    for (let step = 0; step < 40; step += 1) current = from([100, 100], current).offset
    expect(current.startBonus).toBe(-MAX_START_BONUS)
    expect(current.gainBonus).toBe(-MAX_GAIN_BONUS)
  })
})

describe('applying it to a trajectory', () => {
  it('touches start and gain and nothing else', () => {
    const adjusted = withDifficulty(nadia.trajectory, { startBonus: -4, gainBonus: -0.2 })
    expect(adjusted.start).toBe(nadia.trajectory.start - 4)
    expect(adjusted.gain).toBeCloseTo(nadia.trajectory.gain - 0.2, 5)
    expect(adjusted.decay).toBe(nadia.trajectory.decay)
    expect(adjusted.decayPerTurn).toBe(nadia.trajectory.decayPerTurn)
    expect(adjusted.maxGainPerTurn).toBe(nadia.trajectory.maxGainPerTurn)
  })

  it('never lifts a ceiling, so Alex stays unwinnable (§06)', () => {
    // The whole point of Level 8. An offset that could raise `hardCeiling`
    // would hand her to anybody who had two good nights, which is the exact
    // lesson that level refuses to teach.
    const eased = withDifficulty(alex.trajectory, { startBonus: MAX_START_BONUS, gainBonus: MAX_GAIN_BONUS })
    expect(eased.hardCeiling).toBe(alex.trajectory.hardCeiling)
    expect(eased.sessionCeiling).toBe(alex.trajectory.sessionCeiling)
    expect(eased.hardCeiling).toBeLessThan(65)
  })

  it('is the identity when there is no offset', () => {
    expect(withDifficulty(nadia.trajectory, NO_OFFSET)).toBe(nadia.trajectory)
  })

  it('never drives start or gain to something nonsensical', () => {
    const floored = withDifficulty({ ...alex.trajectory, start: 1, gain: 0.15 }, { startBonus: -6, gainBonus: -0.25 })
    expect(floored.start).toBeGreaterThanOrEqual(0)
    expect(floored.gain).toBeGreaterThan(0)
  })
})
