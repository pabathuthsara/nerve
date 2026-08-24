import { describe, expect, it } from 'vitest'

import { CALIBRATION_TRANSCRIPTS } from './transcripts'
import { EXPECTED, GRADE_FIXTURES, MAX_DRIFT, REQUIRED_FIXTURES, type ExpectedScores } from './fixtures'
import { SUB_SCORE_KEYS } from '../types'

/** What the runner does per dimension, extracted so it can be tested at a desk. */
function worstDrift(expected: ExpectedScores, actual: ExpectedScores): number {
  return [...SUB_SCORE_KEYS, 'composite' as const]
    .map((key) => Math.abs(actual[key] - expected[key]))
    .reduce((max, value) => Math.max(max, value), 0)
}

const SCORED: ExpectedScores = {
  opening: 72, curiosity: 68, listening: 74, signalReading: 65, composure: 80, close: 58, composite: 71,
}

describe('the drift check', () => {
  it('passes an identical grade', () => {
    expect(worstDrift(SCORED, SCORED)).toBe(0)
  })

  it('turns red when a fixture is corrupted', () => {
    // §07's own acceptance criterion: "deliberately corrupting one fixture's
    // expected score turns it red". This is that, at a desk.
    const drifted = { ...SCORED, signalReading: SCORED.signalReading + MAX_DRIFT + 1 }
    expect(worstDrift(SCORED, drifted)).toBeGreaterThan(MAX_DRIFT)
  })

  it('tolerates ordinary noise up to the threshold', () => {
    const noisy = { ...SCORED, composure: SCORED.composure + MAX_DRIFT }
    expect(worstDrift(SCORED, noisy)).toBeLessThanOrEqual(MAX_DRIFT)
  })

  it('watches the composite as well as the six', () => {
    // The composite is 60% deterministic and 40% judgement, so it can drift
    // while every sub-score holds. Missing it would let the number the user
    // actually sees rot unobserved.
    const drifted = { ...SCORED, composite: SCORED.composite + MAX_DRIFT + 1 }
    expect(worstDrift(SCORED, drifted)).toBeGreaterThan(MAX_DRIFT)
  })
})

describe('the golden set', () => {
  it('is collected from real reps under the current format', () => {
    // Invented conversations would make the suite green while measuring
    // nothing, which is worse than an empty set that says so.
    expect(CALIBRATION_TRANSCRIPTS.length).toBeGreaterThan(0)
    for (const fixture of CALIBRATION_TRANSCRIPTS) {
      expect(fixture.source, fixture.id).toMatch(/^session [0-9a-f-]{36}$/)
      expect(fixture.transcript.length, fixture.id).toBeGreaterThanOrEqual(6)
      expect(fixture.sessionSeconds, fixture.id).toBeGreaterThanOrEqual(60)
    }
  })

  it('has an expectation slot for every transcript, and no orphans', () => {
    // An EXPECTED key with no transcript is scoring work aimed at nothing.
    const ids = new Set(CALIBRATION_TRANSCRIPTS.map((fixture) => fixture.id))
    for (const id of Object.keys(EXPECTED)) expect(ids.has(id), `orphan: ${id}`).toBe(true)
    for (const id of ids) expect(id in EXPECTED, `unscored slot missing: ${id}`).toBe(true)
  })

  it('carries normalised turns, the shape both adapters emit (§04)', () => {
    for (const fixture of CALIBRATION_TRANSCRIPTS) {
      for (const turn of fixture.transcript) {
        expect(['user', 'agent']).toContain(turn.speaker)
        expect(typeof turn.text).toBe('string')
        expect(turn.t_end).toBeGreaterThanOrEqual(turn.t_start)
      }
    }
  })

  it('is not yet the twenty §07 asks for, and does not pretend to be', () => {
    // This assertion is expected to be DELETED, not updated, on the day the
    // twentieth is scored. Until then it is the honest state of the M2 gate.
    const scored = GRADE_FIXTURES.filter((fixture) => fixture.expected !== null)
    expect(scored.length).toBeLessThan(REQUIRED_FIXTURES)
  })
})
