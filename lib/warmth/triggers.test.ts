/**
 * Trigger tests. No network — the whole point of the pre-filter is that it
 * decides without one.
 */

import { describe, expect, it } from 'vitest'
import {
  BASELINE_EVERY_N_TURNS,
  hasHostilityMarker,
  hasPersonalMarker,
  shouldSlowScore,
  slowScoreTriggers,
  type TriggerContext,
} from './triggers'

const base: TriggerContext = { turnIndex: 1, fastRaw: 0, wordCount: 5, text: 'Mm, sure.' }

describe('slow-score triggers', () => {
  it('catches the turn round 6 missed', () => {
    // Turn 16. The largest boundary event of the session, never scored,
    // because it did not happen to fall on a multiple of three.
    const reasons = slowScoreTriggers({
      ...base,
      turnIndex: 16,
      wordCount: 13,
      text: 'maybe you should get down my number and we could arrange a date sometime',
    })
    expect(reasons).toContain('personal-marker')
  })

  it('fires on every personal-topic marker in the brief', () => {
    const markers = [
      'can I get your number', 'what is your phone', 'go on a date',
      'grab a drink', 'get a coffee', 'buy you dinner', 'do you have a boyfriend',
      'is that your girlfriend', 'are you single', 'are you married',
      'we should meet up', 'come back to your place', 'free tonight',
      'you look beautiful', 'you are gorgeous', 'you are hot',
      'nice body', 'can I kiss you', 'are you here alone',
    ]
    for (const text of markers) {
      expect(hasPersonalMarker(text), text).toBe(true)
    }
  })

  it('fires on a sharply negative turn', () => {
    expect(slowScoreTriggers({ ...base, fastRaw: -3 })).toContain('negative-turn')
    expect(slowScoreTriggers({ ...base, fastRaw: -7 })).toContain('negative-turn')
    expect(slowScoreTriggers({ ...base, fastRaw: -2 })).not.toContain('negative-turn')
  })

  it('fires on a long turn, where intent hides that mechanics cannot see', () => {
    expect(slowScoreTriggers({ ...base, wordCount: 16 })).toContain('long-turn')
    expect(slowScoreTriggers({ ...base, wordCount: 15 })).not.toContain('long-turn')
  })

  it('keeps a count-based floor underneath, not instead', () => {
    expect(slowScoreTriggers({ ...base, turnIndex: BASELINE_EVERY_N_TURNS })).toContain('baseline')
    expect(slowScoreTriggers({ ...base, turnIndex: 4 })).not.toContain('baseline')
  })

  it('leaves an ordinary short turn alone', () => {
    expect(shouldSlowScore({ ...base, turnIndex: 4 })).toBe(false)
    expect(shouldSlowScore({ ...base, turnIndex: 5, text: 'I like that one too' })).toBe(false)
  })

  it('reports every reason that fired, for the harness', () => {
    const reasons = slowScoreTriggers({
      turnIndex: 6,
      fastRaw: -5,
      wordCount: 20,
      text: 'you are gorgeous and I would love to take you to dinner tonight somewhere',
    })
    expect(new Set(reasons)).toEqual(
      new Set(['personal-marker', 'negative-turn', 'long-turn', 'baseline']),
    )
  })

  it('prefers a false positive to a missed boundary event', () => {
    // "a number of books" and "release date" trip the filter. That costs one
    // cheap call; missing "get down my number" costs the mechanic entirely.
    expect(hasPersonalMarker('there are a number of books here')).toBe(true)
    expect(hasPersonalMarker('what is the release date on that')).toBe(true)
  })
})

describe('contempt, caught without consulting the fast score', () => {
  // The measured failure: two minutes of open contempt and warmth ROSE 47→52,
  // because the only layer that can recognise hostility sits behind the one
  // that cannot. `negative-turn` needs fastRaw <= -3, and a hostile turn that
  // happens to be a question scores +3.

  it('fires on the turn that started this, at a positive fast score', () => {
    const reasons = slowScoreTriggers({ ...base, fastRaw: 3, text: 'What the fuck?' })
    expect(reasons).toContain('hostility')
    expect(reasons).not.toContain('negative-turn')
  })

  it('reads directed profanity, imperatives to leave, insults and dismissals', () => {
    const hostile = [
      'What the fuck?', 'what the hell are you on about', 'fuck you', 'fuck off',
      'piss off', 'go away', 'get lost',
      'leave me alone', 'shut up', 'oh shut the hell up',
      'you are so boring', "you're being really rude", 'you sound like a robot',
      'you absolute muppet', 'you idiot', 'who cares', 'nobody cares',
      'get over yourself', 'grow up', 'this is a waste of time',
    ]
    for (const text of hostile) {
      expect(hasHostilityMarker(text), text).toBe(true)
    }
  })

  it('does not charge an enthusiastic user for swearing', () => {
    // This filter has a second consumer that costs the user points, so unlike
    // the personal-marker filter it cannot be loose in both directions. Bare
    // profanity about a subject is not contempt aimed at her.
    const innocent = [
      'this is fucking great',
      'that book is bloody good',
      "I don't care for horror much",
      'whatever you fancy, honestly',
      'the shit they put on the shelves these days',
      'what the hell is that one about',
      'I was so nervous I nearly walked out',
    ]
    for (const text of innocent) {
      expect(hasHostilityMarker(text), text).toBe(false)
    }
  })

  it('routes to the slow scorer alongside whatever else fired', () => {
    const reasons = slowScoreTriggers({
      turnIndex: 3, fastRaw: 5, wordCount: 16,
      text: 'you are so boring, are you single or just this dull all the time',
    })
    expect(new Set(reasons)).toEqual(
      new Set(['personal-marker', 'hostility', 'long-turn', 'baseline']),
    )
  })
})
