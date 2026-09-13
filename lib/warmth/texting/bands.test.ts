import { describe, expect, it } from 'vitest'
import { BAND_NAMES, bandFor } from '../bands'
import {
  MAX_TEXTING_BAND_WORDS,
  TEXTING_BANDS,
  textingBandParts,
  textingPermissionParts,
  textingSentenceCapFor,
  textingSpecFor,
  textingWordCapFor,
} from './bands'

/** The numbers the directives spell out, so the prose can be checked. */
const WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, eighteen: 18, twenty: 20, 'twenty-four': 24,
}

describe('the table covers the ladder', () => {
  it('has exactly one spec per band, in order', () => {
    expect(TEXTING_BANDS.map((spec) => spec.band)).toEqual(BAND_NAMES)
  })

  it('selects through the shared bandFor, with no second set of thresholds', () => {
    expect(textingSpecFor(bandFor(-20)).band).toBe('HOSTILE')
    expect(textingSpecFor(bandFor(19.5)).band).toBe('CLOSED')
    expect(textingSpecFor(bandFor(39.5)).band).toBe('GUARDED')
    expect(textingSpecFor(bandFor(100)).band).toBe('INVESTED')
  })
})

describe('the prose and the enforced ceiling cannot drift apart', () => {
  /**
   * PERSONA-AUDIT §12, applied to a third table. A stated maximum that is only
   * ever hoped for is not a maximum, and a stated maximum that disagrees with
   * the enforced one is worse: the model writes to the number it is given and
   * the trimmer cuts at a different one.
   */
  for (const spec of TEXTING_BANDS) {
    it(`${spec.band} states its own ceiling of ${spec.maxWords}`, () => {
      const match = spec.directive.match(/([\w-]+) at the very most/i)
      expect(match, `${spec.band} must state "N at the very most"`).toBeTruthy()
      expect(WORDS[match![1]!.toLowerCase()]).toBe(spec.maxWords)
    })

    it(`${spec.band} leads with its typical, not its ceiling`, () => {
      // A text model writes to whichever number it is given first.
      const lead = spec.directive.match(/^([\w-]+)/)![1]!.toLowerCase()
      expect(WORDS[lead]).toBe(spec.typicalWords)
    })

    it(`${spec.band}'s typical is at or below its ceiling`, () => {
      expect(spec.typicalWords).toBeLessThanOrEqual(spec.maxWords)
    })
  }
})

describe('the curve is texting-shaped', () => {
  it('climbs monotonically in both caps', () => {
    for (let i = 1; i < TEXTING_BANDS.length; i += 1) {
      expect(TEXTING_BANDS[i]!.maxWords).toBeGreaterThanOrEqual(TEXTING_BANDS[i - 1]!.maxWords)
      expect(TEXTING_BANDS[i]!.maxSentences).toBeGreaterThanOrEqual(TEXTING_BANDS[i - 1]!.maxSentences)
    }
  })

  it('is shorter than the dating table at the cold end', () => {
    // "ok" is a complete, ordinary text message. Speech has no equivalent.
    expect(textingSpecFor('CLOSED').maxWords).toBeLessThan(8)
  })

  it('is longer than the dating table at the warm end', () => {
    // Somebody enjoying a thread sends two lines at once.
    expect(textingSpecFor('INVESTED').maxWords).toBeGreaterThan(15)
  })

  it('controls tone with punctuation at the cold end and lower case at the warm', () => {
    expect(textingSpecFor('CLOSED').directive).toMatch(/full stop/i)
    expect(textingSpecFor('ENGAGED').directive).toMatch(/lower case/i)
  })
})

describe('no band ever mentions leaving', () => {
  /**
   * `lib/warmth/leaving.ts`'s header is the reason: the dating table ships
   * "You are not going yet." at 20-59, so on the turn after "just fuck off"
   * the most recent instruction she had was that she was staying. Going is a
   * STATE here and never a band's opinion.
   */
  for (const spec of TEXTING_BANDS) {
    it(`${spec.band} says nothing about staying or going`, () => {
      const prose = `${spec.directive} ${spec.permission ?? ''}`
      expect(prose).not.toMatch(/\b(?:going|leave|leaving|stay|staying)\b/i)
    })
  }
})

describe('the cadence split', () => {
  it('cold bands invite nothing', () => {
    expect(textingSpecFor('HOSTILE').permission).toBeUndefined()
    expect(textingSpecFor('CLOSED').permission).toBeUndefined()
    expect(textingSpecFor('GUARDED').permission).toBeUndefined()
  })

  it('a permission is withheld when standing orders are not riding', () => {
    expect(textingPermissionParts(50, { includeStanding: false })).toEqual([])
    expect(textingPermissionParts(50, {})).toHaveLength(1)
  })

  it('the length rule ships on every turn regardless', () => {
    expect(textingBandParts(50, { includeStanding: false })).toHaveLength(1)
  })

  it('suppressQuestion is not restated where the band already forbids it', () => {
    expect(textingBandParts(10, { suppressQuestion: true })).toHaveLength(1)
    expect(textingBandParts(50, { suppressQuestion: true })).toHaveLength(2)
  })
})

describe('the ceilings the trimmer reads', () => {
  it('returns the band spec it selected', () => {
    expect(textingWordCapFor(50)).toBe(textingSpecFor('OPEN').maxWords)
    expect(textingSentenceCapFor(50)).toBe(textingSpecFor('OPEN').maxSentences)
  })

  it('MAX_TEXTING_BAND_WORDS is the widest band, derived rather than authored', () => {
    expect(MAX_TEXTING_BAND_WORDS).toBe(Math.max(...TEXTING_BANDS.map((s) => s.maxWords)))
  })
})
