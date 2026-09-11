/**
 * The guided rep — the one place the product puts words in a user's mouth.
 *
 * §05 forbids coaching during a rep and §01 says we never write anybody's
 * lines. `lib/data/guided.ts` is a bounded exception to both, and these tests
 * are what keeps it bounded: one character, six steps, and a guard that refuses
 * rather than trims. If this file goes quiet, the exception has stopped being
 * an exception.
 */

import { describe, expect, it } from 'vitest'
import {
  GUIDED_SCRIPTS,
  MAX_AIM_WORDS,
  MAX_SAY_WORDS,
  TESS_SCRIPT,
  UnsafeGuidedStep,
  assertGuidedStep,
  guidedScriptFor,
  guidedStepFor,
  splitSay,
  type GuidedStep,
} from './guided'
import { MISSIONS, assertNoScript } from './mission'
import { SUB_SCORE_KEYS } from '@/lib/grade/types'
import { PERSONAS } from '@/lib/personas'

const step = (over: Partial<GuidedStep> = {}): GuidedStep => ({
  key: 'opening',
  aim: 'Open early. Rough is fine.',
  say: 'Sunday afternoon in a launderette.',
  why: 'The first ten seconds are the whole skill.',
  ...over,
})

describe('the exception is exactly one character wide', () => {
  it('is claimed by one persona on the roster, and it is Tess', () => {
    const guided = Object.values(PERSONAS).filter((persona) => persona.guided)
    expect(guided.map((persona) => persona.slug)).toEqual(['tess'])
  })

  it('has a script for every guided persona and a persona for every script', () => {
    // The registry carries nine full contracts and none of them belong in a
    // browser bundle, so the screens read `GUIDED_SCRIPTS` by slug instead.
    // These are the two halves of that split, asserted to be one set — adding
    // a flag without a script would ship a screen promising coaching and
    // rendering nothing.
    const flagged = Object.values(PERSONAS).filter((p) => p.guided).map((p) => p.slug).sort()
    expect(Object.keys(GUIDED_SCRIPTS).sort()).toEqual(flagged)
  })

  it('gives everybody else nothing at all', () => {
    for (const persona of Object.values(PERSONAS)) {
      if (persona.guided) continue
      expect(guidedScriptFor(persona.slug), persona.slug).toBeNull()
    }
    expect(guidedScriptFor(null)).toBeNull()
    expect(guidedScriptFor('')).toBeNull()
    expect(guidedScriptFor('nobody')).toBeNull()
  })

  it('leaves `assertNoScript` and every mission untouched', () => {
    // THE GUARD THAT DID NOT MOVE. Relaxing one screen must not relax the other
    // nine, so the mission type keeps its own stricter rule and every mission
    // still passes it.
    for (const mission of Object.values(MISSIONS)) {
      expect(() => assertNoScript(mission), mission.key).not.toThrow()
    }
  })
})

describe('the script teaches what the scorecard grades', () => {
  it('covers all six sub-scores exactly once', () => {
    // The connective tissue `site-audit-openai.md` says the product lacks: what
    // he is told to do and what he is graded on are the same six things.
    expect(TESS_SCRIPT.map((s) => s.key)).toEqual([...SUB_SCORE_KEYS])
  })

  it('passes its own guard, every step', () => {
    for (const s of TESS_SCRIPT) {
      expect(() => assertGuidedStep(s), s.key).not.toThrow()
    }
  })

  it('has no line for composure, and that is the point', () => {
    // Its whole skill is not filling a pause. Handing somebody a sentence to
    // say when the lesson is "say nothing" teaches the opposite.
    const composure = TESS_SCRIPT.find((s) => s.key === 'composure')
    expect(composure?.say).toBeNull()
    expect(composure?.aim).toBeTruthy()
  })

  it('never asks her for anything the format owns', () => {
    // The close is `lib/data/rep-rules.ts`'s and she never speaks digits, so a
    // suggested line that asks for a number is the product fighting itself.
    for (const s of TESS_SCRIPT) {
      expect(`${s.aim} ${s.say ?? ''}`, s.key).not.toMatch(/number|digits|go out|take you out|buy you a/i)
    }
  })
})

