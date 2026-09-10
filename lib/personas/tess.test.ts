/**
 * Cass is her own person, on Nadia's craft rules, on the rung-1 curve.
 *
 * ── THIS FILE HAS NOW ASSERTED THREE DIFFERENT THINGS ────────────────────
 *
 * It is worth knowing why, because each turn was right at the time.
 *
 * **First** it asserted that rung 1 had her own bands, posture reading and
 * punctuation — `PERSONA-AUDIT.md` had measured, correctly, that the shared
 * band table was tuned against Nadia, and concluded it must be overwriting
 * anyone authored against that grain.
 *
 * **Then it inverted.** The person who had talked to both said Nadia was fun
 * and Tess still read as an AI, and Nadia runs the shared table with none of
 * those overrides. So the table was not what flattened her — it is most of
 * what makes Nadia good. The overrides came out, the contract was replaced
 * with Nadia's ported into a launderette, and this file started asserting
 * FIDELITY: that the port had not drifted.
 *
 * **10 September, and this is the third.** The port did its job and then
 * outgrew it. With four characters on the roster, rung 1 and rung 2 were the
 * same woman — same job, same sister, same crime novels, same `playful` — and
 * the first two reps of the product are rung 1 followed by rung 2 about twenty
 * seconds later.
 *
 * ── THE DISTINCTION THIS FILE NOW EXISTS TO HOLD ─────────────────────────
 *
 * **Giving a character her own JUDGEMENT MACHINERY made her worse. Giving her
 * her own LIFE is what every other character already has.** Those are not the
 * same act and the first round conflated them.
 *
 * So the assertions split in two, and both halves matter:
 *
 *   `the craft rules are still Nadia's`   every rule about how she TALKS,
 *                                         verbatim. This is the half of the
 *                                         port that was always right, and the
 *                                         half that would rot silently.
 *   `she is not Nadia`                    every rule about who she IS, and
 *                                         none of Nadia's personal material.
 *                                         Two characters converging is what
 *                                         this round was called to fix.
 *
 * The escape-hatch test at the bottom is the one that carries the original
 * lesson forward, and it is roster-wide rather than about her.
 */

import { describe, expect, it } from 'vitest'
import { DATING_PERSONAS, RETIRED_PERSONAS } from './index'
import { sceneFor } from '@/lib/audio/scenes'
import { tess } from './tess'
import { nadia } from './nadia'
import { compileInstructions, moodFor } from '@/lib/voice/openai/persona'
import { composeSteering, wantClauses } from '@/lib/warmth/steering'
import { bandFor, specFor } from '@/lib/warmth/bands'
import { DEFAULT_SCORER_PLACE, buildSystemPrompt, scorerPlaceFor } from '@/lib/warmth/prompt'
import { ARM_THRESHOLD } from '@/lib/data/rep-rules'
import { seededRandom } from '@/lib/voice/seed'
import type { Persona } from '@/lib/voice/types'

// Every DATING character ever authored, shipped or retired. The craft rules
// below are the dating arm's — a mood that never mentions "him", a roster with
// no per-character escape hatches — and an interviewer is neither: her mood may
// mention a colleague, and every interviewer carries an authored `disposition`
// and her own `verbosityMedian` on purpose. See `interview/roster.test.ts`.
const EVERYONE: Persona[] = [...Object.values(DATING_PERSONAS), ...Object.values(RETIRED_PERSONAS)]

/**
 * Every craft rule in Nadia's contract, verbatim.
 *
 * These are the lines that decide how she TALKS, as opposed to what she is
 * standing next to, and they are the reason she is good company. If a future
 * edit paraphrases one of them for Tess, the port has quietly become a
 * different character and this is where that shows up.
 */
