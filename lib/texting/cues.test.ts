import { describe, expect, it } from 'vitest'
import { MISSIONS } from '@/lib/data/mission'
import {
  TEXTING_CUES,
  TEXTING_MISSION,
  activeCueIndex,
  assertTextingCues,
  railVisible,
  textingCueRail,
} from './cues'

describe('directions, never lines', () => {
  it('passes the same guard every mission passes', () => {
    // The boundary is enforced in code rather than trusted to whoever writes
    // the next cue. `assertNoScript` refuses a quotation, the first person, and
    // anything long enough to read out loud.
    expect(() => assertTextingCues()).not.toThrow()
  })

  it('is not a copy of the dating missions', () => {
    // "Notice the room" is not advice about a thread. Texting is its own
    // section with its own skills.
    const dating = Object.values(MISSIONS).flatMap((mission) => mission.cues)
    for (const cue of TEXTING_CUES) expect(dating).not.toContain(cue)
  })

  it('never puts words in his mouth', () => {
    for (const cue of TEXTING_CUES) {
      expect(cue).not.toMatch(/["“”']/)
      expect(cue.split(/\s+/).length).toBeLessThanOrEqual(6)
    }
  })
})

describe('the rail moves on HIS messages', () => {
  it('points at exactly one cue, always', () => {
    for (let messages = 0; messages < 30; messages += 1) {
      const rail = textingCueRail(messages)
      expect(rail.filter((cue) => cue.active)).toHaveLength(1)
    }
  })

  it('advances through the three and then holds', () => {
    expect(activeCueIndex(0)).toBe(0)
    expect(activeCueIndex(1)).toBe(0)
    expect(activeCueIndex(2)).toBe(1)
    expect(activeCueIndex(4)).toBe(2)
    expect(activeCueIndex(40)).toBe(2)
  })

  it('marks the ones already passed', () => {
    expect(textingCueRail(9).filter((cue) => cue.done)).toHaveLength(2)
  })
})

describe('when it is drawn', () => {
  it('never before the first message', () => {
    expect(railVisible(false, false)).toBe(false)
  })

  it('never after she has gone', () => {
    // A direction about a conversation that cannot be continued is advice about
    // a thing that cannot be done.
    expect(railVisible(true, true)).toBe(false)
  })

  it('during a live thread', () => {
    expect(railVisible(true, false)).toBe(true)
  })
})

describe('the mission shape', () => {
  it('carries a target the rail can label itself with', () => {
    expect(TEXTING_MISSION.target.length).toBeGreaterThan(0)
    expect(TEXTING_MISSION.cues).toEqual([...TEXTING_CUES])
  })
})
