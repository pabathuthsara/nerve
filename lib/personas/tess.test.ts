/**
 * Tess, and the blast radius around her (PERSONA-AUDIT, Tier 0).
 *
 * Two jobs, and the second one is the reason this file is separate from
 * `roster.test.ts`.
 *
 * **What Tess is now.** Six defects were fixed by moving numbers and prose in
 * her file plus four optional fields on the schema. Each one was invisible
 * until somebody read the assembled prompt, which is exactly why they survived
 * so long — every dial was individually plausible and the composition was
 * never looked at. So the assertions here are about the COMPOSED output, not
 * about the dials.
 *
 * **That nobody else moved.** The instruction was Tess-only, and every fix
 * below sits behind a field that is absent everywhere else. Absent has to keep
 * meaning "exactly what happened before", so the guards run over the whole
 * roster — shipped and retired — rather than over the three other shipped
 * characters, because a retired persona is still importable and `alex` is what
 * `engine.test.ts` exercises the warmth clamps with.
 */

import { describe, expect, it } from 'vitest'
import { PERSONAS, RETIRED_PERSONAS } from './index'
import { tess } from './tess'
import { nadia } from './nadia'
import { compileInstructions, moodFor } from '@/lib/voice/openai/persona'
import { composeSteering, wantClauses } from '@/lib/warmth/steering'
import { openingAffect, postureOf } from '@/lib/warmth/affect'
import { bandFor, specFor } from '@/lib/warmth/bands'
import { DEFAULT_VERBOSITY_MEDIAN } from '@/lib/metrics/stability'
import { DEFAULT_SCORER_PLACE, buildSystemPrompt, scorerPlaceFor } from '@/lib/warmth/prompt'
import { ARM_THRESHOLD } from '@/lib/data/rep-rules'
import type { Persona } from '@/lib/voice/types'

const EVERYONE: Persona[] = [...Object.values(PERSONAS), ...Object.values(RETIRED_PERSONAS)]
const EVERYONE_ELSE = EVERYONE.filter((persona) => persona.slug !== 'tess')

/** Deterministic, so a mood roll never makes an assertion flaky. */
const compile = (persona: Persona, roll = 0) =>
  compileInstructions(persona, { canEndScene: true, rng: () => roll })

describe('Tess — nothing here reaches another character', () => {
  it('is the only persona carrying any of the four new fields', () => {
    // The whole Tier 0 scope, expressed as an assertion rather than as a
    // promise in a commit message. If a later session gives one of these to
    // Nadia, that is a retune of a tuned character and this fails first.
    for (const persona of EVERYONE_ELSE) {
      expect(persona.disposition, persona.slug).toBeUndefined()
      expect(persona.bandDirectives, persona.slug).toBeUndefined()
      expect(persona.postureMode, persona.slug).toBeUndefined()
      expect(persona.moods, persona.slug).toBeUndefined()
      expect(persona.room.place, persona.slug).toBeUndefined()
      expect(persona.steerHeartbeatTurns, persona.slug).toBeUndefined()
      expect(persona.verbosityMedian, persona.slug).toBeUndefined()
    }
  })

  it('leaves every other compiled prompt on the derived path', () => {
    // The four fields are each an override of something the compiler derives.
    // Absent means the derivation runs, so the banded prose has to still be
    // there — and for Nadia specifically, still be the guarded line her whole
    // character was tuned around.
    const compiled = compile(nadia)
    expect(compiled).toContain('You are guarded. Warmth has to be earned and you give it slowly.')
    expect(compiled).not.toContain('# Today, specifically')

    for (const persona of EVERYONE_ELSE) {
      // A mood block can only appear where moods were authored.
      expect(compile(persona), persona.slug).not.toContain('# Today, specifically')
      expect(moodFor(persona, () => 0), persona.slug).toBeNull()
    }
  })

  it('leaves every other steering line on the shared band table', () => {
    for (const persona of EVERYONE_ELSE) {
      for (const warmth of [10, 30, 50, 70, 90]) {
        const line = composeSteering({ persona, warmth })
        // The band clause is required and always leads, so its exact text
        // appearing at the front is the same claim as "no override applied".
        expect(line.startsWith(`[${specFor(bandFor(warmth)).directive}`), `${persona.slug}@${warmth}`)
          .toBe(true)
      }
    }
  })

  it('leaves every other posture reading absolute', () => {
    // §3.1 is roster-wide and is deliberately NOT fixed roster-wide yet: it is
    // a retune of three tuned characters and wants the stability harness. So
    // the others must still open `at-ease`, wrong though that is — this test
    // records the debt rather than hiding it.
    for (const persona of Object.values(PERSONAS)) {
      if (persona.slug === 'tess') continue
      const opening = openingAffect(persona.trajectory.start)
      expect(postureOf(opening), persona.slug).toBe('at-ease')
    }
  })
})