const NADIA_CRAFT = [
  'Do not enunciate carefully. Let sentences trail off.',
  'An occasional "um" or a false start.',
  'Never sound like you are presenting or performing.',
  'Never use em-dashes. They produce an unnatural clipped pause when spoken.',
  'Commas and full stops only. Short sentences.',
  'A tag question added to the end of a statement still counts as asking a question.',
  'You are never responsible for rescuing a silence. Letting one sit is allowed.',
  'When asked for advice, give one imperfect personal pick. No menu, sales language, qualification, or follow-up question.',
  'Never sound like a reviewer, counsellor, moderator, interviewer, or customer-service worker.',
  'Do not automatically agree, praise, validate, or call their thought great, cool, interesting, relatable, or sensible.',
  'Occasional hesitation and unfinished thoughts are natural. Do not use fillers or transitions on a repeated cadence.',
  'On the first hello, give a plain greeting OR one concrete observation, never both. Do not open with any question, including a tag question.',
  'This is one continuous encounter. A later "hello" does not restart it.',
  'Show memory indirectly through the next relevant opinion or choice.',
  'React personally and briefly. Never police their tone, request respect, explain a rule, or sound like a moderator.',
  'Speak twice in a row without them saying something.',
  'Repeat a greeting you have already used.',
]

/** Nadia's own sections, in her order. A port keeps the skeleton. */
const NADIA_SECTIONS = [
  '# Who you are',
  '# Where you are',
  '# Your mood right now',
  '# Your agenda in this scene',
  '# How it comes out',
  '# Punctuation',
  '# How you speak',
  '# Conversation continuity',
  '# If they ask something personal',
  '# If they are rude or test you',
  '# What earns your warmth',
  '# What loses it',
  '# You never',
]

describe('Cass — the craft rules are still Nadia\'s', () => {
  it('carries every one of her craft rules verbatim', () => {
    // THE HALF OF THE PORT THAT WAS ALWAYS RIGHT. These are the lines that
    // decide how she TALKS rather than who she is, they were tuned and measured
    // on the arm that ships, and they are what stops a character sounding like
    // a customer-service agent. She got a new life; she did not get new craft.
    for (const rule of NADIA_CRAFT) {
      expect(nadia.contract, `nadia is missing: ${rule}`).toContain(rule)
      expect(tess.contract, `cass is missing: ${rule}`).toContain(rule)
    }
  })

  it('keeps her section skeleton, in her order', () => {
    let cursor = -1
    for (const heading of NADIA_SECTIONS) {
      const at = tess.contract.indexOf(heading)
      expect(at, `missing or out of order: ${heading}`).toBeGreaterThan(cursor)
      cursor = at
    }
  })

  it('is a full hand-written contract, like hers, not an assembled one', () => {
    // Nadia's is written end to end and the shared helper would reorder it.
    // Her punctuation block sits inside the contract, above `# How you speak`.
    expect(tess.contract.indexOf('# Punctuation')).toBeLessThan(
      tess.contract.indexOf('# How you speak'),
    )
    expect(nadia.contract.indexOf('# Punctuation')).toBeLessThan(
      nadia.contract.indexOf('# How you speak'),
    )
  })
})

