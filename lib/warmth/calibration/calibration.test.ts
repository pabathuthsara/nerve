/**
 * The calibration harness (§07, §Part 5).
 *
 * Two halves:
 *
 *   1. Structural checks. Run always, offline, and guard the things that broke
 *      in round 6 — the anchors spanning the full range, the trigger filter
 *      catching the turn that went unscored, the scale not collapsing.
 *
 *   2. The live accuracy check. Runs the real scorer against hand-scored
 *      fixtures and fails if mean absolute error on intimacy exceeds 15.
 *      SKIPPED until the fixtures are hand-scored and a key is present, because
 *      a harness that grades a model against scores the model wrote is theatre.
 *
 * Enable the live half with:  RUN_CALIBRATION=1 npm test -- calibration
 */

import { describe, expect, it } from 'vitest'
import {
  CALIBRATION_FIXTURES,
  scoredFixtures,
  unscoredCount,
  type ScoredFixture,
} from './fixtures'
import { FEW_SHOTS, buildSystemPrompt, INTIMACY_ANCHORS } from '../prompt'
import { classifyOverreach, clampSlowScore, type SlowScore } from '../slow'
import { slowScoreTriggers } from '../triggers'

/** Mean absolute error gate from the brief. */
export const MAX_INTIMACY_MAE = 15

function meanAbsoluteError(pairs: readonly { expected: number; actual: number }[]): number {
  if (pairs.length === 0) return 0
  return (
    pairs.reduce((sum, pair) => sum + Math.abs(pair.expected - pair.actual), 0) / pairs.length
  )
}

describe('calibration fixtures', () => {
  it('has twenty turn-pairs', () => {
    expect(CALIBRATION_FIXTURES).toHaveLength(20)
  })

  it('gives every fixture unique id and a source', () => {
    const ids = CALIBRATION_FIXTURES.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const fixture of CALIBRATION_FIXTURES) {
      expect(fixture.source, fixture.id).toBeTruthy()
      expect(fixture.user.trim(), fixture.id).toBeTruthy()
    }
  })

  it('includes the turn count-based sampling missed', () => {
    const missed = CALIBRATION_FIXTURES.find((f) => f.id === 'r6-16')
    expect(missed).toBeDefined()
    // And the new trigger logic would now catch it.
    expect(
      slowScoreTriggers({
        turnIndex: 16,
        fastRaw: 0,
        wordCount: missed?.user.split(/\s+/).length ?? 0,
        text: missed?.user ?? '',
      }),
    ).toContain('personal-marker')
  })

  it('includes the ASR failure that penalised a coherent turn', () => {
    const asr = CALIBRATION_FIXTURES.find((f) => f.id === 'asr-01')
    expect(asr?.agent).toContain('Sherlock')
    expect(asr?.user).toContain('cello combs')
  })

  it('spans the whole intimacy range once hand-scored', () => {
    const scored = scoredFixtures()
    if (scored.length === 0) {
      // Nothing to check yet — the hand-scoring pass has not happened.
      expect(unscoredCount()).toBe(20)
      return
    }
    const values = scored.map((f) => f.intimacy)
    expect(Math.min(...values)).toBeLessThan(20)
    expect(Math.max(...values)).toBeGreaterThan(60)
  })
})

