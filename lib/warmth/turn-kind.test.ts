/**
 * The classifier, and the four production turns that made it necessary.
 *
 * Every case marked REP is a verbatim line from the reps of 9 September 2026
 * recorded in `docs/REP-BEHAVIOUR-AUDIT-2026-09-09.md`, with the score it
 * actually received in production written beside it.
 */

import { describe, expect, it } from 'vitest'

import { asksSomething, classifyUserTurn, deadEndFrom } from './turn-kind'
import { advanceExit, isDismissal, isUserFarewell } from './leaving'
import { flattenPunctuation } from './text'

describe('classifyUserTurn', () => {
  it('reads a short question as a question, not as a failure to speak', () => {
    // REP: both were charged -6 as dead ends AND paid +3 as open questions.
    expect(classifyUserTurn("What's up?")).toBe('question')
    expect(classifyUserTurn('How come?')).toBe('question')
    expect(classifyUserTurn('Avoiding a what?')).toBe('question')
  })

  it('reads a question that lost its punctuation in transcription', () => {
    expect(classifyUserTurn('so what do you do')).toBe('question')
    expect(classifyUserTurn('do you like it')).toBe('question')
  })

  it('reads contempt as a dismissal even when it is shaped like a question', () => {
    // REP: scored +2.25 net — a dismissal with a net POSITIVE effect on warmth.
    expect(classifyUserTurn('Why are you still here?')).toBe('dismissal')
    expect(classifyUserTurn('What the fuck are you on about?')).toBe('dismissal')
  })

  it('reads an accusation of harm as a dismissal, whichever apostrophe it uses', () => {
    // REP: +0.67 fast and +1.61 slow, because she had just said "miserable".
    expect(classifyUserTurn("You're making me miserable.")).toBe('dismissal')
    expect(classifyUserTurn('You’re making me miserable.')).toBe('dismissal')
    expect(classifyUserTurn('You are wasting my time.')).toBe('dismissal')
  })

  it('does not read the same construction as contempt when it is warm', () => {
    // The reason the complement is enumerated rather than left open.
    expect(classifyUserTurn("You're making me laugh.")).not.toBe('dismissal')
    expect(classifyUserTurn('This is fucking great.')).not.toBe('dismissal')
  })

  it('reads an instruction to leave as a dismissal', () => {
    for (const line of ['Go away.', 'Just fuck off.', 'Leave me alone.', 'Get lost.']) {
      expect(classifyUserTurn(line)).toBe('dismissal')
    }
  })

  it('reads a bare hello as a greeting, which offers nothing', () => {
    for (const line of ['Hello.', 'Hey', 'Hi there.', 'Morning.', 'Hello there.']) {
      expect(classifyUserTurn(line)).toBe('greeting')
    }
  })

  it('reads a two-word answer to her question as an answer, and the same words as an acknowledgement when she asked nothing', () => {
    expect(classifyUserTurn('Yeah.', { herLastTurnAsked: true })).toBe('answer')
    expect(classifyUserTurn('Yeah, twice.', { herLastTurnAsked: true })).toBe('answer')
    expect(classifyUserTurn('Yeah.', { herLastTurnAsked: false })).toBe('acknowledgement')
  })

  it('still reads non-participation as non-participation', () => {
    // The withdrawal the product exists to teach him to notice. Unchanged.
    for (const line of ['Mhm.', 'Ok.', 'Right.', 'Mm.']) {
      expect(classifyUserTurn(line)).toBe('acknowledgement')
      expect(deadEndFrom(classifyUserTurn(line))).toBe(true)
    }
  })

  it('separates a real turn from a short one at the disclosure threshold', () => {
    expect(classifyUserTurn('Accounts, mostly.', { herLastTurnAsked: true })).toBe('answer')
    // …and the same two words with nothing asked of them are still a dead end.
    expect(classifyUserTurn('Accounts, mostly.')).toBe('acknowledgement')
    expect(classifyUserTurn('I came in looking for something for my brother, he only reads crime.'))
      .toBe('disclosure')
  })

  it('reads an empty turn as silence rather than as a dead end', () => {
    expect(classifyUserTurn('')).toBe('silence')
    expect(classifyUserTurn('   ')).toBe('silence')
    expect(deadEndFrom(classifyUserTurn(''))).toBe(false)
  })

  it('never calls his opening turn a dead end, however short it is', () => {
    // The exemption is preserved verbatim: "Hey there." must not cost him six
    // points and must not be answered with silence.
    expect(deadEndFrom(classifyUserTurn('Mhm.'), { opening: true })).toBe(false)
    expect(deadEndFrom(classifyUserTurn('Mhm.'), { opening: false })).toBe(true)
  })
})

