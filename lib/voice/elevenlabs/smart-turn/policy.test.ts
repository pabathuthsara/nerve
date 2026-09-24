import { describe, expect, it } from 'vitest'
import { resolveSilenceMs } from '../../types'
import {
  CONFIDENT_COMPLETE,
  EXTENSION_CEILING_MS,
  EXTENSION_FACTOR,
  PROBE_AFTER_MS,
  SOUNDS_UNFINISHED_BELOW,
  concedeAtMs,
  decideEndOfTurn,
  extendedSilenceMs,
  shouldProbe,
  usableProbability,
} from './policy'

/*
 * The rule is small enough to state again independently, so the tests do:
 * `oracle` below is written from the report's sentence, not from `policy.ts`,
 * and the grid walks every calibrated number `resolveSilenceMs` can produce
 * against every probability band edge and every silence on a 10 ms clock.
 */

const PROBABILITIES: Array<number | null> = [
  null,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  -0.01,
  1.01,
  0,
  0.1,
  0.4999,
  0.5,
  0.6,
  0.6999,
  0.7,
  0.85,
  1,
]

/** Every value `resolveSilenceMs` can return, stepped: 200 to 3000. */
const CALIBRATIONS = Array.from({ length: (3000 - 200) / 25 + 1 }, (_, i) => 200 + i * 25)

function oracle(silenceMs: number, probability: number | null, calibratedMs: number): 'concede' | 'wait' {
  const valid = probability !== null && Number.isFinite(probability) && probability >= 0 && probability <= 1
  let deadline: number
  if (!valid) deadline = calibratedMs // today, exactly
  else if (probability >= 0.7) deadline = Math.min(200, calibratedMs) // he sounds done: concede at the probe
  else if (probability < 0.5) deadline = Math.max(calibratedMs, Math.min(Math.round(calibratedMs * 1.6), 1200))
  else deadline = calibratedMs
  return silenceMs >= deadline ? 'concede' : 'wait'
}

describe('the constants say what the report says', () => {
  it('probes at ~200 ms, concedes at 0.7, extends below 0.5 by 1.6x to at most 1200 ms', () => {
    expect(PROBE_AFTER_MS).toBe(200)
    expect(CONFIDENT_COMPLETE).toBe(0.7)
    expect(SOUNDS_UNFINISHED_BELOW).toBe(0.5)
    expect(EXTENSION_FACTOR).toBe(1.6)
    expect(EXTENSION_CEILING_MS).toBe(1200)
  })
})

describe('decideEndOfTurn, exhaustively', () => {
  it('agrees with the rule as stated, on every calibration, band edge and 10 ms of silence', () => {
    let checked = 0
    for (const calibratedMs of CALIBRATIONS) {
      for (const probability of PROBABILITIES) {
        for (let silenceMs = 0; silenceMs <= 3200; silenceMs += 10) {
          const got = decideEndOfTurn({ silenceMs, probability, calibratedMs })
          if (got !== oracle(silenceMs, probability, calibratedMs)) {
            throw new Error(`silence ${silenceMs}, p ${probability}, calibrated ${calibratedMs}: got ${got}`)
          }
          checked += 1
        }
      }
    }
    expect(checked).toBe(CALIBRATIONS.length * PROBABILITIES.length * 321)
  })

  it('with no answer, is today’s rule to the millisecond: concede exactly at the calibrated silence', () => {
    const mismatches: string[] = []
    for (const calibratedMs of CALIBRATIONS) {
      for (let silenceMs = 0; silenceMs <= 3200; silenceMs += 1) {
        const today = silenceMs >= calibratedMs ? 'concede' : 'wait'
        if (decideEndOfTurn({ silenceMs, probability: null, calibratedMs }) !== today) mismatches.push(`${calibratedMs}/${silenceMs}`)
      }
    }
    expect(mismatches).toEqual([])
  })

  it('treats a probability it cannot trust exactly as no answer', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -0.2, 1.2]) {
      for (const calibratedMs of CALIBRATIONS) expect(concedeAtMs(bad, calibratedMs)).toBe(calibratedMs)
    }
  })

  it('never concedes before the probe, whatever the model says', () => {
    for (const calibratedMs of CALIBRATIONS) {
      for (const probability of PROBABILITIES) {
        expect(concedeAtMs(probability, calibratedMs)).toBeGreaterThanOrEqual(Math.min(PROBE_AFTER_MS, calibratedMs))
      }
    }
  })

  it('never waits past max(calibrated, 1200 ms), whatever the model says', () => {
    for (const calibratedMs of CALIBRATIONS) {
      for (const probability of PROBABILITIES) {
        expect(concedeAtMs(probability, calibratedMs)).toBeLessThanOrEqual(Math.max(calibratedMs, EXTENSION_CEILING_MS))
      }
    }
  })

  it('is monotone in silence: once it concedes, more silence never takes it back', () => {
    for (const calibratedMs of [200, 450, 600, 750, 1000, 1300, 3000]) {
      for (const probability of PROBABILITIES) {
        let conceded = false
        for (let silenceMs = 0; silenceMs <= 3200; silenceMs += 5) {
          const now = decideEndOfTurn({ silenceMs, probability, calibratedMs }) === 'concede'
          if (conceded) expect(now).toBe(true)
          conceded ||= now
        }
      }
    }
  })

  it('is monotone in confidence: a more-finished-sounding pause is never waited out longer', () => {
    const ladder = [0, 0.3, 0.4999, 0.5, 0.65, 0.6999, 0.7, 0.9, 1]
    for (const calibratedMs of CALIBRATIONS) {
      for (let i = 1; i < ladder.length; i += 1) {
        expect(concedeAtMs(ladder[i]!, calibratedMs)).toBeLessThanOrEqual(concedeAtMs(ladder[i - 1]!, calibratedMs))
      }
    }
  })
})