describe('the anchored scale', () => {
  it('covers every band the brief specifies', () => {
    for (const band of ['0-10', '20-30', '40-50', '60-70', '80-90', '100']) {
      expect(INTIMACY_ANCHORS).toContain(band)
    }
  })

  it('ships few-shots spanning the full range', () => {
    expect(FEW_SHOTS.length).toBeGreaterThanOrEqual(6)
    const values = FEW_SHOTS.map((shot) => shot.intimacy)
    expect(Math.min(...values)).toBeLessThanOrEqual(10)
    expect(Math.max(...values)).toBeGreaterThanOrEqual(80)
    // Round 6 collapsed 92% of judgements onto two values. Spread is the fix.
    expect(new Set(values).size).toBeGreaterThanOrEqual(6)
  })

  it('tells the model that warmth must not move intimacy', () => {
    const prompt = buildSystemPrompt('Nadia')
    expect(prompt).toContain('must NOT change your intimacy number')
    expect(prompt).toContain('Rate the same sentence identically at warmth 5')
  })

  it('forbids the model from scoring what the fast path owns', () => {
    const prompt = buildSystemPrompt('Nadia')
    for (const forbidden of ['reply length', 'asked a question', 'filler words']) {
      expect(prompt).toContain(forbidden)
    }
  })

  it('requires a verbatim quote', () => {
    expect(buildSystemPrompt('Nadia')).toContain('Copy them verbatim')
  })

  it('produces a boundary verdict at the anchored values', () => {
    // With the anchors, "get down my number" is 65. At round 6's opening warmth
    // that is an overreach of 40+ and the rule finally fires — under the old
    // collapsed scale it returned 0 and the rule never fired at all.
    expect(classifyOverreach(65, 15).verdict).toBe('boundary-violation')
    expect(classifyOverreach(85, 30).verdict).toBe('boundary-violation')
    expect(classifyOverreach(45, 40).verdict).toBe('none')
    // The old behaviour, for the record: intimacy 0 or 10 can never overreach.
    expect(classifyOverreach(10, 15).verdict).toBe('none')
    expect(classifyOverreach(0, 41.5).verdict).toBe('none')
  })
})

describe('scorer output handling', () => {
  it('rejects a response missing either number', () => {
    expect(clampSlowScore({ intimacy: 50 })).toBeNull()
    expect(clampSlowScore({ intent: 2 })).toBeNull()
    expect(clampSlowScore(null)).toBeNull()
  })

  it('clamps rather than discards out-of-range values', () => {
    expect(clampSlowScore({ intimacy: 900, intent: -99, quote: 'x', reason: 'y' })).toEqual({
      intimacy: 100,
      intent: -10,
      quote: 'x',
      reason: 'y',
    })
  })

  it('computes mean absolute error the way the gate reads it', () => {
    expect(meanAbsoluteError([{ expected: 60, actual: 45 }])).toBe(15)
    expect(
      meanAbsoluteError([
        { expected: 0, actual: 0 },
        { expected: 100, actual: 70 },
      ]),
    ).toBe(15)
  })
})

/* ------------------------------------------------------------------ *
 * Live accuracy. Network. Opt-in.
 * ------------------------------------------------------------------ */

const scored = scoredFixtures()
const liveEnabled =
  process.env['RUN_CALIBRATION'] === '1' &&
  Boolean(process.env['OPENAI_API_KEY']) &&
  scored.length > 0

describe.skipIf(!liveEnabled)('live scorer accuracy', () => {
  it(
    `keeps intimacy MAE under ${MAX_INTIMACY_MAE} across the hand-scored fixtures`,
    async () => {
      const base = process.env['CALIBRATION_BASE_URL'] ?? 'http://localhost:3000'
      const results: { fixture: ScoredFixture; score: SlowScore }[] = []

      for (const fixture of scored) {
        const response = await fetch(`${base}/api/warmth/score`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            userText: fixture.user,
            agentReply: fixture.agent,
            agentPrior: null,
            warmth: fixture.warmth,
            personaName: 'Nadia',
          }),
        })
        expect(response.ok, `${fixture.id} -> ${response.status}`).toBe(true)
        const score = clampSlowScore(await response.json())
        expect(score, fixture.id).not.toBeNull()
        if (score) results.push({ fixture, score })
      }

      const errors = results.map((r) => ({
        expected: r.fixture.intimacy,
        actual: r.score.intimacy,
      }))
      const mae = meanAbsoluteError(errors)

      // Printed so a failure says which fixtures drove it, not just the number.
      for (const r of results) {
        const delta = Math.abs(r.fixture.intimacy - r.score.intimacy)
        if (delta > MAX_INTIMACY_MAE) {
          console.warn(
            `${r.fixture.id}: expected ${r.fixture.intimacy}, got ${r.score.intimacy} — "${r.score.quote}"`,
          )
        }
      }

      expect(mae).toBeLessThanOrEqual(MAX_INTIMACY_MAE)
    },
    120_000,
  )
})
