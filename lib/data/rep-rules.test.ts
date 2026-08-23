/**
 * The rep format, asserted.
 *
 * Three minutes, a number decided at the wind-down rather than the moment the
 * meter moves, a wind-down before the end, and an ending that lets her finish
 * her sentence. These are tested here rather than in the browser because a
 * microphone is the one thing a test cannot have, and "does the timer stop at
 * three minutes" should not need one.
 */

import { describe, expect, it } from 'vitest'
import {
  ARM_THRESHOLD,
  CLOSING_GRACE_MS,
  CLOSING_IDLE_MS,
  DATING_DURATION_MS,
  givesNumber,
  INTERVIEW_DURATION_MS,
  inventNumber,
  isClosingOver,
  isTimeUp,
  KEEP_THRESHOLD,
  repDurationMs,
  repThreshold,
  shouldArm,
  shouldWrapUp,
  WRAP_UP_MS,
} from './rep-rules'

describe('the three-minute rule', () => {
  it('gives a dating rep exactly three minutes', () => {
    expect(DATING_DURATION_MS).toBe(180_000)
    expect(repDurationMs(false)).toBe(180_000)
  })

  it('gives an interview eight', () => {
    expect(repDurationMs(true)).toBe(INTERVIEW_DURATION_MS)
    expect(INTERVIEW_DURATION_MS).toBe(8 * 60_000)
  })

  it('is over when the clock reaches zero, not before', () => {
    expect(isTimeUp(1)).toBe(false)
    expect(isTimeUp(0)).toBe(true)
    expect(isTimeUp(-40)).toBe(true)
  })

  it('leaves room to land the conversation before the cut', () => {
    expect(WRAP_UP_MS).toBeGreaterThan(10_000)
    expect(WRAP_UP_MS).toBeLessThan(DATING_DURATION_MS / 3)
  })
})

describe('arming', () => {
  const base = { armed: false, interview: false }

  it('does not arm below the threshold', () => {
    expect(shouldArm({ ...base, warmth: ARM_THRESHOLD - 0.5 })).toBe(false)
    expect(shouldArm({ ...base, warmth: 0 })).toBe(false)
  })

  it('arms the moment warmth reaches it', () => {
    expect(shouldArm({ ...base, warmth: ARM_THRESHOLD })).toBe(true)
    expect(shouldArm({ ...base, warmth: 92 })).toBe(true)
  })

  it('arms once — a second crossing is not a second event', () => {
    expect(shouldArm({ ...base, warmth: 88, armed: true })).toBe(false)
  })

  it('never arms an interview: a callback is decided by the grade, not in the room', () => {
    expect(shouldArm({ ...base, warmth: 99, interview: true })).toBe(false)
  })
})

describe('the number', () => {
  const base = { armed: true, interview: false }

  it('needs the rep to have been armed at some point', () => {
    // The whole point of the pair. Finishing warm without ever having been
    // interesting is not the same as having been interesting.
    expect(givesNumber({ ...base, armed: false, warmth: 64 })).toBe(false)
  })

  it('survives a dip: armed at 65, still there at 58', () => {
    expect(givesNumber({ ...base, warmth: 58 })).toBe(true)
    expect(givesNumber({ ...base, warmth: KEEP_THRESHOLD })).toBe(true)
  })

  it('does not survive a collapse', () => {
    expect(givesNumber({ ...base, warmth: KEEP_THRESHOLD - 1 })).toBe(false)
    expect(givesNumber({ ...base, warmth: 12 })).toBe(false)
  })

  it('is never given in an interview', () => {
    expect(givesNumber({ ...base, warmth: 99, interview: true })).toBe(false)
  })

  it('is never given after a crossed boundary, whatever the meter said', () => {
    expect(givesNumber({ ...base, warmth: 99, boundaryCrossed: true })).toBe(false)
  })

  it('reads as a mobile number and never as a place-holder', () => {
    const number = inventNumber(() => 0.42)
    expect(number).toMatch(/^\+94 7\d \d{3} \d{4}$/)
    expect(number).not.toContain('000 0000')
  })
})

describe('the thresholds', () => {
  it('leave ten points of hysteresis between arming and keeping', () => {
    expect(ARM_THRESHOLD).toBe(65)
    expect(KEEP_THRESHOLD).toBe(55)
    expect(ARM_THRESHOLD - KEEP_THRESHOLD).toBe(10)
  })

  it('draw the ring against the one the user is aiming at', () => {
    expect(repThreshold(false)).toBe(ARM_THRESHOLD)
    expect(repThreshold(true)).toBe(70)
  })
})

describe('winding down', () => {
  it('starts at the wrap-up mark', () => {
    expect(shouldWrapUp({ msRemaining: WRAP_UP_MS + 1, alreadyWrapped: false })).toBe(false)
    expect(shouldWrapUp({ msRemaining: WRAP_UP_MS, alreadyWrapped: false })).toBe(true)
  })

  it('happens once — one directive, not a stream of them', () => {
    expect(shouldWrapUp({ msRemaining: 4_000, alreadyWrapped: true })).toBe(false)
  })
})

describe('the closing grace', () => {
  it('lets her finish while she is still speaking', () => {
    expect(isClosingOver({ msSinceTimeUp: 8_000, agentSpeaking: true })).toBe(false)
  })

  it('ends promptly if she is not speaking', () => {
    expect(isClosingOver({ msSinceTimeUp: CLOSING_IDLE_MS - 1, agentSpeaking: false })).toBe(false)
    expect(isClosingOver({ msSinceTimeUp: CLOSING_IDLE_MS, agentSpeaking: false })).toBe(true)
  })

  it('has a ceiling however long she talks for', () => {
    expect(isClosingOver({ msSinceTimeUp: CLOSING_GRACE_MS, agentSpeaking: true })).toBe(true)
  })

  it('is long enough to land a goodbye and short enough not to be dead air', () => {
    expect(CLOSING_IDLE_MS).toBeLessThan(CLOSING_GRACE_MS)
    expect(CLOSING_GRACE_MS).toBeLessThanOrEqual(20_000)
  })
})
