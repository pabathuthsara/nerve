/**
 * The ladder simulation is only evidence if its fixtures mean what they say
 * and its numbers can be reproduced. Those are the two things tested here.
 *
 * Nothing below asserts an arm RATE against a target. The simulation exists to
 * measure the ladder, and a test that pinned what it measures would turn every
 * deliberate retune into a red suite — which is `dating-arm.test.ts`'s job, not
 * this file's.
 */

import { describe, expect, it } from 'vitest'
import { DATING_PERSONAS } from '@/lib/personas'
import { classifyUserTurn } from '@/lib/warmth/turn-kind'
import { scoreFast } from '@/lib/warmth/fast'
import {
  CATEGORIES,
  HER_LINES,
  HIS_LINES,
  PLAYERS,
  PLAYER_IDS,
  allHerLines,
  poolViolations,
  simulateCell,
  simulateRep,
} from './ladder'
import { seededRandom } from '@/lib/voice/seed'

const cass = DATING_PERSONAS['tess']!
const nadia = DATING_PERSONAS['nadia']!

describe('the fixtures', () => {
  it('pass every check the real classifier and scorer can make', () => {
    // A category is a claim about how the scorer will read a line. If this
    // list is not empty, some row of the table is measuring a different
    // player from the one its label names.
    expect(poolViolations()).toEqual([])
  })

  it('mix exactly as Appendix C states', () => {
    expect(PLAYERS.strong.mix).toEqual({ open: 0.5, callback: 0.4, ordinary: 0.1, short: 0, deadEnd: 0 })
    expect(PLAYERS.competent.mix).toEqual({ open: 0.35, callback: 0.2, ordinary: 0.25, short: 0.12, deadEnd: 0.08 })
    expect(PLAYERS.nervous.mix).toEqual({ open: 0.2, callback: 0.1, ordinary: 0.3, short: 0.25, deadEnd: 0.15 })
    expect([PLAYERS.strong.slowIntent, PLAYERS.competent.slowIntent, PLAYERS.nervous.slowIntent]).toEqual([5, 3, 2])
  })

  it('pays a callback as a callback, through the real scorer', () => {
    // The whole reason her side exists: a pick-up is only a callback if the
    // scorer finds her word in it.
    for (const her of allHerLines()) {
      const agentTurns = [{ speaker: 'agent' as const, text: her.text, t_start: 0, t_end: 1 }]
      for (const text of [her.statement, her.question]) {
        const score = scoreFast(
          { speaker: 'user', text, t_start: 2, t_end: 5 },
          { level: 2, agentTurns, precedingDeadEnds: 0, gapSeconds: null },
        )
        expect(score.reasons.map((reason) => reason.code), text).toContain('callback')
      }
    }
  })

  it('makes a dead end an answer when she has just asked him something', () => {
    // The rule the canned side has to be able to trigger: "Okay." after her
    // question is participation, after her statement it is a withdrawal.
    for (const text of HIS_LINES.deadEnd) {
      expect(classifyUserTurn(text, { herLastTurnAsked: false })).toBe('acknowledgement')
      expect(classifyUserTurn(text, { herLastTurnAsked: true })).toBe('answer')
    }
    expect(HER_LINES.ENGAGED.questions.length).toBeGreaterThan(0)
  })
})

describe('the simulation', () => {
  it('is deterministic for a fixed seed', () => {
    const a = simulateCell(nadia, 'competent', 12, { reps: 60, seed: 'test' })
    const b = simulateCell(nadia, 'competent', 12, { reps: 60, seed: 'test' })
    expect(b).toEqual(a)
  })

  it('moves when the seed does', () => {
    const a = simulateCell(nadia, 'nervous', 12, { reps: 60, seed: 'one' })
    const b = simulateCell(nadia, 'nervous', 12, { reps: 60, seed: 'two' })
    expect(b.meanPeak).not.toBe(a.meanPeak)
  })

  it('plays every category it claims to, on every player that uses it', () => {
    for (const player of PLAYER_IDS) {
      const cell = simulateCell(cass, player, 16, { reps: 40, seed: 'coverage' })
      for (const category of CATEGORIES) {
        if (PLAYERS[player].mix[category] > 0) expect(cell.fastByCategory[category].turns, `${player} ${category}`).toBeGreaterThan(0)
        else if (category !== 'open') expect(cell.fastByCategory[category].turns).toBe(0)
      }
    }
  })

  it('orders the players on the rung built to be won', () => {
    // Not a target: a direction. If a nervous player out-arms a strong one on
    // Cass, the players are mislabelled, whatever the ladder is doing.
    const strong = simulateCell(cass, 'strong', 12, { reps: 200, seed: 'order' })
    const nervous = simulateCell(cass, 'nervous', 12, { reps: 200, seed: 'order' })
    expect(strong.armRate).toBeGreaterThanOrEqual(nervous.armRate)
    expect(strong.meanPeak).toBeGreaterThan(nervous.meanPeak)
  })

  it('never arms on the wind-down turns themselves', () => {
    // "Armed" is read before the last three turns. A rep of three turns has
    // no turn before its wind-down, so it can only be armed by where it
    // started, and every rung starts well below 65.
    const rng = seededRandom('short')
    for (let i = 0; i < 50; i += 1) {
      expect(simulateRep(cass, 'strong', 3, rng).armed).toBe(false)
    }
  })
})