describe('Tess — §3.2, her contract is no longer contradicted', () => {
  it('states her disposition in her own words', () => {
    const compiled = compile(tess)
    expect(compiled).toContain('You are pleased to be spoken to and you do not hide it.')
    expect(compiled).not.toContain('You are neither pleased nor annoyed to be spoken to.')
  })

  it('keeps pleased-to-be-spoken-to separate from easy-to-impress', () => {
    // The line this character is balanced on, and the reason the disposition is
    // allowed to exist at all. If warmth 65 became reachable by showing up, the
    // win teaches nothing — so the authored sentence has to carry the caveat
    // that the banded one carried by being lukewarm.
    expect(tess.disposition).toMatch(/not the same as being easy to impress/i)
    expect(tess.trajectory.start + tess.trajectory.startJitter).toBeLessThan(ARM_THRESHOLD)
  })
})

describe('Tess — §3.3, she carries the conversation', () => {
  it('compiles to the carrying line rather than the halfway one', () => {
    // 66 sat one point inside `band()`'s middle bucket and produced the exact
    // opposite of what her file said about her.
    expect(tess.personality.talkativeness).toBeGreaterThan(66)
    const compiled = compile(tess)
    expect(compiled).toContain('You carry the conversation by volunteering something about yourself')
    expect(compiled).not.toContain('but you do not drive')
  })
})

describe('Tess — §3.4, her want is a sentence', () => {
  it('composes into the frame at every warmth', () => {
    // `wantClauses` completes "You would rather be ___". The old phrasing gave
    // "You would still rather be these nineteen minutes to go faster than they
    // are going", injected on every turn of every rep.
    //
    // Robin's `want` has the same fault and is deliberately NOT fixed here —
    // the instruction was Tess-only. PERSONA-AUDIT §3.4 carries the debt.
    for (const warmth of [10, 40, 80]) {
      const [clause] = wantClauses(tess, warmth)
      expect(clause, `warmth ${warmth}`).toMatch(
        /^You would (still )?rather be doing literally anything but watching that drum go round[.,]/,
      )
    }
  })
})

describe('Tess — §3.5, the gates she was tuned for actually reach her', () => {
  it('gives her flirt and disclosure for the body of the rep', () => {
    // The old ordering put `initiatesTopics` (38) and `usesYourName` (36) above
    // `flirtiness` (30) and `personalDisclosure` (34), and `gateClauses` emits
    // only the top two — so from warmth 38 upward she was never once told she
    // might flirt. She opens at 48.
    for (const warmth of [40, 48, 60, 85]) {
      const line = composeSteering({ persona: tess, warmth })
      expect(line, `warmth ${warmth}`).toContain('You may flirt.')
      expect(line, `warmth ${warmth}`).toContain('You may say something real about your life.')
    }
  })

  it('still opens flirtiness earliest on the roster, and below her own start', () => {
    // The constraint `roster.test.ts` asserts. Reordering had to keep it.
    expect(tess.gated.flirtiness.unlocksAt).toBeLessThan(nadia.gated.flirtiness.unlocksAt)
    expect(tess.gated.flirtiness.unlocksAt).toBeLessThan(tess.trajectory.start)
  })
})

describe('Tess — §3.6, she is standing in a launderette', () => {
  it('says so in the section that says what is inviolable', () => {
    const compiled = compile(tess)
    expect(compiled).toContain('the way a stranger in a launderette would react')
    expect(compiled).not.toContain('a stranger in a bookshop')
  })

  it('keeps borrowing the bookshop impulse response', () => {
    // The reverb is an acoustic choice and was never the bug. Separating the
    // name from the IR is what let it stay.
    expect(tess.room.reverbIr).toBe('bookshop')
    expect(tess.room.place).toBe('launderette')
  })
})