describe('Cass — she is not Nadia', () => {
  it('shares none of her personal material', () => {
    // The defect this round was called to fix. Rung 1 and rung 2 were the same
    // woman: same job, same sister, same books, same opinion about literary
    // fiction — and the first two reps of the product are one then the other,
    // about twenty seconds apart.
    for (const leak of [
      'people being sad in nice houses',
      'Tana French',
      'airport thrillers',
      'something in logistics',
      'non-fiction and crime',
    ]) {
      expect(nadia.contract, `control: ${leak}`).toContain(leak)
      expect(tess.contract, `leaked: ${leak}`).not.toContain(leak)
    }
  })

  it('stands somewhere else, and nothing of the old room survives', () => {
    expect(tess.contract).toContain('a gallery')
    expect(tess.contract).toContain('veterinary nurse')
    for (const gone of ['launderette', 'bookshop', 'machine', 'dryer', 'the shelves']) {
      expect(tess.contract.toLowerCase(), `stale: ${gone}`).not.toContain(gone)
    }
  })

  it('does not mean what she says with an angle on it', () => {
    // `expression` is the load-bearing difference and the one a beginner
    // actually hears. Nadia and Tess were both `playful`, Maya is `dry`, so
    // every character on the roster had irony in her — and irony is a thing you
    // have to decode before you can answer it, which is the last thing to ask
    // of somebody on their first rep.
    expect(tess.personality.expression).toBe('earnest')
    expect(tess.personality.expression).not.toBe(nadia.personality.expression)
    const compiled = compileInstructions(tess, { canEndScene: true })
    expect(compiled).toContain('You mean what you say and you do not hide behind irony.')
    expect(composeSteering({ persona: tess, warmth: 50 })).toContain('Straight, no irony.')
  })

  it('is the only character a user actually meets who means it plainly', () => {
    // Stated as a property of the SET rather than of her, so a later retune
    // that gives a second shipped character `earnest` has to come here and say
    // so. Shipped only: Priya is `earnest` too, and she is retired.
    //
    // KNOWN AND NOT FIXED HERE: Maya and Robin are both `dry`, so the shipped
    // roster carries three registers across four characters. That is a real
    // overlap and a separate decision — the one this round was called to fix
    // was rung 1 and rung 2 being the same woman, and those are the first two
    // reps anybody runs.
    const shipped = Object.values(DATING_PERSONAS)
    const earnest = shipped.filter((p) => p.personality.expression === 'earnest')
    expect(earnest.map((p) => p.slug)).toEqual(['tess'])
    expect(tess.personality.expression).not.toBe(nadia.personality.expression)
  })

  it('never bluffs, which is the whole engine of the room', () => {
    // A gallery could read as the most intimidating room on the roster. A woman
    // in it who cannot tell you what anything means, and is not embarrassed
    // about it, inverts that — and gives a nervous user permission to not know
    // something in front of a stranger, which is the hardest thing to script.
    expect(tess.contract).toContain('You never bluff about art')
    expect(tess.contract).toContain('claim to know what a painting means')
  })

  it('does not sound like her on the dials that are not the rung', () => {
    // The inverse of what this file used to assert. `patience` and
    // `distraction` ARE the rung and are pinned against Nadia's by
    // `roster.test.ts`; everything else is now hers and must not converge back.
    expect(tess.personality.sharpness).toBeLessThan(nadia.personality.sharpness)
    expect(tess.personality.signalClarity).toBeGreaterThan(nadia.personality.signalClarity)
    expect(tess.personality.humour).not.toBe(nadia.personality.humour)
  })

  it('reads the same shared band table she does, at every warmth', () => {
    // THE LESSON THAT SURVIVES ALL THREE ROUNDS. A different life, not a
    // different judgement layer: she is steered by the same table Nadia is,
    // word for word, because that table is most of what makes Nadia good.
    for (const warmth of [10, 30, 50, 70, 90]) {
      const line = composeSteering({ persona: tess, warmth })
      expect(line.startsWith(`[${specFor(bandFor(warmth)).directive}`), `@${warmth}`).toBe(true)
    }
  })
})

describe('Tess — no character carries a per-character escape hatch', () => {
  it('leaves the whole roster on the shared path', () => {
    // The optional fields survive on the schema — they are the right shape for
    // a character who genuinely needs one — but nobody uses one today, and the
    // reason is recorded in PERSONA-AUDIT §6: the overrides were the thing
    // making Tess read as an AI, not the thing that would have fixed her.
    //
    // `moods` is NOT on this list and never belonged on it. It was deleted from
    // Tess as collateral in the wholesale port, not because it was one of the
    // overrides that had made her read as an AI — every field above changes
    // what she GIVES, and a mood cannot. The test below is the one that
    // matters, and it is the reason this one can safely lose an entry.
    for (const persona of EVERYONE) {
      expect(persona.disposition, persona.slug).toBeUndefined()
      expect(persona.bandDirectives, persona.slug).toBeUndefined()
      expect(persona.postureMode, persona.slug).toBeUndefined()
      expect(persona.steerHeartbeatTurns, persona.slug).toBeUndefined()
      expect(persona.verbosityMedian, persona.slug).toBeUndefined()
    }
  })
})