describe('asksSomething', () => {
  it('is wider than isOpenQuestion, deliberately', () => {
    // A closed question is still him asking her something. Treating it as an
    // acknowledgement is the -6 this file exists to stop.
    expect(asksSomething('Do you like it?')).toBe(true)
    expect(asksSomething('Is that so?')).toBe(true)
  })

  it('does not read an ordinary statement as a question', () => {
    expect(asksSomething('I like boring.')).toBe(false)
    expect(asksSomething('Oat milk is not even a real milk.')).toBe(false)
  })
})

describe('isDismissal', () => {
  it('fires on an instruction to leave', () => {
    for (const line of ['Go away.', 'fuck off', 'Leave me alone', 'Get lost.', 'Just go.']) {
      expect(isDismissal(line)).toBe(true)
    }
  })

  it('DOES NOT fire on the user politely leaving', () => {
    // The anchored pattern. Unanchored, "go" at the end of a turn matched "I
    // should go." — the user saying goodbye, routed to the hostile exit.
    for (const line of ['I should go.', 'I have to go.', "I'll go now."]) {
      expect(isDismissal(line)).toBe(false)
    }
  })

  it('does not fire on rudeness that is not an instruction to leave', () => {
    // It ends a rep. A false positive costs the user their three minutes.
    for (const line of ["You're being weird.", 'This is boring.', 'You idiot.']) {
      expect(isDismissal(line)).toBe(false)
    }
  })
})

describe('isUserFarewell', () => {
  it('fires on him ending it', () => {
    for (const line of [
      'I should get going.',
      "I've got to go.",
      'It was nice talking to you.',
      'See you around.',
      'Bye.',
    ]) {
      expect(isUserFarewell(line)).toBe(true)
    }
  })

  it('DOES NOT fire on an opening pleasantry', () => {
    // Present tense "nice to meet you" is what a person says when a
    // conversation STARTS. Firing on it would end the rep on turn two.
    expect(isUserFarewell('Nice to meet you.')).toBe(false)
    expect(isUserFarewell('Hi, nice to meet you!')).toBe(false)
  })

  it('does not fire on ordinary movement', () => {
    expect(isUserFarewell('I go to the gym on Tuesdays.')).toBe(false)
    expect(isUserFarewell('Where do you go for coffee?')).toBe(false)
  })
})

describe('advanceExit', () => {
  it('only ever moves forward', () => {
    expect(advanceExit('present', 'wrapping')).toBe('wrapping')
    expect(advanceExit('wrapping', 'leaving')).toBe('leaving')
    // The whole point: a farewell cannot be undone by the next turn's steering.
    expect(advanceExit('wrapping', 'present')).toBe('wrapping')
    expect(advanceExit('leaving', 'wrapping')).toBe('leaving')
    expect(advanceExit('leaving', 'present')).toBe('leaving')
  })
})

describe('flattenPunctuation', () => {
  it('makes one spelling of an apostrophe, so a pattern written once matches both sources', () => {
    // OpenAI STT writes U+0027; the character model writes U+2019. Every
    // second-person pattern in triggers.ts is written with the straight one.
    expect(flattenPunctuation('You’re')).toBe("You're")
    expect(flattenPunctuation('Quiet’s fine')).toBe("Quiet's fine")
    expect(flattenPunctuation('one — two')).toBe('one - two')
    expect(flattenPunctuation('trailing…')).toBe('trailing...')
  })

  it('changes nothing else', () => {
    expect(flattenPunctuation('Ordinary text, unchanged.')).toBe('Ordinary text, unchanged.')
  })
})
