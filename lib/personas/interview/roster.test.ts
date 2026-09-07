/**
 * The interview roster, held to the same standard as the dating one.
 *
 * `lib/personas/roster.test.ts` is the dating equivalent and reads
 * `DATING_PERSONAS`; this reads `INTERVIEWERS`. The two are deliberately
 * separate files rather than one parameterised suite, because most of what each
 * asserts is about its own track: the dating ladder is a progression and this
 * one is not, a dating character must never mention "him" in a mood and an
 * interviewer may mention a colleague, and the dating roster carries no
 * per-character escape hatches while every interviewer carries two on purpose.
 */

import { describe, expect, it } from 'vitest'
import { INTERVIEWERS, DATING_PERSONAS, PERSONAS, getPersona } from '../index'
import { presentationFor } from '../presentation'
import { PERSONA_VISUAL } from '../visual'
import { compileInstructions } from '@/lib/voice/openai/persona'
import {
  ElevenLabsPersonaCompiler,
  INTERVIEW_STABILITY,
  STABILITY_BY_EXPRESSION,
  stabilityFor,
} from '@/lib/voice/elevenlabs/persona'
import type { PipelineEnv } from '@/lib/voice/elevenlabs/config'
import { DEFAULT_CALIBRATION, type Persona } from '@/lib/voice/types'
import { INTERVIEW_VERBOSITY_MEDIAN } from '@/lib/warmth/interview/bands'
import { interviewTrajectory } from '@/lib/warmth/interview/trajectory'
import { INTERVIEW_THRESHOLD } from '@/lib/data/rep-rules'
import { ROUND_TYPES } from '@/lib/data/interview-credits'
import { sceneId, roomName, mayInterrupt } from '@/lib/voice/types'
import { bedFor } from '@/lib/audio/room-tone'

const ROSTER = Object.values(INTERVIEWERS)
const BY_LEVEL = [...ROSTER].sort((a, b) => a.level - b.level)

describe('the interview roster', () => {
  it('is four characters, one per style, on four contiguous rungs', () => {
    expect(ROSTER).toHaveLength(4)
    expect(BY_LEVEL.map((persona) => persona.level)).toEqual([1, 2, 3, 4])
    expect(BY_LEVEL.map((persona) => persona.slug))
      .toEqual(['dan-whitfield', 'aisha-rahman', 'marcus-vance', 'elena-kovac'])
  })

  it('is every one of them on the interview track, and startable', () => {
    for (const persona of ROSTER) {
      expect(persona.track, persona.slug).toBe('interview')
      expect(getPersona(persona.slug), persona.slug).not.toBeNull()
    }
  })

  it('shares no slug and no rung identity with a dating character', () => {
    const dating = new Set(Object.keys(DATING_PERSONAS))
    for (const slug of Object.keys(INTERVIEWERS)) expect(dating.has(slug), slug).toBe(false)
    // Eight characters, four rungs each side. The rungs collide on purpose;
    // the registry must not.
    expect(Object.keys(PERSONAS)).toHaveLength(8)
  })

  /**
   * §5.10. Difficulty is CHOSEN here, not earned — so the ordering has to be a
   * real gradient somebody can pick along rather than a ladder they climb.
   */
  it('is monotonically harder from rung one to rung four', () => {
    for (let index = 1; index < BY_LEVEL.length; index += 1) {
      const easier = BY_LEVEL[index - 1]!
      const harder = BY_LEVEL[index]!
      const label = `${easier.slug} → ${harder.slug}`
      expect(harder.trajectory.start, label).toBeLessThanOrEqual(easier.trajectory.start)
      expect(harder.trajectory.gain, label).toBeLessThanOrEqual(easier.trajectory.gain)
      expect(harder.trajectory.decay, label).toBeGreaterThanOrEqual(easier.trajectory.decay)
      expect(harder.personality.patience, label).toBeLessThanOrEqual(easier.personality.patience)
    }
  })

  it('opens every one of them below the callback line, and lets every one reach it', () => {
    for (const persona of ROSTER) {
      // A rep somebody starts already cleared teaches nothing.
      expect(persona.trajectory.start + persona.trajectory.startJitter, persona.slug)
        .toBeLessThan(INTERVIEW_THRESHOLD)
      // And unwinnable is a different design, and it is Alex's — who is retired.
      expect(persona.trajectory.sessionCeiling, persona.slug).toBeGreaterThan(INTERVIEW_THRESHOLD)
      expect(persona.trajectory.hardCeiling, persona.slug).toBeGreaterThan(INTERVIEW_THRESHOLD)
    }
  })

  it('never lets an interviewer interrupt, on any rung', () => {
    // §05: levels 1-4 never interrupt the user, ever. Every interviewer sits
    // inside that range, and the one whose prose says she "cuts a rambling
    // answer short" does it by asking again, not by talking over somebody.
    for (const persona of ROSTER) expect(mayInterrupt(persona), persona.slug).toBe(false)
  })
})