describe('the numbers at the default calibration', () => {
  const calibrated = resolveSilenceMs({ silenceMs: 600 })

  it('he sounds done: she can take the floor at 200 ms instead of 600', () => {
    expect(decideEndOfTurn({ silenceMs: 190, probability: 0.9, calibratedMs: calibrated })).toBe('wait')
    expect(decideEndOfTurn({ silenceMs: 200, probability: 0.9, calibratedMs: calibrated })).toBe('concede')
  })

  it('he sounds mid-thought: the 600 ms pause that cuts him off today is waited out to 960', () => {
    expect(decideEndOfTurn({ silenceMs: 600, probability: 0.2, calibratedMs: calibrated })).toBe('wait')
    expect(decideEndOfTurn({ silenceMs: 950, probability: 0.2, calibratedMs: calibrated })).toBe('wait')
    expect(decideEndOfTurn({ silenceMs: 960, probability: 0.2, calibratedMs: calibrated })).toBe('concede')
  })

  it('the model is unsure: exactly today', () => {
    expect(decideEndOfTurn({ silenceMs: 590, probability: 0.6, calibratedMs: calibrated })).toBe('wait')
    expect(decideEndOfTurn({ silenceMs: 600, probability: 0.6, calibratedMs: calibrated })).toBe('concede')
  })
})

describe('extendedSilenceMs', () => {
  it('stretches by 1.6x, stops at 1200, and never shortens a slow speaker’s own number', () => {
    expect(extendedSilenceMs(200)).toBe(320)
    expect(extendedSilenceMs(400)).toBe(640)
    expect(extendedSilenceMs(600)).toBe(960)
    expect(extendedSilenceMs(700)).toBe(1120)
    expect(extendedSilenceMs(750)).toBe(1200)
    expect(extendedSilenceMs(900)).toBe(1200)
    expect(extendedSilenceMs(1200)).toBe(1200)
    expect(extendedSilenceMs(1500)).toBe(1500)
    expect(extendedSilenceMs(3000)).toBe(3000)
  })
})

describe('shouldProbe', () => {
  it('asks once per pause, from 200 ms on', () => {
    expect(shouldProbe(0, false)).toBe(false)
    expect(shouldProbe(199, false)).toBe(false)
    expect(shouldProbe(200, false)).toBe(true)
    expect(shouldProbe(900, false)).toBe(true)
    expect(shouldProbe(200, true)).toBe(false)
    expect(shouldProbe(900, true)).toBe(false)
  })
})

describe('usableProbability', () => {
  it('passes [0, 1] through and turns everything else into null', () => {
    expect(usableProbability(0)).toBe(0)
    expect(usableProbability(1)).toBe(1)
    expect(usableProbability(0.42)).toBe(0.42)
    expect(usableProbability(null)).toBeNull()
    expect(usableProbability(undefined)).toBeNull()
    expect(usableProbability(Number.NaN)).toBeNull()
    expect(usableProbability(-0.001)).toBeNull()
    expect(usableProbability(1.001)).toBeNull()
  })
})
