/**
 * Timing as the fifth layer (HUMANNESS-PLAN §3).
 *
 * These assert the STRUCTURE, not the numbers — the table is meant to be tuned
 * against real reps and a test that pins its constants is a test that argues
 * against tuning it. What must not move is the ordering, the posture override,
 * the hesitation bump and the fact that nothing here is a constant.
 */

import { describe, expect, it } from 'vitest'

import {
  DEFAULT_REPLY_SHAPE,
  MAX_RESPONSE_DELAY_MS,
  remainingResponseDelayMs,
  responseDelayFor,
  timingBandFor,
  type ReplyShape,
} from './timing'
import { BANDS } from './bands'

/** The middle of the distribution, so a draw's spread cannot decide a test. */
const median = () => 0.5

/** Enough draws that a wide band's tail is actually exercised. */
function sample(warmth: number, shape: ReplyShape = DEFAULT_REPLY_SHAPE, n = 400): number[] {
  let seed = 0x2f6e2b1
  const rng = () => {
    // xorshift32, so the sample is deterministic and the suite cannot flake.
    seed ^= seed << 13; seed >>>= 0
    seed ^= seed >> 17
    seed ^= seed << 5; seed >>>= 0
    return seed / 0x100000000
  }
  return Array.from({ length: n }, () => responseDelayFor(warmth, shape, rng))
}

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length

describe('responseDelayFor — silence is a channel, not a defect', () => {
  it('takes longer the colder she is, across every band in the table', () => {
    // Stivers: gaps past ~700ms are decoded cross-culturally as a dispreferred
    // response. The cold bands live there on purpose.
    const byBand = BANDS.map((spec) => responseDelayFor(spec.min + 1, DEFAULT_REPLY_SHAPE, median))
    for (let i = 1; i < byBand.length; i += 1) {
      expect(byBand[i], BANDS[i]!.band).toBeLessThan(byBand[i - 1]!)
    }
  })

  it('puts the coldest band past the dispreferred threshold and the warmest near the human mode', () => {
    expect(responseDelayFor(-10, DEFAULT_REPLY_SHAPE, median)).toBeGreaterThan(700)
    // ~200ms is the universal modal gap. INVESTED sits at or under it.
    expect(responseDelayFor(95, DEFAULT_REPLY_SHAPE, median)).toBeLessThanOrEqual(250)
  })

  it('is never a metronome — the same state produces a spread, not a number', () => {
    const draws = new Set(sample(30))
    expect(draws.size).toBeGreaterThan(20)
  })

  it('keeps every draw inside a pause a person could actually take', () => {
    for (const warmth of [-20, 0, 25, 50, 75, 100]) {
      for (const posture of ['level', 'wary', 'at-ease', 'taken', 'polite'] as const) {
        for (const turnKind of ['ordinary', 'intimate', 'dispreferred'] as const) {
          for (const ms of sample(warmth, { posture, turnKind }, 60)) {
            expect(ms, `${warmth}/${posture}/${turnKind}`).toBeGreaterThanOrEqual(0)
            expect(ms, `${warmth}/${posture}/${turnKind}`).toBeLessThanOrEqual(MAX_RESPONSE_DELAY_MS)
          }
        }
      }
    }
  })
})

describe('posture overrides band', () => {
  it('keeps a wary character slow at warmth 70', () => {
    // A character who is warm and fast is easy. A character who is warm and
    // hesitant is a person. This is the whole argument for the override.
    const level = responseDelayFor(70, { posture: 'level', turnKind: 'ordinary' }, median)
    const wary = responseDelayFor(70, { posture: 'wary', turnKind: 'ordinary' }, median)
    expect(wary).toBeGreaterThan(level)
    expect(timingBandFor(70, { posture: 'wary', turnKind: 'ordinary' })).toBe('GUARDED')
  })

  it('is a floor, so it can never make a cold character quicker', () => {
    for (const posture of ['wary', 'polite'] as const) {
      const level = responseDelayFor(-10, { posture: 'level', turnKind: 'ordinary' }, median)
      const shaped = responseDelayFor(-10, { posture, turnKind: 'ordinary' }, median)
      expect(shaped, posture).toBeGreaterThanOrEqual(level)
      expect(timingBandFor(-10, { posture, turnKind: 'ordinary' })).toBe('HOSTILE')
    }
  })

  it('lets only `taken` answer early, and only by a little', () => {
    const level = responseDelayFor(80, { posture: 'level', turnKind: 'ordinary' }, median)
    const taken = responseDelayFor(80, { posture: 'taken', turnKind: 'ordinary' }, median)
    expect(taken).toBeLessThan(level)
    expect(level - taken).toBeLessThan(150)
  })
})

describe('the turn kind moves it, whatever the band says', () => {
  it('hesitates before a personal answer at every band', () => {
    for (const warmth of [-10, 20, 45, 70, 95]) {
      const ordinary = responseDelayFor(warmth, { posture: 'level', turnKind: 'ordinary' }, median)
      const intimate = responseDelayFor(warmth, { posture: 'level', turnKind: 'intimate' }, median)
      expect(intimate, `@${warmth}`).toBeGreaterThan(ordinary)
    }
  })

  it('puts a smaller pause in front of a dispreferred one', () => {
    const shape = (turnKind: ReplyShape['turnKind']): ReplyShape => ({ posture: 'level', turnKind })
    const ordinary = mean(sample(70, shape('ordinary')))
    const dispreferred = mean(sample(70, shape('dispreferred')))
    const intimate = mean(sample(70, shape('intimate')))
    expect(dispreferred).toBeGreaterThan(ordinary)
    expect(intimate).toBeGreaterThan(dispreferred)
  })

  it('pushes an engaged character over the dispreferred threshold when the question is personal', () => {
    // The signal the user is here to learn to read: she is warm, and she still
    // took a beat, because you asked something she has to decide about.
    expect(mean(sample(70, { posture: 'wary', turnKind: 'intimate' }))).toBeGreaterThan(700)
  })
})

describe('remainingResponseDelayMs — the pipeline has usually spent it already', () => {
  it('subtracts work that has already happened', () => {
    expect(remainingResponseDelayMs(900, 600)).toBe(300)
    expect(remainingResponseDelayMs(900, 900)).toBe(0)
    expect(remainingResponseDelayMs(900, 1500)).toBe(0)
  })

  it('treats nonsense as no beat rather than as a stall', () => {
    expect(remainingResponseDelayMs(900, -100)).toBe(900)
    expect(remainingResponseDelayMs(Number.NaN, 0)).toBe(0)
    expect(remainingResponseDelayMs(900, Number.NaN)).toBe(900)
  })
})