describe('every interviewer is fully authored', () => {
  it('has presentation copy, so the picker has something to draw', () => {
    for (const persona of ROSTER) {
      const shown = presentationFor(persona.slug)
      expect(shown, persona.slug).not.toBeNull()
      expect(shown!.hook.length, persona.slug).toBeGreaterThan(10)
      expect(shown!.blurb.length, persona.slug).toBeGreaterThan(40)
      expect(shown!.respondsTo.length, persona.slug).toBeGreaterThan(0)
      expect(shown!.shutsDownOn.length, persona.slug).toBeGreaterThan(0)
    }
  })

  it('has an avatar row inside the palette bounds `visual.test.ts` enforces', () => {
    for (const persona of ROSTER) expect(PERSONA_VISUAL[persona.slug], persona.slug).toBeTruthy()
  })

  it('has a room of her own, with a bed and a name that reads as English', () => {
    // PERSONA-AUDIT §3.6: a character without her own scene is a character
    // whose ABSOLUTE RULES name the wrong room.
    const rooms = new Set<string>()
    for (const persona of ROSTER) {
      expect(bedFor(sceneId(persona.room)), persona.slug).not.toBeNull()
      expect(rooms.has(sceneId(persona.room)), persona.slug).toBe(false)
      rooms.add(sceneId(persona.room))
      const room = roomName(persona.room)
      expect(room, persona.slug).not.toMatch(/-/)
      expect(compileInstructions(persona)).toContain(`a stranger in a ${room} would react`)
    }
  })

  it('carries its own verbosity median rather than the dating table’s', () => {
    // `DEFAULT_VERBOSITY_MEDIAN` is derived from `lib/warmth/bands.ts` and is
    // not touched (B3). An interviewer measured against it would trip the drift
    // alarm on every turn, and what the alarm fires is an identity reminder
    // that measurably makes her longer.
    for (const persona of ROSTER) {
      expect(persona.verbosityMedian, persona.slug).toBe(INTERVIEW_VERBOSITY_MEDIAN)
    }
  })

  it('has more than one afternoon, and a want of her own', () => {
    for (const persona of ROSTER) {
      expect((persona.moods ?? []).length, persona.slug).toBeGreaterThan(1)
      expect(persona.want.trim().length, persona.slug).toBeGreaterThan(0)
      for (const mood of persona.moods ?? []) {
        expect(mood, persona.slug).toMatch(/^[A-Z].*[.]$/)
      }
    }
  })

  it('has scene beats, all of them clear of the wind-down', () => {
    for (const persona of ROSTER) {
      const beats = persona.sceneBeats ?? []
      expect(beats.length, persona.slug).toBeGreaterThan(0)
      for (const beat of beats) {
        expect(beat.at, `${persona.slug} @${beat.at}`).toBeLessThanOrEqual(0.75)
        expect(beat.direction, persona.slug).toMatch(/^\(.*\)$/)
      }
    }
  })
})

