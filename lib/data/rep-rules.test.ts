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
  dueSceneBeat,
  LAST_BEAT_FRACTION,
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
  resultReading,
  pointsShort,
  INTERVIEW_THRESHOLD,
  NEAR_MISS_POINTS,
} from './rep-rules'
import { PERSONAS } from '@/lib/personas'

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

describe('which reading explains the outcome', () => {
  it('shows the wind-down number, not where the meter finished', () => {
    // THE REGRESSION, with the numbers off a real Nadia rep. Warmth was 63.68
    // at the wind-down — under the bar, so she was told to leave — then
    // climbed to 71.25 in the last thirty seconds because the decision may not
    // change once it is made. The screen showed 71 / 65 under the words "She
    // left", captioned "You were close": three statements contradicting each
    // other, and a comparison nothing had ever made.
    const reading = resultReading({ decisionWarmth: 64, finalWarmth: 71, interview: false, won: false })
    expect(reading.warmth).toBe(64)
    expect(reading.threshold).toBe(ARM_THRESHOLD)
    expect(reading.lateSurge).toBe(true)
    expect(reading.fallback).toBe(false)
  })

  it('does not call it a late surge when she simply earned it', () => {
    const won = resultReading({ decisionWarmth: 70, finalWarmth: 74, interview: false, won: true })
    expect(won.lateSurge).toBe(false)
    expect(won.warmth).toBe(70)
  })

  it('does not call it a late surge when the meter never got there at all', () => {
    const cold = resultReading({ decisionWarmth: 40, finalWarmth: 44, interview: false, won: false })
    expect(cold.lateSurge).toBe(false)
  })

  it('falls back to the final reading for a rep recorded before this was kept', () => {
    const old = resultReading({ decisionWarmth: null, finalWarmth: 71, interview: false, won: false })
    expect(old.warmth).toBe(71)
    expect(old.fallback).toBe(true)
    // Finishing above the bar and not getting it is proof the decision was
    // taken on a lower number, so an older rep still reads correctly.
    expect(old.lateSurge).toBe(true)

    // A rep that finished below the bar tells us nothing extra, and the
    // reading does not invent anything.
    const belowBar = resultReading({ decisionWarmth: null, finalWarmth: 50, interview: false, won: false })
    expect(belowBar.lateSurge).toBe(false)
    // Nor does one she actually gave it on.
    const givenIt = resultReading({ decisionWarmth: null, finalWarmth: 80, interview: false, won: true })
    expect(givenIt.lateSurge).toBe(false)
  })

  it('uses the interview threshold on the interview track', () => {
    expect(resultReading({ decisionWarmth: 60, finalWarmth: 60, interview: true, won: false }).threshold)
      .toBe(INTERVIEW_THRESHOLD)
  })
})

describe('scene beats', () => {
  const beats = [
    { at: 0.25, direction: '(Your brother replies. It is worse than the last one.)' },
    { at: 0.55, direction: '(The board changes. Your train is delayed.)' },
  ]

  it('waits until its moment', () => {
    expect(dueSceneBeat({ beats, elapsedFraction: 0.1, fired: 0 })).toBeNull()
    expect(dueSceneBeat({ beats, elapsedFraction: 0.25, fired: 0 })).toBe(beats[0])
  })

  it('fires them in authored order, once each', () => {
    // Well past both, having already fired the first: the second is next, and
    // the first does not come round again.
    expect(dueSceneBeat({ beats, elapsedFraction: 0.9, fired: 1 })).toBe(beats[1])
    expect(dueSceneBeat({ beats, elapsedFraction: 0.9, fired: 2 })).toBeNull()
  })

  it('does nothing for a character whose scene has no interruptions', () => {
    expect(dueSceneBeat({ beats: undefined, elapsedFraction: 0.5, fired: 0 })).toBeNull()
    expect(dueSceneBeat({ beats: [], elapsedFraction: 0.5, fired: 0 })).toBeNull()
  })

  it('refuses to fire into the wind-down, however it was authored', () => {
    // The last thirty seconds belong to the closing direction. Two different
    // instructions arriving at once is an argument this codebase already had.
    const late = [{ at: 0.95, direction: '(Too late to matter.)' }]
    expect(dueSceneBeat({ beats: late, elapsedFraction: 1, fired: 0 })).toBeNull()
  })

  it('keeps every authored beat clear of the wind-down', () => {
    for (const persona of Object.values(PERSONAS)) {
      for (const beat of persona.sceneBeats ?? []) {
        expect(beat.at, `${persona.name}`).toBeLessThanOrEqual(LAST_BEAT_FRACTION)
        expect(beat.at, `${persona.name}`).toBeGreaterThan(0)
      }
    }
  })

  it('gives every character on the roster something to want', () => {
    // The personhood field. Ungated, and a character without one is a search
    // box with a voice.
    for (const persona of Object.values(PERSONAS)) {
      expect(persona.want.trim().length, persona.name).toBeGreaterThan(0)
    }
  })
})

describe('the near-miss (R4)', () => {
  it('separates missing by four from never being in it', () => {
    // The whole finding: both of these rendered as the same screen, under the
    // same headline, with the same layout.
    const four = resultReading({ decisionWarmth: ARM_THRESHOLD - 4, finalWarmth: 60, interview: false, won: false })
    expect(four.close).toBe(4)
    expect(four.nearMiss).toBe(true)

    const cold = resultReading({ decisionWarmth: 20, finalWarmth: 22, interview: false, won: false })
    expect(cold.close).toBe(ARM_THRESHOLD - 20)
    expect(cold.nearMiss).toBe(false)
  })

  it('stops being nearly at the authored boundary, and stays honest past it', () => {
    const inside = resultReading({ decisionWarmth: ARM_THRESHOLD - NEAR_MISS_POINTS, finalWarmth: 57, interview: false, won: false })
    const outside = resultReading({ decisionWarmth: ARM_THRESHOLD - NEAR_MISS_POINTS - 1, finalWarmth: 56, interview: false, won: false })
    expect(inside.nearMiss).toBe(true)
    expect(outside.nearMiss).toBe(false)
  })

  it('counts a late surge as a near-miss however the arithmetic falls', () => {
    // `close` is negative here — she was told to leave at 64 and the meter
    // finished at 71 — and getting there after she answered is the definition
    // of nearly, so the sign must not decide it.
    const late = resultReading({ decisionWarmth: 64, finalWarmth: 71, interview: false, won: false })
    expect(late.lateSurge).toBe(true)
    expect(late.nearMiss).toBe(true)
  })

  it('never calls a win a near-miss', () => {
    // A rep decided one point over the bar is close in the arithmetic and is
    // not a near-miss in any sense the screen cares about.
    const won = resultReading({ decisionWarmth: ARM_THRESHOLD + 1, finalWarmth: 80, interview: false, won: true })
    expect(won.nearMiss).toBe(false)
  })

  it('reads the interview bar rather than the dating one', () => {
    const interview = resultReading({ decisionWarmth: INTERVIEW_THRESHOLD - 3, finalWarmth: 68, interview: true, won: false })
    expect(interview.close).toBe(3)
    expect(interview.nearMiss).toBe(true)
  })

  it('spells the headline, because it is said rather than measured', () => {
    expect(pointsShort(4)).toBe('Four points')
    expect(pointsShort(1)).toBe('One point')
    expect(pointsShort(8)).toBe('Eight points')
    // Nothing above the near-miss window ever reaches this, but a numeral is a
    // better answer than `undefined points`.
    expect(pointsShort(12)).toBe('12 points')
  })
})