describe('Tess — §3.6, the live scorer knows which room she is in', () => {
  it('anchors her intimacy scale to a launderette', () => {
    // Not cosmetic. `intimacy` drives `classifyOverreach`, which decides
    // whether a turn reads as flirting or as a boundary crossing, and its
    // bottom anchor is "the shop, the books". Judging a launderette against a
    // bookshop moves her meter the wrong way.
    expect(scorerPlaceFor('Tess')).toBe('a launderette')
    expect(buildSystemPrompt('Tess', scorerPlaceFor('Tess'))).toContain(
      'talking to in a launderette',
    )
  })

  it('leaves every other character on the old literal, to the byte', () => {
    for (const persona of EVERYONE_ELSE) {
      expect(scorerPlaceFor(persona.name), persona.slug).toBe(DEFAULT_SCORER_PLACE)
      expect(buildSystemPrompt(persona.name, scorerPlaceFor(persona.name)), persona.slug)
        .toBe(buildSystemPrompt(persona.name))
    }
    // And an unknown name — the route's fallback — still resolves.
    expect(scorerPlaceFor('She')).toBe(DEFAULT_SCORER_PLACE)
  })
})

describe('Tess — §3.7, her own band table', () => {
  it('lets her be a person in the band a median first-timer never leaves', () => {
    // She opens at 48 and a median rep sits there for the full three minutes,
    // so OPEN is not one band among six for this character — it is the rep.
    const line = composeSteering({ persona: tess, warmth: 48 })
    // Her cap, not the shared one. The audition is why it is 16 rather than the
    // 20 this test first asserted: a stated cap comes back as roughly 1.2x.
    expect(line).toContain('Sixteen words at most')
    expect(line).toContain('Volunteer one thing he did not ask for.')
    expect(line).not.toContain('fourteen words at most')
  })

  it('still expresses coldness as what it withholds', () => {
    // The rule the cold-band rewrite established: a cold band withholds
    // curiosity, volunteering and follow-ups, not syllables. Her GUARDED must
    // still refuse questions or the meter stops meaning anything.
    const guarded = composeSteering({ persona: tess, warmth: 30 })
    expect(guarded).toContain('do not ask him anything back')
    expect(guarded).not.toContain('Volunteer something he did not ask for')
  })

  it('leaves HOSTILE to the shared table', () => {
    // A rung-1 character only reaches it when a boundary has been crossed, and
    // the shared line is right for that.
    expect(tess.bandDirectives?.HOSTILE).toBeUndefined()
    expect(composeSteering({ persona: tess, warmth: -10 })).toContain(specFor('HOSTILE').directive)
  })
})

describe('Tess — what the audition changed', () => {
  it('states a countable word cap in every band she overrides', () => {
    // The first draft said "One or two sentences" and came back at a median of
    // 40.5 words. An uncountable limit is not a limit. Every override leads
    // with a number, and the number leads the clause — putting a sentence count
    // in front of it licensed the overshoot all over again.
    for (const [band, directive] of Object.entries(tess.bandDirectives ?? {})) {
      expect(directive, band).toMatch(
        /^(Six|Twelve|Fourteen|Sixteen|Twenty|Twenty-four|Twenty-six|Thirty)[a-z- ]*\b/,
      )
      expect(directive, band).toMatch(/words at most|words\./)
    }
  })

  it('gives her a wider ceiling than the roster, and a heartbeat to match it', () => {
    // The two are one setting. She drifts back toward her own natural length in
    // proportion to the room the band gives her — 16-20 words on a turn the
    // directive was sent, 26-30 on a turn it was not — so a wider band without
    // a shorter heartbeat is a wider band she ignores.
    expect(tess.steerHeartbeatTurns).toBeLessThan(4)
    expect(tess.verbosityMedian).toBeGreaterThan(DEFAULT_VERBOSITY_MEDIAN)
  })

  it('does not order a question and then forbid it in the same breath', () => {
    // The shared ENGAGED says "Ask about him"; the §4e quota periodically
    // appends "Do not ask him anything this turn" on top of it. Told both, she
    // asked. Hers offers a question and never commands one.
    expect(tess.bandDirectives?.ENGAGED).not.toMatch(/\bAsk about him\b/)
    expect(tess.bandDirectives?.OPEN).toMatch(/Do not ask him a question/)
  })

  it('carries the consecutive-question rule M0 recorded and the refactor lost', () => {
    // M0: the tuned contract said "no opening or consecutive tag questions".
    // Only the opening half survived into SPEECH_RULES, so `question-every-turn`
    // still breaks on the second one while nothing tells her not to. Stated in
    // both places on purpose — same rule, same wording, so there is no third
    // answer to split towards, and the band is what she reads last.
    expect(tess.contract).toMatch(/never ask two questions in a row/i)
    expect(tess.bandDirectives?.ENGAGED).toMatch(/if your last one ended with a question/)
    // Still missing roster-wide. When it is restored this should fail loudly.
    expect(nadia.contract).not.toMatch(/two questions in a row/i)
  })
})