describe('what an interviewer is never allowed to do', () => {
  const compiled = ROSTER.map((persona) => [persona.slug, compileInstructions(persona)] as const)

  it('never gets the dating number clause', () => {
    for (const [slug, prompt] of compiled) {
      expect(prompt, slug).not.toMatch(/if they ask for your number/i)
    }
  })

  /** §05, and the surface most likely to break it. */
  it('is told not to coach, advise or give feedback', () => {
    for (const [slug, prompt] of compiled) {
      expect(prompt, slug).toMatch(/never give advice, feedback, tips/i)
      expect(prompt, slug).toMatch(/you never say how it is going/i)
    }
  })

  /** §16, and it is the one thing a warm interviewer would drift into. */
  it('is told not to flirt or ask anything unlawful', () => {
    for (const [slug, prompt] of compiled) {
      expect(prompt, slug).toMatch(/flirt, comment on their appearance/i)
      expect(prompt, slug).toMatch(/age, marital status, children, health, religion/i)
    }
  })

  /** §07: the outcome is worth zero, and she must not announce one. */
  it('is told not to make an offer or promise a callback unprompted', () => {
    for (const [slug, prompt] of compiled) {
      expect(prompt, slug).toMatch(/make an offer, promise a callback/i)
    }
  })

  /**
   * The first real interview: ten of her seventeen turns opened by quoting the
   * candidate back at himself — "You said the website Nerve", "You mentioned
   * switching the voice provider". Aisha's own contract modelled it with an
   * example in exactly that construction, which outweighed the craft rule
   * telling her not to summarise. Two systems, one behaviour, contradicting
   * each other: the round-6 failure, on a new track.
   */
  it('is told not to open a question by quoting the candidate', () => {
    for (const [slug, prompt] of compiled) {
      expect(prompt, slug).toMatch(/do not open a question by repeating what they just told you/i)
    }
  })

  it('never models the quote-back construction in an example', () => {
    // A contract that demonstrates the thing the craft rules forbid is a
    // contract the model will copy, because an example outranks a rule.
    //
    // The line that FORBIDS it necessarily quotes it, so it is dropped before
    // the check — a substring test cannot tell a prohibition from a
    // demonstration, which is the third time that has caught something today.
    for (const persona of ROSTER) {
      const authored = persona.contract
        .split('\n')
        .filter((line) => !/do not open a question by repeating/i.test(line))
        .join('\n')
      expect(authored, persona.slug).not.toMatch(/"You said/)
      expect(authored, persona.slug).not.toMatch(/"You mentioned/)
    }
  })

  /** Silence is off on this arm (`lib/warmth/track.ts`); nothing may invite it. */
  it('is never told that saying nothing is an option', () => {
    for (const [slug, prompt] of compiled) {
      expect(prompt.toLowerCase(), slug).not.toContain('let the pause sit')
      expect(prompt.toLowerCase(), slug).not.toContain('silence is a tool')
    }
  })

  it('never carries an exit condition about a number or contact details', () => {
    for (const persona of ROSTER) {
      for (const condition of persona.exitConditions) {
        expect(condition.toLowerCase(), `${persona.slug}: ${condition}`)
          .not.toMatch(/number|contact details|phone/)
      }
    }
  })
})

/**
 * The defect the first real rep sounded like, and the shape of bug rule 19
 * exists to catch: a GLOBAL dial, tuned by ear for the dating arm, silently
 * retuning a second track.
 *
 * `ELEVENLABS_STABILITY=0.85` is set in production. On the dating arm that is
 * deliberate — a stranger who warms up on her own is a broken exposure
 * exercise. Applied to an interviewer it renders her near-flat, which is not a
 * severe interviewer, it is a robot.
 */
describe('an interviewer’s voice is hers, and the environment may not flatten it', () => {
  const HOSTILE: PipelineEnv = { ELEVENLABS_STABILITY: '0.85' }

  const stabilityOf = (persona: Persona, env: PipelineEnv) =>
    new ElevenLabsPersonaCompiler(env).compile(persona, DEFAULT_CALIBRATION).tts.stability

  it('renders every interviewer at the authored value, whatever the environment says', () => {
    for (const persona of ROSTER) {
      expect(stabilityOf(persona, {}), persona.slug).toBe(INTERVIEW_STABILITY)
      expect(stabilityOf(persona, HOSTILE), persona.slug).toBe(INTERVIEW_STABILITY)
      // And explicitly not the value that shipped her first real rep.
      expect(stabilityOf(persona, HOSTILE), persona.slug).not.toBe(0.85)
    }
  })

  it('is one value for all four, because coldness is authored and never synthesised', () => {
    // Elena is the hard one and is authored `flat`, which on the DATING table
    // means 0.9. She must not inherit it: her severity is in what she asks.
    expect(new Set(ROSTER.map(stabilityFor)).size).toBe(1)
    expect(INTERVIEW_STABILITY).toBeLessThan(STABILITY_BY_EXPRESSION.flat)
    expect(INTERVIEW_STABILITY).toBeLessThan(STABILITY_BY_EXPRESSION.dry)
  })

  /**
   * The other half, and the one that matters for rule 19. A0 pins the compiled
   * configs; this states the INTENT so a future reader knows the dating
   * behaviour is load-bearing rather than incidental.
   */
  it('leaves the dating arm obeying the environment exactly as before', () => {
    for (const persona of Object.values(DATING_PERSONAS)) {
      expect(stabilityOf(persona, HOSTILE), persona.slug).toBe(0.85)
      expect(stabilityOf(persona, {}), persona.slug)
        .toBe(STABILITY_BY_EXPRESSION[persona.personality.expression])
    }
  })
})

describe('the round scales the gain cap and nothing else', () => {
  it('leaves every other dial exactly where it was authored', () => {
    for (const persona of ROSTER) {
      for (const round of ROUND_TYPES) {
        const scaled = interviewTrajectory(persona.trajectory, round.id)
        expect({ ...scaled, maxGainPerTurn: persona.trajectory.maxGainPerTurn })
          .toEqual(persona.trajectory)
      }
    }
  })

  it('gives a short round a bigger per-turn cap and a long one a smaller cap', () => {
    const base = INTERVIEWERS['dan-whitfield']!.trajectory
    const screener = interviewTrajectory(base, 'screener').maxGainPerTurn
    const technical = interviewTrajectory(base, 'technical').maxGainPerTurn
    const deep = interviewTrajectory(base, 'deep_technical').maxGainPerTurn
    expect(screener).toBeGreaterThan(technical)
    expect(deep).toBeLessThan(technical)
    // The reference round is the one the numbers were authored against, so it
    // comes back untouched.
    expect(technical).toBe(base.maxGainPerTurn)
  })
})
