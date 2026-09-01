import { describe, expect, it } from 'vitest'
import { activeCueIndex, cueRail, railVisible } from './cues'
import { MISSIONS, assertNoScript } from '@/lib/data/mission'

describe('which cue is being pointed at', () => {
  it('opens on the arriving cue and stays there for the first turn', () => {
    expect(activeCueIndex(0)).toBe(0)
    expect(activeCueIndex(1)).toBe(0)
  })

  it('moves to the middle cue once she has given you something', () => {
    expect(activeCueIndex(2)).toBe(1)
    expect(activeCueIndex(3)).toBe(1)
  })

  it('settles on the last cue once a conversation exists', () => {
    expect(activeCueIndex(4)).toBe(2)
    expect(activeCueIndex(40)).toBe(2)
  })

  it('never runs off the end of a shorter rail', () => {
    expect(activeCueIndex(40, 2)).toBe(1)
    expect(activeCueIndex(40, 1)).toBe(0)
    expect(activeCueIndex(40, 0)).toBe(0)
  })
})

describe('the rail', () => {
  it('marks exactly one cue active, whatever the turn count', () => {
    for (const turns of [0, 1, 2, 3, 4, 9, 50]) {
      const rail = cueRail(MISSIONS.listening, turns)
      expect(rail.filter((cue) => cue.active).length, `turns=${turns}`).toBe(1)
    }
  })

  it('marks everything before the active one as done, and nothing after', () => {
    const rail = cueRail(MISSIONS.listening, 3)
    expect(rail.map((cue) => cue.done)).toEqual([true, false, false])
    expect(rail.map((cue) => cue.active)).toEqual([false, true, false])
  })

  it('carries the mission’s own words and authors none of its own', () => {
    // The connective tissue: what text mode points at is the same objective
    // the scorecard set. A second vocabulary here would be a second product.
    expect(cueRail(MISSIONS.composure, 0).map((cue) => cue.text)).toEqual([...MISSIONS.composure.cues])
  })

  it('never contains a line to say, for any mission', () => {
    // The rail is the surface most likely to drift into scripting, because it
    // sits directly above the box you type into. The guard is the mission's.
    for (const mission of Object.values(MISSIONS)) {
      expect(() => assertNoScript(mission), mission.key).not.toThrow()
      for (const cue of cueRail(mission, 2)) {
        expect(cue.text, mission.key).not.toMatch(/["“”?]/)
      }
    }
  })
})

describe('when the rail is drawn', () => {
  it('stays away until the first thing has been said', () => {
    // `text-screens.tsx`: "Saying the first thing is the skill being trained."
    // The empty state gets no help at all, and that is deliberate.
    expect(railVisible(false, false)).toBe(false)
  })

  it('appears once a conversation exists', () => {
    expect(railVisible(true, false)).toBe(true)
  })

  it('goes away when she has gone', () => {
    // A direction about a conversation that has ended is advice about
    // something that can no longer be done.
    expect(railVisible(true, true)).toBe(false)
  })
})