describe('every character has more than one afternoon', () => {
  // PERSONA-AUDIT §3.9, shipped for the roster rather than for Tess alone.
  // `composeSteering` is deterministic in warmth and the directive is only
  // re-sent when it changes, so a rep that stays inside one band carries one
  // instruction start to finish — and the SECOND rep against that character is
  // the same instruction and the same afternoon. §08 re-offers the sign-up rep
  // at day 28 as a side-by-side measurement, so for Tess the thing being
  // measured was contaminated by the thing being remembered.

  it('authors at least three, for everybody', () => {
    for (const persona of EVERYONE) {
      expect(persona.moods?.length ?? 0, persona.slug).toBeGreaterThanOrEqual(3)
    }
  })

  it('rolls a different one from a different rep, and the same one within a rep', () => {
    // Deterministic in the seed, because the pipeline arm recompiles the
    // contract on every single turn. See `lib/voice/seed.ts`.
    const rolled = (seed: string) => compileInstructions(nadia, { rng: seededRandom(seed) })
    expect(rolled('rep-one')).toBe(rolled('rep-one'))
    const seen = new Set(
      Array.from({ length: 40 }, (_, i) => moodFor(nadia, seededRandom(`rep-${i}`))),
    )
    expect(seen.size).toBeGreaterThan(1)
  })

  it('reaches the contract under its own heading, and only there', () => {
    const mood = moodFor(nadia, seededRandom('rep-one'))!
    const compiled = compileInstructions(nadia, { rng: seededRandom('rep-one') })
    expect(compiled).toContain('# Today, specifically')
    expect(compiled).toContain(mood)
  })

  it('NEVER touches a dial — same warmth, same steering, whatever the day', () => {
    // The whole licence for this field. A mood that moved warmth would be a
    // difficulty roll wearing a costume and the ladder would stop meaning
    // anything. These change what she has to talk about, never what she gives.
    for (const persona of EVERYONE) {
      for (const warmth of [10, 30, 50, 70, 90]) {
        const line = composeSteering({ persona, warmth })
        for (const mood of persona.moods ?? []) {
          const withMood = composeSteering({ persona: { ...persona, moods: [mood] }, warmth })
          expect(withMood, `${persona.slug} @${warmth}`).toBe(line)
        }
      }
    }
  })

  it('is about her day and never about him', () => {
    // Second person, present tense, her own afternoon. A mood that mentioned
    // him would be a disposition, and disposition is layer 1's.
    for (const persona of EVERYONE) {
      for (const mood of persona.moods ?? []) {
        expect(mood, persona.slug).toMatch(/^[A-Z].*[.]$/)
        expect(mood.toLowerCase(), persona.slug).not.toMatch(/\b(he|him|his)\b/)
      }
    }
  })
})

describe('Tess — she is still rung 1', () => {
  it('keeps the curve, which is the only difference by design', () => {
    expect(tess.trajectory.start).toBeGreaterThan(nadia.trajectory.start)
    expect(tess.trajectory.gain).toBeGreaterThan(nadia.trajectory.gain)
    expect(tess.personality.patience).toBeGreaterThan(nadia.personality.patience)
    expect(tess.personality.distraction).toBeLessThan(nadia.personality.distraction)
  })

  it('is easy to win and still has to be won', () => {
    expect(tess.trajectory.start + tess.trajectory.startJitter).toBeLessThan(ARM_THRESHOLD)
  })

  it('gives her flirt and disclosure for the body of the rep', () => {
    // `gateClauses` emits the two most recently crossed. With a fixed unlock
    // order the top two above the highest threshold are always the same two, so
    // the cheap permissions go first. Nadia does not need this: her thresholds
    // sit above the range she actually runs in. Tess opens at 48.
    for (const warmth of [40, 48, 60, 85]) {
      const line = composeSteering({ persona: tess, warmth })
      expect(line, `warmth ${warmth}`).toContain('You may flirt.')
      expect(line, `warmth ${warmth}`).toContain('You may say something real about your life.')
    }
  })
})

