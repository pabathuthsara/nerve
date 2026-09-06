/**
 * The reciprocity gates, tested against the two reps that produced them.
 *
 * `grunt` and the assertions around it are the real last minute of session
 * 528f918f, 6 September 2026 — three grunts answered with self-disclosure, a
 * question and more self-disclosure, at warmth 41. Every assertion there is
 * "what would she have been allowed to do", and the answer used to be "all of
 * it".
 *
 * The `bookshop` block is the rep on the other side of the fix, the same day: a
 * seventeen-turn conversation that peaked at 56, where the answer had become
 * "none of it". Both are regression tests now, and they pull in opposite
 * directions on purpose — that is what a gate is.
 */

import { describe, expect, it } from 'vitest'
import {
  DISCLOSURE_WORDS,
  MIRROR_FLOOR,
  RECIPROCITY_BAND,
  SILENCE_BAND,
  mayAskFor,
  mayStaySilentFor,
  mayVolunteerFor,
  mirrorCapFor,
  reciprocityClauses,
  type UserTurnShape,
} from './reciprocity'
import { BANDS, bandFor, specFor, wordCapFor } from './bands'

const grunt: UserTurnShape = { words: 1, askedQuestion: false, disclosed: false, deadEnd: true }
const shrug: UserTurnShape = { words: 3, askedQuestion: false, disclosed: false, deadEnd: false }
const asked: UserTurnShape = { words: 8, askedQuestion: true, disclosed: true, deadEnd: false }
const told: UserTurnShape = { words: 12, askedQuestion: false, disclosed: true, deadEnd: false }
/** "So, how old are you?" — the shape that exposed the mirror on a question. */
const shortQuestion: UserTurnShape = { words: 5, askedQuestion: true, disclosed: false, deadEnd: false }

describe('the mirror cap — she does not out-talk him', () => {
  it('rewrites the minute that produced this rule', () => {
    // Warmth 41 is OPEN, a twelve-word ceiling. Against "Mhm." she got nine.
    expect(wordCapFor(41)).toBe(12)
    expect(mirrorCapFor(41, grunt)).toBe(MIRROR_FLOOR)
  })

  it('lets a real turn buy a real answer', () => {
    expect(mirrorCapFor(41, told)).toBe(12)
  })

  it('never mirrors a question, however short it is', () => {
    // A question is a request for an answer and brevity is what makes it one.
    // Five words used to buy a seven-word ceiling, which is a stub — and every
    // question in the bookshop rep was five to eight words long.
    expect(mirrorCapFor(41, shortQuestion)).toBe(wordCapFor(41))
    expect(mirrorCapFor(41, asked)).toBe(wordCapFor(41))
    expect(mirrorCapFor(28, shortQuestion)).toBe(wordCapFor(28))
  })

  it('gives a real turn at least one sentence', () => {
    // "I am hungry" is three words and a real thing to say. It bought four.
    const hungry: UserTurnShape = { words: 3, askedQuestion: false, disclosed: false, deadEnd: false }
    const typical = specFor(bandFor(41)).typicalWords
    expect(mirrorCapFor(41, hungry)).toBe(typical)
    expect(typical).toBeGreaterThan(Math.ceil(3 * 1.3))
  })

  it('holds a dead end to the floor, which is below any band typical', () => {
    // The sentence floor is for turns he actually took. A grunt keeps the two.
    for (const spec of BANDS) {
      expect(mirrorCapFor(spec.min, grunt), spec.band).toBe(MIRROR_FLOOR)
    }
  })

  it('can only ever lower the band, never raise it', () => {
    // Warmth still owns how much she gives. This decides whether the turn has
    // earned it. A user monologue must not unlock a longer reply than her band,
    // and neither must a question or the sentence floor.
    const monologue: UserTurnShape = { words: 90, askedQuestion: false, disclosed: true, deadEnd: false }
    for (const spec of BANDS) {
      const cap = wordCapFor(spec.min)
      for (const his of [monologue, grunt, shrug, asked, told, shortQuestion]) {
        expect(mirrorCapFor(spec.min, his), spec.band).toBeLessThanOrEqual(cap)
      }
    }
  })

  it('never produces a fragment', () => {
    const nothing: UserTurnShape = { words: 0, askedQuestion: false, disclosed: false, deadEnd: true }
    expect(mirrorCapFor(41, nothing)).toBe(MIRROR_FLOOR)
    expect(mirrorCapFor(-10, nothing)).toBe(MIRROR_FLOOR)
  })

  it('leaves the opening turn to the band alone', () => {
    // He has not spoken. There is nothing to mirror.
    expect(mirrorCapFor(28, null)).toBe(wordCapFor(28))
  })
})