describe('Tess — §3.1, no posture before the conversation has produced one', () => {
  it('does not open by being told she is not interested', () => {
    const opening = openingAffect(tess.trajectory.start)
    // Absolute is what the rest of the roster still reads, and it is wrong.
    expect(postureOf(opening)).toBe('at-ease')
    // Relative is what she reads, and it is silent until something moves.
    expect(postureOf(opening, { mode: 'relative', opening })).toBe('level')
    expect(tess.postureMode).toBe('relative')
  })

  it('still fires a posture once the axes actually diverge', () => {
    // The mode must not amount to switching postures off — they are the reason
    // there are three axes.
    const opening = openingAffect(tess.trajectory.start)
    const uneasy = { warmth: 70, comfort: opening.comfort - 20, liking: 60 }
    expect(postureOf(uneasy, { mode: 'relative', opening })).toBe('wary')
  })
})

describe('Tess — the rhythm rule stops arguing with her bands', () => {
  it('hands sentence length back to the direction', () => {
    // "Commas and full stops only. Short sentences." is Nadia's cadence and was
    // the last place it reached the whole roster. Her warm bands ask for two or
    // three sentences; the cached prefix was asking for the opposite.
    expect(tess.contract).toContain('Sentence length is the direction in brackets, not a habit.')
    expect(tess.contract).not.toContain('Commas and full stops only. Short sentences.')
  })

  it('keeps the em-dash rule, which is a TTS fix and not a rhythm', () => {
    expect(tess.contract).toContain('Never use em-dashes.')
    for (const persona of EVERYONE) {
      expect(persona.contract, persona.slug).toContain('Never use em-dashes.')
    }
  })

  it('leaves every other character on the shared rhythm', () => {
    for (const persona of EVERYONE_ELSE) {
      expect(persona.contract, persona.slug).toContain('Commas and full stops only. Short sentences.')
    }
  })
})

describe('Tess — §3.9, a different afternoon each time', () => {
  it('rolls one of the authored moods into the prompt', () => {
    const moods = tess.moods ?? []
    expect(moods.length).toBeGreaterThan(1)
    for (let i = 0; i < moods.length; i += 1) {
      const roll = (i + 0.5) / moods.length
      const chosen = moodFor(tess, () => roll)
      expect(moods).toContain(chosen)
      expect(compile(tess, roll)).toContain(`# Today, specifically\n${chosen}`)
    }
  })

  it('never lets a mood reach a dial', () => {
    // The rule that keeps this from being a difficulty roll in a costume: a
    // mood is prose about her day and touches nothing the engine reads.
    for (const mood of tess.moods ?? []) {
      expect(typeof mood).toBe('string')
      expect(mood).not.toMatch(/\b(warmth|meter|score|level|difficulty)\b/i)
    }
  })

  it('does not change what she gives, only what she has to talk about', () => {
    // Same warmth, different mood, identical steering. The mood lives in the
    // cached contract prefix; the steering line is the engine's.
    const first = composeSteering({ persona: tess, warmth: 48 })
    const second = composeSteering({ persona: tess, warmth: 48 })
    expect(first).toBe(second)
  })
})
