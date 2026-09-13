import { describe, expect, it } from 'vitest'
import { bandFor } from '../bands'
import { textingSpecFor } from './bands'
import {
  PRESSURE_MESSAGES,
  TEXTING_MIRROR_RATIO,
  TEXTING_RECIPROCITY_BAND,
  isPressuring,
  textingMayAsk,
  textingMayVolunteer,
  textingMirrorCap,
  textingReciprocityClauses,
  type TextingTurnShape,
} from './reciprocity'

function his(overrides: Partial<TextingTurnShape> = {}): TextingTurnShape {
  return { words: 12, askedQuestion: false, disclosed: true, deadEnd: false, messages: 1, ...overrides }
}

const COLD = 25
const OPEN = 45
const WARM = 70

describe('it carries no warmth opinion of its own', () => {
  /**
   * `lib/warmth/reciprocity.ts`'s header is the reason this test exists: every
   * dating gate sat on ENGAGED for a day, twenty points above the band it was
   * gating, and won every argument silently.
   */
  it('opens exactly where the band table opens', () => {
    expect(TEXTING_RECIPROCITY_BAND).toBe('OPEN')
    expect(textingSpecFor(TEXTING_RECIPROCITY_BAND).permission).toBeDefined()
  })

  it('is shut at every band the table gives no permission to', () => {
    for (const warmth of [-10, 5, 25, 39]) {
      expect(textingSpecFor(bandFor(warmth)).permission).toBeUndefined()
      expect(textingMayVolunteer(warmth, his())).toBe(false)
    }
  })
})

describe('the mirror cap only ever lowers the band', () => {
  it('never raises it, at any warmth or any length', () => {
    for (const warmth of [-10, 5, 25, 45, 65, 90]) {
      const ceiling = textingSpecFor(bandFor(warmth)).maxWords
      for (const words of [0, 1, 3, 8, 40, 500]) {
        expect(textingMirrorCap(warmth, his({ words }))).toBeLessThanOrEqual(ceiling)
      }
    }
  })

  it('a one-word turn buys a short reply', () => {
    expect(textingMirrorCap(WARM, his({ words: 1, deadEnd: true, disclosed: false }))).toBeLessThan(4)
  })

  it('a question is never mirrored — brevity is what makes it a question', () => {
    const short = his({ words: 4, askedQuestion: true, disclosed: false })
    expect(textingMirrorCap(WARM, short)).toBe(textingSpecFor(bandFor(WARM)).maxWords)
  })

  it('a real turn always buys at least the band typical', () => {
    const spec = textingSpecFor(bandFor(OPEN))
    expect(textingMirrorCap(OPEN, his({ words: 3, deadEnd: false }))).toBeGreaterThanOrEqual(
      Math.min(spec.typicalWords, spec.maxWords),
    )
  })

  it('is tighter than the dating ratio, because both sides are on one screen', () => {
    expect(TEXTING_MIRROR_RATIO).toBeLessThan(1.3)
  })

  it('with no signal at all, the band alone decides', () => {
    expect(textingMirrorCap(OPEN, null)).toBe(textingSpecFor(bandFor(OPEN)).maxWords)
  })
})

describe('pressure — the one thing speech cannot do', () => {
  it('two messages is not pressure; people finish a thought', () => {
    expect(isPressuring(COLD, his({ messages: 2 }))).toBe(false)
    expect(isPressuring(COLD, his({ messages: PRESSURE_MESSAGES }))).toBe(true)
  })

  it('is only pressure when she is not warm — otherwise it is enthusiasm', () => {
    expect(isPressuring(WARM, his({ messages: 5 }))).toBe(false)
    expect(isPressuring(COLD, his({ messages: 5 }))).toBe(true)
  })

  it('shuts the ask and volunteer gates', () => {
    // A question is an invitation to keep going, and extending one to somebody
    // sending his third unanswered message contradicts the signal she is
    // supposed to be giving.
    expect(textingMayAsk(OPEN, his({ messages: 4 }))).toBe(true)
    expect(textingMayAsk(COLD, his({ messages: 4 }))).toBe(false)
  })

  it('outranks the dead-end clause when both are true', () => {
    const clauses = textingReciprocityClauses(COLD, his({ messages: 4, deadEnd: true }))
    expect(clauses).toHaveLength(1)
    expect(clauses[0]).toMatch(/several messages in a row/)
  })
})

describe('the gates', () => {
  it('never open on a dead end', () => {
    expect(textingMayAsk(WARM, his({ deadEnd: true }))).toBe(false)
    expect(textingMayVolunteer(WARM, his({ deadEnd: true }))).toBe(false)
  })

  it('never open with no signal at all', () => {
    expect(textingMayAsk(WARM, null)).toBe(false)
    expect(textingMayVolunteer(WARM, null)).toBe(false)
  })

  it('need something offered, not merely a warm band', () => {
    expect(textingMayAsk(WARM, his({ askedQuestion: false, disclosed: false }))).toBe(false)
    expect(textingMayAsk(WARM, his({ askedQuestion: true, disclosed: false }))).toBe(true)
  })
})

describe('the clause', () => {
  it('emits at most one', () => {
    for (const warmth of [-10, 25, 45, 90]) {
      for (const shape of [his(), his({ deadEnd: true }), his({ messages: 6 }), null]) {
        expect(textingReciprocityClauses(warmth, shape).length).toBeLessThanOrEqual(1)
      }
    }
  })

  it('says nothing when he gave a real turn', () => {
    expect(textingReciprocityClauses(OPEN, his())).toEqual([])
  })
})