describe('the question gate — a stranger at 28 does not solicit', () => {
  it('refuses turn one outright', () => {
    // "Hey. What's up?" at warmth 27.9 is the opening line of that rep.
    expect(mayAskFor(28, null)).toBe(false)
  })

  it('opens at the band table’s own floor, not twenty points above it', () => {
    // It was ENGAGED, so a rep that peaked at 56 never asked a single question
    // in seventeen turns. OPEN is where the band starts allowing one back.
    expect(RECIPROCITY_BAND).toBe('OPEN')
    const floor = specFor(RECIPROCITY_BAND).min
    expect(mayAskFor(floor - 1, told)).toBe(false)
    expect(mayAskFor(floor, told)).toBe(true)
    expect(mayAskFor(56, told)).toBe(true)
  })

  it('leaves the SHAPE of the question to the band, at every warmth above it', () => {
    // OPEN says "not unless he asked you one first"; ENGAGED invites one. This
    // gate must not pre-empt either, so it says yes to both and lets the
    // directive decide. One owner for the question rule.
    for (const warmth of [41, 65, 85]) {
      expect(mayAskFor(warmth, asked), `@${warmth}`).toBe(true)
      expect(mayAskFor(warmth, told), `@${warmth}`).toBe(true)
    }
  })

  it('refuses straight after a dead end, at any warmth', () => {
    // She asked one immediately after three of them. A person stops asking.
    for (const warmth of [41, 65, 85, 100]) {
      expect(mayAskFor(warmth, grunt), `@${warmth}`).toBe(false)
    }
  })

  it('needs him to have offered something, not merely avoided a dead end', () => {
    expect(mayAskFor(85, shrug)).toBe(false)
    expect(mayAskFor(85, asked)).toBe(true)
    expect(mayAskFor(85, told)).toBe(true)
  })

  it('reads real disclosure at the same threshold the scorer already uses', () => {
    const short = { ...told, words: DISCLOSURE_WORDS - 1, disclosed: false }
    expect(mayAskFor(85, short)).toBe(false)
    expect(mayAskFor(85, { ...told, words: DISCLOSURE_WORDS })).toBe(true)
  })
})

describe('the volunteer gate — "I like airports too" has to be earned', () => {
  it('agrees with the band that composed the invitation', () => {
    // Warmth 41 is OPEN, and OPEN's own permission is "You may volunteer one
    // small thing." This gate used to veto that clause on the same line.
    expect(bandFor(41)).toBe('OPEN')
    expect(specFor('OPEN').permission).toContain('volunteer')
    expect(mayVolunteerFor(41, told)).toBe(true)
  })

  it('stays shut below OPEN, where the band answers only', () => {
    expect(mayVolunteerFor(specFor(RECIPROCITY_BAND).min - 1, told)).toBe(false)
  })

  it('closes again the moment he stops participating', () => {
    for (const warmth of [41, 65, 85]) {
      expect(mayVolunteerFor(warmth, grunt), `@${warmth}`).toBe(false)
    }
  })
})