describe('Cass — the fixes that outlived the room they were found in', () => {
  it('stands in a gallery, in the section that says what is inviolable', () => {
    // The original defect: `sceneId` returns `bed ?? reverbIr`, so a borrowed
    // impulse response told her to react "the way a stranger in a bookshop
    // would" while she stood somewhere else entirely. She has her own authored
    // room, so `place` no longer carries the fix on its own — it stays because
    // the NAME of a room and its ACOUSTICS are separate fields by design, and
    // the next character to borrow an IR will need that separation again.
    const compiled = compileInstructions(tess, { canEndScene: true })
    expect(compiled).toContain('the way a stranger in a gallery would react')
    expect(compiled).not.toContain('a stranger in a bookshop')
    expect(tess.room.place).toBe('gallery')
  })

  it('does not stand in the gallery Alex stands in', () => {
    // `gallery` already existed and is a crowded OPENING — crowd wash, glass
    // clinks, one-shots every six seconds. That is a different event in the
    // same building, and putting a quiet weekday afternoon under a drinks
    // reception would be the room contradicting the scene.
    //
    // `gallery-quiet` carries the IDENTICAL reverb, because it is the identical
    // hall, and loses the crowd. `room-tone.test.ts` is what refuses to let two
    // characters authored into different rooms share one scene id.
    expect(tess.room.bed).toBe('gallery-quiet')
    expect(sceneFor('gallery-quiet')?.reverb).toEqual(sceneFor('gallery')?.reverb)
    const quiet = sceneFor('gallery-quiet')!
    for (const layer of quiet.ambient.layers) {
      expect(layer.kind, 'a weekday afternoon is not a crowd').not.toBe('crowd-wash')
    }
    expect(quiet.ambient.masterDb).toBeLessThan(sceneFor('gallery')!.ambient.masterDb)
  })

  it('anchors the live scorer to the room she is actually in', () => {
    // `intimacy` drives `classifyOverreach`, and its bottom anchor is "the shop,
    // the books". Judging a gallery against a bookshop moves her the wrong way.
    //
    // The lookup is by NAME, which is the thing that changed here: renaming her
    // to Cass without a room would have silently returned the default and put
    // the judge back in a bookshop. Every character without a `place` keeps the
    // old literal to the byte.
    expect(scorerPlaceFor('Cass')).toBe('a gallery')
    expect(buildSystemPrompt('Cass', scorerPlaceFor('Cass'))).toContain('talking to in a gallery')
    expect(scorerPlaceFor('Nadia')).toBe(DEFAULT_SCORER_PLACE)
    expect(buildSystemPrompt('Nadia', scorerPlaceFor('Nadia'))).toBe(buildSystemPrompt('Nadia'))
  })

  it('has a want that completes the sentence built around it', () => {
    // `wantClauses` composes "You would rather be ___". The old phrasing gave
    // "You would still rather be these nineteen minutes to go faster than they
    // are going", on every turn of every rep.
    //
    // Robin's has the same fault and is still unfixed — PERSONA-AUDIT §3.4.
    for (const warmth of [10, 40, 80]) {
      const [clause] = wantClauses(tess, warmth)
      expect(clause, `warmth ${warmth}`).toMatch(
        /^You would (still )?rather be getting round the last two rooms before the place shuts[.,]/,
      )
    }
  })

  it('keeps her slug, so every rep anyone has run against rung 1 still resolves', () => {
    // She is a different person. She is not a different ROW. `sessions`,
    // `scores`, `unlocks` and the streak all reference `persona_slug`, and
    // `lib/data/guided.ts` keys her script on it.
    expect(tess.slug).toBe('tess')
    expect(tess.name).toBe('Cass')
    expect(DATING_PERSONAS.tess).toBe(tess)
  })
})
