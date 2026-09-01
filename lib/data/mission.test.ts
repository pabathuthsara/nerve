import { describe, expect, it } from 'vitest'
import { FIRST_MISSION, MISSIONS, assertNoScript, isMissionKey, missionFor, type Mission, type MissionKey } from './mission'
import { SUB_SCORE_LABELS } from './scorecard'

const keys = Object.keys(MISSIONS) as MissionKey[]

describe('the mission catalogue', () => {
  it('covers all six §07 dimensions and nothing else', () => {
    // A seventh mission would be a dimension the scorecard cannot produce, so
    // it could be authored and then never once be shown to anybody.
    expect(keys.sort()).toEqual(['close', 'composure', 'curiosity', 'listening', 'opening', 'signalReading'].sort())
  })

  it('names its target in the scorecard’s own words', () => {
    // The mission and the row it came from have to be recognisably the same
    // thing, or the connective tissue is a coincidence rather than a link.
    for (const key of keys) {
      expect(MISSIONS[key].target, key).toBe(SUB_SCORE_LABELS[key])
    }
  })

  it('never defines success as an outcome (§07)', () => {
    // The one rule the whole product is built on. A mission that said "she
    // gave you her number" would put outcome back into the loop through the
    // side door, on the screen read immediately before speaking.
    for (const key of keys) {
      expect(MISSIONS[key].doneWhen.toLowerCase(), key).not.toMatch(/\bnumber\b|\bwon\b|\bsucceed(ed)?\b|\bagreed\b/)
    }
  })

  it('keeps the live-rep line short enough to read mid-conversation', () => {
    // §05 rule 6 allows a mission on the live screen and nothing else. A line
    // long enough to need reading is coaching, which is not allowed.
    for (const key of keys) {
      expect(MISSIONS[key].inRep.split(/\s+/).length, key).toBeLessThanOrEqual(5)
    }
  })

  it('gives every mission three cues', () => {
    for (const key of keys) {
      expect(MISSIONS[key].cues.length, key).toBe(3)
    }
  })
})

describe('missionFor', () => {
  it('takes the weakest sub-score, which is what focus is ordered by', () => {
    expect(missionFor(['listening', 'composure']).key).toBe('listening')
  })

  it('falls back to opening when nothing has been graded yet', () => {
    // The ordinary first answer, not an error: a brand-new account has no
    // scorecard, and the first rep's only real failure is not speaking.
    expect(missionFor([]).key).toBe('opening')
    expect(missionFor(null).key).toBe('opening')
    expect(missionFor(undefined)).toBe(FIRST_MISSION)
  })

  it('skips a key the grader invented rather than throwing', () => {
    // A model returning a sub-score this codebase does not have must not take
    // the Train screen down with it.
    expect(missionFor(['vibes', 'composure']).key).toBe('composure')
    expect(missionFor(['vibes']).key).toBe('opening')
  })

  it('recognises only real keys', () => {
    expect(isMissionKey('signalReading')).toBe(true)
    expect(isMissionKey('signal_reading')).toBe(false)
    expect(isMissionKey(null)).toBe(false)
  })
})

describe('a mission never hands over a line', () => {
  it('passes every authored mission', () => {
    // The catalogue is the thing being guarded. If this fails, somebody wrote
    // a script into the one screen positioned to turn this into a reply
    // generator — which the landing page tells the world it is not.
    for (const key of keys) {
      expect(() => assertNoScript(MISSIONS[key]), key).not.toThrow()
    }
  })

  const base: Mission = MISSIONS.listening

  it('refuses a quotation, because quotes read as “say this”', () => {
    expect(() => assertNoScript({ ...base, objective: 'Try "so what got you into that?"' })).toThrow(/quotation/)
  })

  it('refuses the first person, which is a script wearing a hint’s clothes', () => {
    expect(() => assertNoScript({ ...base, inRep: 'I noticed you were reading' })).toThrow(/first person/)
  })

  it('refuses a cue long enough to be read out loud', () => {
    expect(() =>
      assertNoScript({ ...base, cues: ['Ask her what she thought of the ending of that book'] }),
    ).toThrow(/read out loud/)
  })

  it('allows a direction that points without speaking', () => {
    expect(() => assertNoScript({ ...base, cues: ['Notice the room', 'Offer an opinion'] })).not.toThrow()
  })
})
