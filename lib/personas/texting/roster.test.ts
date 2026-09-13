import { describe, expect, it } from 'vitest'
import { ARM_THRESHOLD } from '@/lib/data/rep-rules'
import { PERSONAS, RETIRED_PERSONAS } from '@/lib/personas'
import { INTERVIEWERS } from '@/lib/personas/interview'
import { compileInstructions } from '@/lib/voice/openai/persona'
import { assertTextingPremise, assertTextingScene } from '@/lib/texting/scene'
import { TEXTING_ROSTER, TEXTING_SLUGS } from './index'
import { TEXTING_VERBOSITY_MEDIAN } from './trajectory'

const seed = () => {
  let n = 0
  return () => ((n = (n + 1) % 97) / 97)
}

describe('the roster is its own', () => {
  it('ships four characters, one per rung', () => {
    expect(TEXTING_ROSTER).toHaveLength(4)
    expect(TEXTING_ROSTER.map((p) => p.level)).toEqual([1, 2, 3, 4])
  })

  it('every character is on the texting track', () => {
    for (const persona of TEXTING_ROSTER) expect(persona.track).toBe('texting')
  })

  it('no slug collides with a dating or interview character', () => {
    const taken = new Set([
      ...Object.keys(PERSONAS),
      ...Object.keys(RETIRED_PERSONAS),
      ...Object.keys(INTERVIEWERS),
    ])
    for (const slug of TEXTING_SLUGS) expect(taken.has(slug)).toBe(false)
  })

  it('no trajectory is a copy of a dating character’s', () => {
    // The whole reason this roster exists. A copied curve is a curve tuned for
    // fifteen turns in three minutes, running in a thread of forty.
    const dating = Object.values(PERSONAS).map((p) => JSON.stringify(p.trajectory))
    for (const persona of TEXTING_ROSTER) {
      expect(dating).not.toContain(JSON.stringify(persona.trajectory))
    }
  })

  it('opens below the arm threshold even at maximum jitter', () => {
    for (const persona of TEXTING_ROSTER) {
      expect(persona.trajectory.start + persona.trajectory.startJitter).toBeLessThan(ARM_THRESHOLD)
    }
  })

  it('gets harder down the ladder', () => {
    const byLevel = [...TEXTING_ROSTER].sort((a, b) => a.level - b.level)
    for (let i = 1; i < byLevel.length; i += 1) {
      expect(byLevel[i]!.trajectory.gain).toBeLessThan(byLevel[i - 1]!.trajectory.gain)
      expect(byLevel[i]!.trajectory.decay).toBeGreaterThan(byLevel[i - 1]!.trajectory.decay)
      expect(byLevel[i]!.trajectory.start).toBeLessThan(byLevel[i - 1]!.trajectory.start)
    }
  })

  it('sizes maxGainPerTurn for a thread rather than for three minutes', () => {
    // `Trajectory.maxGainPerTurn`'s own note: the cap is a function of rep
    // LENGTH, and a longer rep is a uniformly easier rep unless it comes down.
    const datingLow = Math.min(...Object.values(PERSONAS).map((p) => p.trajectory.maxGainPerTurn))
    for (const persona of TEXTING_ROSTER) {
      expect(persona.trajectory.maxGainPerTurn).toBeLessThanOrEqual(datingLow + 0.1)
    }
  })
})

describe('the companion-app guard, walked over the real roster', () => {
  for (const persona of TEXTING_ROSTER) {
    it(`${persona.slug}'s evening is her own`, () => {
      expect(() => assertTextingScene(persona.slug, persona.scene)).not.toThrow()
    })

    it(`${persona.slug}'s premise does not assert a relationship`, () => {
      expect(persona.premise).toBeTruthy()
      expect(() => assertTextingPremise(persona.slug, persona.premise!)).not.toThrow()
    })
  }
})

describe('the contract is texting’s, not the dating arm’s', () => {
  for (const persona of TEXTING_ROSTER) {
    const compiled = compileInstructions(persona, { canEndScene: false, rng: seed() })

    it(`${persona.slug} is never told she is speaking out loud`, () => {
      expect(compiled).not.toMatch(/speaking out loud/i)
      expect(compiled).toMatch(/texting him, not speaking/i)
    })

    it(`${persona.slug} is never told to react like a stranger in a room`, () => {
      // §3.6's defect with a different cause: a thread has no room, and an
      // acoustic lookup in the Absolute rules would name one anyway.
      expect(compiled).not.toMatch(/a stranger in a (?:bookshop|coffee shop|launderette|gallery|bar|gym|park)/i)
    })

    it(`${persona.slug} is never given the mishearing rule`, () => {
      // She can see every word. "sorry, your what?" about text on her screen
      // reads as broken rather than as distracted.
      expect(compiled).not.toMatch(/If a word or name is unclear/i)
      expect(compiled).toMatch(/You never mishear anything/i)
    })

    it(`${persona.slug} is never given the dating contact-detail block`, () => {
      expect(compiled).not.toMatch(/If they ask for your number/i)
      // She is already texting him, so the rule is the other one.
      expect(compiled).toMatch(/You are already texting/i)
    })

    it(`${persona.slug} carries her premise and her evening`, () => {
      expect(compiled).toContain(persona.premise)
      expect(compiled).toContain(persona.scene)
      expect(compiled).toMatch(/# How you know him/)
    })

    it(`${persona.slug} is told that several messages get one reply`, () => {
      expect(compiled).toMatch(/If he sends several messages in a row/i)
    })
  }
})

describe('register', () => {
  for (const persona of TEXTING_ROSTER) {
    it(`${persona.slug} demonstrates the bottom of her register`, () => {
      const examples = persona.examples ?? []
      expect(examples.length).toBeGreaterThanOrEqual(4)
      const short = examples.filter((e) => e.her.trim().split(/\s+/).length <= 4)
      // The same rule `examples.test.ts` holds the dating roster to: a set of
      // polished lines teaches the register it was written to correct.
      expect(short.length / examples.length).toBeGreaterThanOrEqual(0.25)
    })

    it(`${persona.slug} never puts a fact about HIM into his mouth`, () => {
      for (const example of persona.examples ?? []) {
        expect(example.him).not.toMatch(/\bI(?:'m| am)\s+[A-Z]/)
        expect(example.him).not.toMatch(/\bmy name is\b/i)
      }
    })

    it(`${persona.slug} reads the drift alarm off the texting table`, () => {
      expect(persona.verbosityMedian).toBe(TEXTING_VERBOSITY_MEDIAN)
    })
  }
})

describe('exits are texting-shaped', () => {
  for (const persona of TEXTING_ROSTER) {
    it(`${persona.slug} knows how to stop replying`, () => {
      const exits = persona.exitConditions.join(' ')
      expect(exits).toMatch(/stop replying/i)
      // The number the contract states and the number `lib/texting/exit.ts`
      // commits on have to be the same, or the state and the prose race.
      expect(exits).toMatch(/three messages in a row/i)
    })
  }
})