describe('the guard refuses rather than trimming', () => {
  it('refuses a line that comments on her appearance', () => {
    // §16, and the merchant-of-record reviewer §14 says opens the site. This is
    // the failure mode that closes a payment account.
    for (const say of ['You look gorgeous today', 'Nice legs', 'You are so hot']) {
      expect(() => assertGuidedStep(step({ say })), say).toThrow(UnsafeGuidedStep)
    }
  })

  it('refuses a pickup line, in the vocabulary a reviewer would search for', () => {
    for (const say of ['Best pickup line I have', 'Want to hook up later', 'Are you single']) {
      expect(() => assertGuidedStep(step({ say })), say).toThrow(UnsafeGuidedStep)
    }
  })

  it('refuses anything that asks her out or asks for contact details', () => {
    for (const say of ['Can I get your number', 'What is your instagram', 'Let me buy you a coffee', 'Email me at a@b.com']) {
      expect(() => assertGuidedStep(step({ say })), say).toThrow(UnsafeGuidedStep)
    }
  })

  it('keeps the aim a direction, exactly as a mission cue is', () => {
    expect(() => assertGuidedStep(step({ aim: 'Say “what is that like”' }))).toThrow(UnsafeGuidedStep)
    expect(() => assertGuidedStep(step({ aim: 'Tell her I am nervous' }))).toThrow(UnsafeGuidedStep)
    const long = Array.from({ length: MAX_AIM_WORDS + 1 }, () => 'word').join(' ')
    expect(() => assertGuidedStep(step({ aim: long }))).toThrow(UnsafeGuidedStep)
  })

  it('refuses a line nobody could read out loud while nervous', () => {
    const long = Array.from({ length: MAX_SAY_WORDS + 1 }, () => 'word').join(' ')
    expect(() => assertGuidedStep(step({ say: long }))).toThrow(UnsafeGuidedStep)
    expect(() => assertGuidedStep(step({ say: '   ' }))).toThrow(UnsafeGuidedStep)
  })

  it('checks the brief copy too, not only what he says', () => {
    // `why` is rendered on the brief, which is as public as anything else.
    expect(() => assertGuidedStep(step({ why: 'Ask if she is single.' }))).toThrow(UnsafeGuidedStep)
  })
})

