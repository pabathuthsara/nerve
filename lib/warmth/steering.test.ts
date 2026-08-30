/**
 * Steering composition tests.
 *
 * The steering item is the only thing the character is ever told about how the
 * conversation is going, so what it does and does not contain is the whole
 * mechanic. These assert the four-layer composition and, just as importantly,
 * the things that must NOT leak into it.
 */

import { describe, expect, it } from 'vitest'

import { composeSteering, personalityClauses, gateClauses, EXPRESSION_CLAUSE, STEERING_BUDGET } from './steering'
import { nadia } from '@/lib/personas/nadia'
import { alex } from '@/lib/personas/alex'
import { erin } from '@/lib/personas/erin'
import { PERSONAS } from '@/lib/personas'
import { effectiveSharpness, unlockedGates, type Persona } from '@/lib/voice/types'

const at = (persona: Persona, warmth: number) => composeSteering({ persona, warmth })

describe('composition across the four layers', () => {
  it('always carries the band directive', () => {
    // Layer 1 reaches the character as a band and never as a number. She is
    // never told her difficulty, her trajectory, or that a meter exists.
    expect(at(nadia, 10)).toContain('Four to ten words')
    expect(at(nadia, 45)).toContain('One sentence')
    expect(at(nadia, 70)).toContain('Ask about him')
  })

  it('never leaks the number, the level or the mechanic', () => {
    for (const warmth of [-10, 0, 19.5, 32, 55, 80, 100]) {
      const line = at(nadia, warmth)
      expect(line).not.toMatch(/warmth|meter|score|level|trajectory|band/i)
      expect(line).not.toMatch(/\b\d{1,3}\s*(?:\/|out of)\s*100\b/)
    }
  })

  it('carries who she is, in every band', () => {
    // Layer 2 is constant. Whatever a character's expression is, it reads the
    // same at 5 and at 85; only how much she gives changes. Read off the
    // persona rather than restated, so a tuning pass moves the character
    // without moving this test — which is the claim, not the value.
    for (const persona of [nadia, alex]) {
      const clause = EXPRESSION_CLAUSE[persona.personality.expression]
      for (const warmth of [5, 32, 60, 85]) {
        expect(at(persona, warmth)).toContain(clause)
      }
    }
  })

  it('has a clause for every expression the schema allows', () => {
    // The table above is only worth reading off if it is total. A new
    // expression with no clause would drop layer 2 out of the steering line
    // silently, and every assertion that reads the table would still pass.
    for (const [expression, clause] of Object.entries(EXPRESSION_CLAUSE)) {
      expect(clause.trim()).not.toBe('')
      const persona = { ...nadia, personality: { ...nadia.personality, expression: expression as typeof nadia.personality.expression } }
      expect(at(persona, 40)).toContain(clause)
    }
  })

  it('sharpens a cold character, and stops above the curve', () => {
    // effectiveSharpness = sharpness + boost * max(0, (30 - warmth) / 30).
    // Nadia's base 20 is mild, but at warmth 0 the boost takes her to 35 — a
    // stranger who is already cold is sharper than a neutral one.
    expect(effectiveSharpness(nadia.personality, 0)).toBeCloseTo(35, 5)
    expect(effectiveSharpness(nadia.personality, 30)).toBe(nadia.personality.sharpness)
    expect(effectiveSharpness(nadia.personality, 90)).toBe(nadia.personality.sharpness)

    // Alex is over the clause threshold cold and stays over it warm, because
    // her base is 75 on its own.
    expect(personalityClauses(alex, 0).join(' ')).toMatch(/cutting/i)
    expect(personalityClauses(alex, 45).join(' ')).toMatch(/cutting/i)
    // Nadia never gets there, at any warmth. The boost sharpens; it does not
    // turn a gentle character into a cutting one.
    for (const warmth of [-20, 0, 15, 30, 60]) {
      expect(personalityClauses(nadia, warmth).join(' ')).not.toMatch(/cutting/i)
    }
  })

  it('names only the behaviours warmth has actually unlocked', () => {
    // Layer 3 is threshold-and-ceiling. Below the threshold the behaviour is not
    // mentioned at all — telling a model what it may not do invites it to think
    // about doing it, and every word is charged on every later turn.
    expect(at(nadia, 20)).not.toMatch(/flirt|his name|start a topic/i)

    // personalDisclosure unlocks at 40, usesYourName at 45.
    expect(at(nadia, 50)).toMatch(/his name|something real about your life/i)
    // flirtiness unlocks at 55, initiatesTopics at 60.
    expect(at(nadia, 65)).toMatch(/flirt|start a topic/i)
  })

  it('keeps a gate shut that is unlocked in name only', () => {
    // Alex's flirtiness has ceiling 0. Even if warmth somehow reached its
    // threshold, a behaviour with no headroom must not be announced.
    const open = { ...alex, gated: { ...alex.gated, flirtiness: { ceiling: 0, unlocksAt: 0 } } }
    expect(gateClauses(open, 45).join(' ')).not.toMatch(/flirt/i)
  })

  it('never unlocks anything Alex is not allowed to do, at her ceiling', () => {
    // She stops at 45, so this is every state she can actually occupy.
    for (let warmth = -20; warmth <= alex.trajectory.hardCeiling; warmth += 1) {
      const line = at(alex, warmth)
      expect(line, `warmth ${warmth}`).not.toMatch(/flirt/i)
      expect(line, `warmth ${warmth}`).not.toMatch(/his name/i)
      expect(line, `warmth ${warmth}`).not.toMatch(/start a topic/i)
    }
    // The one thing she does open up to, barely, at 40.
    expect(unlockedGates(alex.gated, 45)).toEqual(['personalDisclosure'])
    expect(at(alex, 45)).toMatch(/one small true thing/i)
  })

  it('lets the band, and only the band, own reply length', () => {
    // Round 6 had length in the contract AND the band; the two sets of numbers
    // fought and she obeyed neither. `talkativeness` is the personality dial
    // about verbosity and it is deliberately absent from this line.
    const chatty = { ...nadia, personality: { ...nadia.personality, talkativeness: 100 } }
    const terse = { ...nadia, personality: { ...nadia.personality, talkativeness: 0 } }
    const lengthPhrases = /\bwords\b|\bsentence\b/i

    const fromBand = at(nadia, 45).match(lengthPhrases)
    expect(fromBand).not.toBeNull()
    // Both extremes produce the same length instruction: the band's.
    expect(at(chatty, 45).match(lengthPhrases)?.[0]).toBe(fromBand?.[0])
    expect(at(terse, 45).match(lengthPhrases)?.[0]).toBe(fromBand?.[0])
  })

  it('suppresses a question when the session says the quota is spent', () => {
    const line = composeSteering({ persona: nadia, warmth: 70, suppressQuestion: true })
    expect(line).toContain('Do not ask him anything this turn')
  })

  it('stays inside its budget, in every state, for every character', () => {
    // This is re-charged as context on every turn after it is sent. A directive
    // that grows with the persona is a directive that quietly doubles the cost
    // of a long rep.
    //
    // The state space grew with the posture and repair clauses, so this now
    // sweeps every combination against every character on the roster rather
    // than the two ends of the ladder. The worst line in the product before
    // `assemble` existed was 595 characters of stacked imperatives.
    const postures = ['wary', 'at-ease', 'taken', 'polite', 'level'] as const
    for (const persona of Object.values(PERSONAS)) {
      for (let warmth = -20; warmth <= 100; warmth += 1) {
        for (const suppressQuestion of [true, false]) {
          for (const repairOpen of [true, false]) {
            for (const posture of postures) {
              const line = composeSteering({
                persona, warmth, suppressQuestion, repairOpen, posture,
              })
              expect(
                line.length,
                `${persona.name} @ ${warmth} ${posture}${repairOpen ? ' repairing' : ''}`,
              ).toBeLessThanOrEqual(STEERING_BUDGET)
            }
          }
        }
      }
    }
  })

  it('drops the lowest-priority clause rather than truncating the line', () => {
    // Budget pressure must never produce a sentence cut in half, and must never
    // cost the band directive — nothing else owns reply length, and a turn with
    // no length rule is the round-6 failure.
    const crowded = composeSteering({
      persona: erin, warmth: 60, suppressQuestion: true, repairOpen: true, posture: 'taken',
    })
    expect(crowded.startsWith('[')).toBe(true)
    expect(crowded.endsWith(']')).toBe(true)
    expect(crowded).toContain('Under fifteen words')
    // Every clause that survived is a whole sentence.
    const body = crowded.slice(1, -1)
    expect(body.trim().endsWith('.')).toBe(true)
  })

  it('gives her something she wants at every band, including the coldest', () => {
    // THE PERSONHOOD RULE. `initiatesTopics` unlocks at 70 and is unreachable
    // on most of the ladder inside a rep, so without this she is a pure
    // responder for the whole session — which is the most recognisable tell
    // there is. The want is not a reward and is not gated.
    for (const warmth of [-20, 0, 10, 30, 50, 70, 90]) {
      expect(composeSteering({ persona: erin, warmth }), `@${warmth}`)
        .toContain('rather be')
    }
  })

  it('is one bracketed direction, not several', () => {
    // Two bracketed blocks in a row read as two competing instructions.
    for (const warmth of [0, 45, 90]) {
      const line = at(nadia, warmth)
      expect(line.startsWith('[')).toBe(true)
      expect(line.endsWith(']')).toBe(true)
      expect(line.slice(1, -1)).not.toContain('[')
    }
  })
})
