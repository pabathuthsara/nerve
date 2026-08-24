/**
 * The three axes, the temperament that weights them, and what interest does to
 * timing.
 *
 * All three exist for one reason: a single warmth number can only ever be a
 * dimmer switch, and every character on the ladder was moved by identical
 * arithmetic while `personality` sat in the prompt as adjectives.
 */

import { describe, expect, it } from 'vitest'

import { openingAffect, postureClause, postureOf } from './affect'
import { NEUTRAL_TEMPERAMENT, temperamentOf } from './temperament'
import { interruptsAt, paceFor, replyDelayMs, MAX_REPLY_DELAY_MS } from './timing'
import { nadia } from '@/lib/personas/nadia'
import { erin } from '@/lib/personas/erin'
import { alex } from '@/lib/personas/alex'

describe('postureOf', () => {
  it('says nothing when the three agree — the band is the whole story', () => {
    expect(postureOf({ warmth: 50, comfort: 50, liking: 50 })).toBe('level')
    expect(postureClause('level')).toBeNull()
  })

  it('reads interest without ease as wary', () => {
    // The intense stranger: leaning in and holding back at once. Unreachable
    // with one number, and instantly recognisable as a person.
    expect(postureOf({ warmth: 70, comfort: 40, liking: 65 })).toBe('wary')
    expect(postureClause('wary')).toContain('not at ease')
  })

  it('reads ease without interest as at-ease', () => {
    // The nice person you have nothing to say to.
    expect(postureOf({ warmth: 30, comfort: 70, liking: 30 })).toBe('at-ease')
    expect(postureClause('at-ease')).toContain('not interested')
  })

  it('reads liking ahead of the conversation as taken', () => {
    expect(postureOf({ warmth: 40, comfort: 45, liking: 60 })).toBe('taken')
  })

  it('reads the subject holding her more than he does as polite', () => {
    expect(postureOf({ warmth: 60, comfort: 60, liking: 30 })).toBe('polite')
  })

  it('lets discomfort outrank everything', () => {
    // Somebody who is not at ease is not really doing any of the others,
    // whatever the numbers say.
    expect(postureOf({ warmth: 70, comfort: 40, liking: 90 })).toBe('wary')
  })

  it('does not flicker on ordinary turn-to-turn wobble', () => {
    expect(postureOf({ warmth: 50, comfort: 42, liking: 45 })).toBe('level')
    expect(postureOf({ warmth: 50, comfort: 58, liking: 55 })).toBe('level')
  })
})

describe('openingAffect', () => {
  it('opens comfort well above a cold trajectory', () => {
    // A stranger in a public place is not hostile, they are unavailable. That
    // is the difference between "no" and "not you", and it is what gives
    // overreach something to cost on level 1 as well as level 8.
    const cold = openingAffect(5)
    expect(cold.comfort).toBeGreaterThan(cold.warmth + 20)
  })

  it('opens liking below interest, because that decision takes longer', () => {
    const opening = openingAffect(32)
    expect(opening.liking).toBeLessThan(opening.warmth)
  })

  it('never opens a negative liking', () => {
    expect(openingAffect(2).liking).toBeGreaterThanOrEqual(0)
  })
})

describe('temperamentOf', () => {
  it('is neutral when a character has no personality attached', () => {
    expect(temperamentOf(undefined)).toEqual(NEUTRAL_TEMPERAMENT)
  })

  it('makes a patient character charge less for a nervous turn', () => {
    // THE NERVOUSNESS QUESTION, answered per character. Our user is nervous by
    // definition and short replies are the symptom the product treats, so
    // whether she softens or hardens has to be a property of her.
    expect(temperamentOf(nadia.personality).penalty).toBeLessThan(1)
    expect(temperamentOf(alex.personality).penalty).toBeGreaterThan(1)
  })

  it('makes a distracted character harder to reach with a generic turn', () => {
    expect(temperamentOf(erin.personality).genericGain)
      .toBeLessThan(temperamentOf(nadia.personality).genericGain)
  })

  it('makes a funny character warm to him faster than a flat one', () => {
    expect(temperamentOf(nadia.personality).liking)
      .toBeGreaterThan(temperamentOf(alex.personality).liking)
  })

  it('keeps every multiplier inside a band that cannot re-tune the ladder', () => {
    for (const persona of [nadia, erin, alex]) {
      const t = temperamentOf(persona.personality)
      expect(t.penalty).toBeGreaterThanOrEqual(0.7)
      expect(t.penalty).toBeLessThanOrEqual(1.3)
      expect(t.genericGain).toBeGreaterThanOrEqual(0.75)
      expect(t.genericGain).toBeLessThanOrEqual(1.2)
    }
  })
})

describe('replyDelayMs', () => {
  it('makes a cold character take a beat before answering', () => {
    // People read interest from timing before they read it from words.
    expect(replyDelayMs(0)).toBe(MAX_REPLY_DELAY_MS)
    expect(replyDelayMs(-20)).toBe(MAX_REPLY_DELAY_MS)
  })

  it('disappears once she is actually engaged', () => {
    expect(replyDelayMs(60)).toBe(0)
    expect(replyDelayMs(90)).toBe(0)
  })

  it('tapers, so warming up is audible before she says anything different', () => {
    expect(replyDelayMs(30)).toBeGreaterThan(replyDelayMs(45))
    expect(replyDelayMs(45)).toBeGreaterThan(0)
  })

  it('never spends more of the latency budget than a real pause', () => {
    for (let warmth = -20; warmth <= 100; warmth += 1) {
      expect(replyDelayMs(warmth)).toBeLessThanOrEqual(MAX_REPLY_DELAY_MS)
      expect(replyDelayMs(warmth)).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('interruptsAt', () => {
  it('cannot override §05 — levels 1-4 never interrupt, at any warmth', () => {
    for (const warmth of [-20, 0, 50, 80, 100]) {
      expect(interruptsAt(warmth, false)).toBe(false)
    }
  })

  it('makes interruption a sign of interest rather than of the rung', () => {
    // A bored stranger does not cut across you. She waits, and then leaves.
    expect(interruptsAt(20, true)).toBe(false)
    expect(interruptsAt(80, true)).toBe(true)
  })
})

describe('paceFor', () => {
  it('leans, and never becomes a different voice', () => {
    const cold = paceFor(1, 0)
    const warm = paceFor(1, 100)
    expect(cold).toBeLessThan(1)
    expect(warm).toBeGreaterThan(1)
    expect(Math.abs(warm - cold)).toBeLessThan(0.15)
  })

  it('stays inside what the provider will accept', () => {
    expect(paceFor(1.5, 100)).toBeLessThanOrEqual(1.5)
    expect(paceFor(0.25, -20)).toBeGreaterThanOrEqual(0.25)
  })
})
