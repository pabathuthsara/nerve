/**
 * Trigger tests. No network — the whole point of the pre-filter is that it
 * decides without one.
 */

import { describe, expect, it } from 'vitest'
import {
  BASELINE_EVERY_N_TURNS,
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
