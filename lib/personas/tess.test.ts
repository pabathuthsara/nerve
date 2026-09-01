/**
 * Tess is Nadia, in a launderette, on the rung-1 curve.
 *
 * ── WHY THIS FILE EXISTS IN THIS SHAPE ───────────────────────────────────
 *
 * It used to assert the opposite. `PERSONA-AUDIT.md` found that the shared band
 * table was tuned against Nadia and concluded it was overwriting any character
 * authored against that grain, so Tess was given her own bands, her own posture
 * reading, her own punctuation, a mood roll and a list of things to say — and
 * this file asserted each of them.
 *
 * The person who has talked to both then said Nadia is fun and Tess still read
 * as an AI. Nadia runs the shared table with none of those overrides. So the
 * table was not the thing flattening Tess; it is most of what makes Nadia good.
 *
 * The assertions therefore invert. What is checked now is **fidelity** — that
 * her contract really is Nadia's and not a paraphrase, that she carries none of
 * the per-character escape hatches, and that the only things still hers are
 * layer 1 and the two dials that layer 1 implies. A port that drifts is a port
 * that stops being the thing that was working.
 *
 * Two fixes were kept from the audit, and they are asserted separately at the
 * bottom, because both are broken OUTPUT rather than an opinion about who she
 * is: the room name, and a `want` that completes the sentence built around it.
 */

import { describe, expect, it } from 'vitest'
import { PERSONAS, RETIRED_PERSONAS } from './index'
import { tess } from './tess'
import { nadia } from './nadia'
import { compileInstructions } from '@/lib/voice/openai/persona'
import { composeSteering, wantClauses } from '@/lib/warmth/steering'
import { bandFor, specFor } from '@/lib/warmth/bands'
import { DEFAULT_SCORER_PLACE, buildSystemPrompt, scorerPlaceFor } from '@/lib/warmth/prompt'
import { ARM_THRESHOLD } from '@/lib/data/rep-rules'
import type { Persona } from '@/lib/voice/types'

const EVERYONE: Persona[] = [...Object.values(PERSONAS), ...Object.values(RETIRED_PERSONAS)]

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
  'On the first hello, use a plain greeting or a concrete observation. Do not open with any question, including a tag question.',
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

describe('Tess — the port is faithful', () => {
  it('carries every one of Nadia\'s craft rules verbatim', () => {
    for (const rule of NADIA_CRAFT) {
      expect(nadia.contract, `nadia is missing: ${rule}`).toContain(rule)
      expect(tess.contract, `tess is missing: ${rule}`).toContain(rule)
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

  it('changes only the props', () => {
    // The exhaustive list of what a launderette port is allowed to touch. If
    // something else diverges it belongs in this test with a reason.
    expect(tess.contract).toContain('a launderette')
    expect(tess.contract).toContain('Your machine has nineteen minutes left on it')
    expect(tess.contract).toContain('claim knowledge of the launderette, its machines, or its ownership')
    expect(tess.contract).toContain('Do not narrate watching the machine')
    expect(tess.contract).toContain('Never retreat to your book, the machine')
    // And nothing of the bookshop survives the port.
    for (const leak of ['bookshop', 'the shelves', 'in stock', 'browsing']) {
      expect(tess.contract.toLowerCase(), `bookshop leak: ${leak}`).not.toContain(leak)
    }
  })

  it('keeps the material that makes her good company', () => {
    // Nadia leans on having something in her hands and an opinion about it.
    // A woman with nineteen minutes and a paperback is the same person as a
    // woman killing forty minutes in a shop, so the book ports rather than
    // being replaced with launderette small talk.
    for (const line of [
      'people being sad in nice houses',
      'Tana French',
      'airport thrillers',
      'something in logistics that you find boring',
    ]) {
      expect(tess.contract, line).toContain(line)
      expect(nadia.contract, line).toContain(line)
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

describe('Tess — she sounds like Nadia because the dials say so', () => {
  it('matches her on every dial that is not the rung', () => {
    // `patience` and `distraction` are what "easier" means in layer 2 and are
    // pinned against Nadia's by `roster.test.ts`. Everything else is hers.
    expect(tess.personality.sharpness).toBe(nadia.personality.sharpness)
    expect(tess.personality.sharpnessLowWarmthBoost).toBe(nadia.personality.sharpnessLowWarmthBoost)
    expect(tess.personality.humour).toBe(nadia.personality.humour)
    expect(tess.personality.talkativeness).toBe(nadia.personality.talkativeness)
    expect(tess.personality.expression).toBe(nadia.personality.expression)
    expect(tess.personality.signalClarity).toBe(nadia.personality.signalClarity)
  })

  it('compiles to the same derived behaviour block except the disposition', () => {
    // The disposition line is banded off `trajectory.start`, which IS the rung,
    // so it is the one line that must differ. Every other derived sentence —
    // effort, clarity, patience, delivery — should read identically, because
    // they are read off dials she now shares.
    const hers = compileInstructions(tess, { canEndScene: true })
    const nadias = compileInstructions(nadia, { canEndScene: true })
    for (const line of [
      'You meet them halfway. You answer what you are asked and occasionally add something, but you do not drive.',
      'Your level of interest is obvious and unmistakable from how you respond.',
      'You are light and quick, and you enjoy winding people up a little.',
      'You are funny more often than not, and dry about it.',
    ]) {
      expect(nadias, `control: ${line}`).toContain(line)
      expect(hers, `tess: ${line}`).toContain(line)
    }
  })

  it('reads the same shared band table she does, at every warmth', () => {
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
    for (const persona of EVERYONE) {
      expect(persona.disposition, persona.slug).toBeUndefined()
      expect(persona.bandDirectives, persona.slug).toBeUndefined()
      expect(persona.postureMode, persona.slug).toBeUndefined()
      expect(persona.moods, persona.slug).toBeUndefined()
      expect(persona.steerHeartbeatTurns, persona.slug).toBeUndefined()
      expect(persona.verbosityMedian, persona.slug).toBeUndefined()
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

describe('Tess — the two fixes kept from the audit', () => {
  it('stands in a launderette, in the section that says what is inviolable', () => {
    // `sceneId` returns `bed ?? reverbIr`, and with ambient beds off that is the
    // impulse response — so her Absolute rules told her to react "the way a
    // stranger in a bookshop would" while she stood in a launderette. The
    // reverb borrowing is an acoustic choice and was never the bug.
    const compiled = compileInstructions(tess, { canEndScene: true })
    expect(compiled).toContain('the way a stranger in a launderette would react')
    expect(compiled).not.toContain('a stranger in a bookshop')
    expect(tess.room.reverbIr).toBe('bookshop')
    expect(tess.room.place).toBe('launderette')
  })

  it('anchors the live scorer to a launderette', () => {
    // `intimacy` drives `classifyOverreach`, and its bottom anchor is "the shop,
    // the books". Judging a launderette against a bookshop moves her the wrong
    // way. Every character without a `place` keeps the old literal to the byte.
    expect(scorerPlaceFor('Tess')).toBe('a launderette')
    expect(buildSystemPrompt('Tess', scorerPlaceFor('Tess'))).toContain('talking to in a launderette')
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
        /^You would (still )?rather be left alone with the book you are halfway through[.,]/,
      )
    }
  })
})