describe('silence — the most human thing this product can do', () => {
  it('permits it on exactly the shape that produced the rule', () => {
    expect(mayStaySilentFor(30, grunt)).toBe(true)
  })

  it('never leaves a question unanswered', () => {
    // Ignoring a direct question is rude rather than disengaged, and it is not
    // the signal the user is here to learn to read.
    expect(mayStaySilentFor(30, { ...grunt, askedQuestion: true })).toBe(false)
  })

  it('stops once she is OPEN, where a silence would read as sulking', () => {
    expect(SILENCE_BAND).toBe('GUARDED')
    const ceiling = specFor(SILENCE_BAND).max
    expect(mayStaySilentFor(ceiling, grunt)).toBe(true)
    expect(mayStaySilentFor(ceiling + 1, grunt)).toBe(false)
  })

  it('never fires on a real turn, or before he has spoken', () => {
    expect(mayStaySilentFor(30, told)).toBe(false)
    expect(mayStaySilentFor(30, null)).toBe(false)
  })

  it('cannot fire on his opening turn, because a dead end cannot', () => {
    // "Hey there." is two words. `scoreFast` refuses to call an opener a dead
    // end, and every rule here reads that one flag — so the product can no
    // longer answer the first thing a user ever says with nothing.
    const opener: UserTurnShape = { words: 2, askedQuestion: false, disclosed: false, deadEnd: false }
    expect(mayStaySilentFor(30, opener)).toBe(false)
    expect(reciprocityClauses(30, opener)).toEqual([])
  })

  it('refuses a second silence in a row', () => {
    // Her exit conditions are decided by the model and signalled by finishing
    // a line. A character who never generates can never leave, so a rep of
    // silences would run to the clock with nobody in it.
    expect(mayStaySilentFor(30, grunt, { silentLastTurn: false })).toBe(true)
    expect(mayStaySilentFor(30, grunt, { silentLastTurn: true })).toBe(false)
  })
})

describe('what she is actually told', () => {
  it('says nothing at all on the opening turn', () => {
    expect(reciprocityClauses(28, null)).toEqual([])
  })

  it('tells her to match him when he gives almost nothing', () => {
    expect(reciprocityClauses(65, grunt).join(' ')).toContain('Match it')
  })

  it('is silent on every turn he actually takes', () => {
    // ONE CLAUSE, AND ONLY ON A DEAD END. "Answer what he asked and stop" used
    // to fire on every non-dead-end turn below ENGAGED — fourteen of seventeen
    // in the bookshop rep — while the band directive said the same thing in its
    // own words two clauses earlier. The band owns it.
    for (const warmth of [5, 25, 41, 56, 65, 90]) {
      for (const his of [shrug, asked, told, shortQuestion]) {
        expect(reciprocityClauses(warmth, his), `@${warmth}`).toEqual([])
      }
    }
  })

  it('never says whether she may ask — that belongs to the band directive', () => {
    // One system owns the question rule. `mayAskFor` reaches her through the
    // session's `suppressQuestion`, which the band clause already renders.
    // Two systems specifying one thing is the round-6 failure.
    for (const warmth of [10, 41, 65, 90]) {
      for (const his of [grunt, shrug, asked, told]) {
        expect(reciprocityClauses(warmth, his).join(' '), `@${warmth}`)
          .not.toContain('ask him anything')
      }
    }
  })

  it('never tells her she has nothing to say, because she is never asked to say it', () => {
    // Silence is enforced by making no request (`ReplyState.silent`), so a
    // clause about it could only ever land on a turn she IS speaking on.
    for (const warmth of [5, 30, 41, 65]) {
      for (const his of [grunt, shrug, told]) {
        expect(reciprocityClauses(warmth, his).join(' '), `@${warmth}`)
          .not.toContain('nothing to say')
      }
    }
  })
})

describe('the bookshop rep — seventeen turns, peak 56, nothing permitted', () => {
  /**
   * Warmth 56 with `personalDisclosure` at 40 and three more gates at 45 is
   * Nadia halfway through a rep that is going well. Every one of these was
   * false before, and the transcript reads exactly as that implies: no
   * question in seventeen turns, and every reply a restatement of his own.
   */
  it('lets her ask, volunteer and be told about her gates', () => {
    expect(mayAskFor(56, asked)).toBe(true)
    expect(mayAskFor(56, told)).toBe(true)
    expect(mayVolunteerFor(56, told)).toBe(true)
    expect(reciprocityClauses(56, told)).toEqual([])
  })

  it('still shuts all of it the moment he gives her nothing', () => {
    expect(mayAskFor(56, grunt)).toBe(false)
    expect(mayVolunteerFor(56, grunt)).toBe(false)
    expect(reciprocityClauses(56, grunt).join(' ')).toContain('Match it')
  })
})