describe('which step he is on', () => {
  const at = (userTurns: number, agentTurns = userTurns) => ({ userTurns, agentTurns })

  it('starts on the opening before he has said anything', () => {
    expect(guidedStepFor(TESS_SCRIPT, at(0))?.key).toBe('opening')
  })

  it('advances on completed exchanges, never on his turns alone', () => {
    const keys = [0, 1, 2, 3, 4, 6, 7, 12]
      .map((turns) => guidedStepFor(TESS_SCRIPT, at(turns))?.key)
    expect(keys).toEqual([
      'opening', 'curiosity', 'curiosity', 'listening',
      'listening', 'signalReading', 'signalReading', 'composure',
    ])
  })

  it('is still moving in the second half of the rep', () => {
    // THE 11 SEPTEMBER DEFECT. The ladder was [0, 1, 2, 4, 7] against an arm
    // that completes an exchange about every ten seconds, so four of the five
    // steps were spent inside the first seventy seconds and the one with no
    // line held the remaining eighty. A rail that stops changing halfway
    // through a rep does not read as a last lesson; it reads as a broken
    // feature — which is exactly what it was reported as.
    //
    // Asserted as the property rather than as a copy of the table: no step
    // before the close may be reachable at the first exchange except the
    // opening, and the last one before it may not be reachable in the first
    // third of a rep's exchanges.
    const reachableAtOne = TESS_SCRIPT
      .filter((s) => guidedStepFor(TESS_SCRIPT, at(1)) === s)
    expect(reachableAtOne.map((s) => s.key)).toEqual(['curiosity'])
    for (const turns of [0, 1, 2, 3, 4]) {
      expect(guidedStepFor(TESS_SCRIPT, at(turns))?.key, `@${turns}`).not.toBe('composure')
    }
  })

  it('holds the step while she has not answered', () => {
    // THE 6 SEPTEMBER DEFECT. Her first two replies never reached him, and the
    // rail advanced anyway — so step two told him to "follow one answer twice"
    // against a silence that contained no answer. He read it out, and that
    // utterance is what aborted the reply she was still synthesising.
    expect(guidedStepFor(TESS_SCRIPT, { userTurns: 3, agentTurns: 0 })?.key).toBe('opening')
    expect(guidedStepFor(TESS_SCRIPT, { userTurns: 7, agentTurns: 1 })?.key).toBe('curiosity')
  })

  it('never lets her replies walk the script forward on their own', () => {
    // The other half of the same rule: a character who answers twice must not
    // move his step for him.
    expect(guidedStepFor(TESS_SCRIPT, { userTurns: 1, agentTurns: 9 })?.key).toBe('curiosity')
  })

  it('cannot reach the close before the wind-down, however long the rep runs', () => {
    // The close used to sit at six user turns, which the pipeline reaches in
    // about a minute — so the rail told him to leave at 0:63 of a 3:00 rep, he
    // read the line, and the one free rep a new account gets ended at 74
    // seconds. The format already owns that moment; nothing else may.
    for (const turns of [6, 7, 10, 40]) {
      expect(guidedStepFor(TESS_SCRIPT, at(turns))?.key, `@${turns}`).not.toBe('close')
    }
  })

  it('jumps to the close the moment the wind-down starts', () => {
    // Thirty seconds out the only thing worth saying is how to leave. Being
    // told to ask a follow-up here is being coached into the mistake the close
    // scores.
    for (const turns of [0, 1, 3, 5]) {
      expect(guidedStepFor(TESS_SCRIPT, at(turns), { wrapping: true })?.key, `@${turns}`).toBe('close')
    }
    // Including when she has never once replied: the rep is still ending.
    expect(guidedStepFor(TESS_SCRIPT, { userTurns: 4, agentTurns: 0 }, { wrapping: true })?.key)
      .toBe('close')
  })

  it('never returns a step for an empty script', () => {
    expect(guidedStepFor([], at(4))).toBeNull()
  })
})

describe('the blank he has to fill in', () => {
  it('splits a line into what to read and what to supply', () => {
    expect(splitSay('So you are a [her thing] person then.')).toEqual([
      { text: 'So you are a ', slot: false },
      { text: 'her thing', slot: true },
      { text: ' person then.', slot: false },
    ])
  })

  it('leaves a line with no blank in one piece', () => {
    expect(splitSay('What is that like?')).toEqual([{ text: 'What is that like?', slot: false }])
  })

  it('loses nothing, whatever the line', () => {
    // The renderer draws these parts and nothing else, so a split that dropped
    // a character would silently edit a sentence the product puts in somebody's
    // mouth. Round-trips every authored line rather than a contrived one.
    for (const s of TESS_SCRIPT) {
      if (!s.say) continue
      const rebuilt = splitSay(s.say)
        .map((part) => (part.slot ? `[${part.text}]` : part.text))
        .join('')
      expect(rebuilt, s.key).toBe(s.say)
    }
  })

  it('handles a blank at either end', () => {
    expect(splitSay('[x] then.')).toEqual([{ text: 'x', slot: true }, { text: ' then.', slot: false }])
    expect(splitSay('Then [x]')).toEqual([{ text: 'Then ', slot: false }, { text: 'x', slot: true }])
  })
})

describe('what the lines may not coach', () => {
  it('never hands him a line whose honest answer is her leaving', () => {
    // THE 11 SEPTEMBER DEFECT, the content half. `signalReading` read "You look
    // like you are in a hurry." to a woman who has decided to stay until she
    // finds one painting she likes — false in her room, and false in the one
    // direction that costs: `lib/warmth/reciprocity.ts` prices a dead end above
    // what a good question earns, so the single authored line most likely to
    // lose a beginner their first rep was one of ours.
    //
    // A rep is three minutes and every prompt is a thing said to somebody who
    // is choosing whether to stay. None of them may suggest she should not.
    for (const s of TESS_SCRIPT) {
      if (!s.say) continue
      if (s.key === 'close') continue
      expect(s.say, s.key).not.toMatch(/\b(hurry|busy|rush|get going|let you go|in your way|bothering|leave|going)\b/i)
    }
  })
})
