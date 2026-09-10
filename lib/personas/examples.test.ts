/**
 * The authored register examples, and the properties that make them work.
 *
 * ── WHY THESE ASSERTIONS AND NOT A SNAPSHOT ──────────────────────────────
 *
 * The examples exist because 1,274 real agent turns contained six disfluencies,
 * three bare answers and one request to repeat something. They are a RANGE, and
 * the failure mode of a few-shot block is that it stops being one: an author
 * adds a good line, then another, and six months later every example is a
 * finished joke and the block is teaching the exact register it was written to
 * correct.
 *
 * So the tests are about the SHAPE of the set rather than its contents. An
 * author may rewrite every line here; they may not quietly make them all
 * clever.
 */

import { describe, expect, it } from 'vitest'

import { DATING_PERSONAS, PERSONAS, RETIRED_PERSONAS } from './index'
import { compileInstructions } from '@/lib/voice/openai/persona'
import { spokenWordCount } from '@/lib/voice/elevenlabs/truncate'
import { MAX_BAND_WORDS } from '@/lib/warmth/bands'
import { seededRandom } from '@/lib/voice/seed'
import type { Persona } from '@/lib/voice/types'

const SHIPPED = Object.values(DATING_PERSONAS)
const seed = () => seededRandom('examples')
const compile = (persona: Persona) =>
  compileInstructions(persona, { canEndScene: false, rng: seed() })

describe('authored register examples', () => {
  it('every shipped dating character has a set', () => {
    // A shipped character without one is a character still writing epigrams,
    // and the whole roster meets a new account within its first three reps.
    for (const persona of SHIPPED) {
      expect(persona.examples?.length ?? 0, `${persona.slug} has no examples`)
        .toBeGreaterThanOrEqual(6)
    }
  })

  it.each(SHIPPED.map((p) => [p.slug, p] as const))(
    '%s never demonstrates a line longer than her own band allows',
    (slug, persona) => {
      // An example above the widest band ceiling is an example she can never
      // legally say, so it teaches a register the pipeline will then truncate.
      for (const example of persona.examples ?? []) {
        expect(spokenWordCount(example.her), `${slug}: "${example.her}"`)
          .toBeLessThanOrEqual(MAX_BAND_WORDS)
      }
    },
  )

  it.each(SHIPPED.map((p) => [p.slug, p] as const))(
    '%s shows the bottom of her register, not just the top',
    (slug, persona) => {
      const hers = (persona.examples ?? []).map((example) => example.her)
      // At least a quarter of the set is four words or fewer. This is the
      // property that decays first: a flat line reads as a weak example and an
      // author "improves" it, which is how the block becomes what it replaced.
      const short = hers.filter((line) => spokenWordCount(line) <= 4)
      expect(short.length, `${slug} has too few short lines: ${hers.join(' / ')}`)
        .toBeGreaterThanOrEqual(Math.ceil(hers.length / 4))
    },
  )

  it('demonstrates, somewhere on the roster, the four things she never did', () => {
    // Measured across 1,274 production turns before this existed:
    //   disfluency 6 (0.5%) · self-repair 5 (0.4%) · "what?" 1 · bare "Yeah." 3
    const all = SHIPPED.flatMap((persona) => persona.examples ?? []).map((e) => e.her)
    const any = (pattern: RegExp) => all.some((line) => pattern.test(line))
    expect(any(/\b(um|uh|hm|erm)\b/i), 'no example hesitates').toBe(true)
    expect(any(/\bsorry\b|\bwhat\b.*\?|\bI said\b/i), 'no example mishears him').toBe(true)
    expect(any(/^(yeah|mm|right|thanks|tess|nadia)\.?$/i), 'no example is a bare answer').toBe(true)
    expect(any(/\bnot really\b|\bno idea\b|\bnothing good\b/i), 'no example is flatly unimpressed')
      .toBe(true)
  })

  it('never puts a fact about HIM into his mouth', () => {
    // MEASURED, 10 September 2026. One of these shipped as
    // `him: 'I am Dan, by the way.'` — and she called the user Dan, in a rep
    // where he had never said it.
    //
    // A few-shot exchange is read as a conversation that HAPPENED, so a
    // personal fact planted in his line becomes a personal fact she believes.
    // That is the same frame break as the `# His name` leak these examples were
    // written alongside, arriving through the fix rather than through the bug.
    //
    // A QUESTION is fine ("Are you from London?" asserts nothing), and so is
    // something of HERS he can see ("What do you think of the Tana French?").
    // What is refused is him STATING something about himself.
    const NAMES = /\b(?:i(?:'m| am)|my name(?:'s| is)|call me)\s+[A-Z][a-z]+|,\s*by the way\b/
    const FIRST_PERSON_PROPER = /\bI\b[^.?!]*?\b(?!I\b)[A-Z][a-z]{2,}\b/
    for (const persona of Object.values(PERSONAS)) {
      for (const example of persona.examples ?? []) {
        expect(example.him, `${persona.slug}: names him`).not.toMatch(NAMES)
        expect(example.him, `${persona.slug}: gives him a proper noun`)
          .not.toMatch(FIRST_PERSON_PROPER)
      }
    }
  })

  it('never models the punctuation the contract forbids', () => {
    // The contract has said "Never use em-dashes" on every character since it
    // was written, and 42 of 1,274 turns contained one. An example carrying one
    // would be the instruction and the counter-example in the same prompt.
    for (const persona of Object.values(PERSONAS)) {
      for (const example of persona.examples ?? []) {
        expect(`${example.him} ${example.her}`, persona.slug).not.toMatch(/[–—]/)
      }
    }
  })

  it('keeps the framing that stops the block being read as a script', () => {
    // Both sentences are load-bearing. Without the first, a few-shot block in a
    // dialogue prompt gets parroted — and nine characters reciting the same
    // eight lines is a louder tell than nine characters writing epigrams.
    // Without the second, nothing in ~40 prohibitions ever says that a boring
    // answer is a correct answer.
    const prompt = compile(SHIPPED[0]!)
    expect(prompt).toContain('not lines to reuse')
    expect(prompt).toContain('You do not have to be interesting')
  })

  it('never leaks an authoring note into the prompt', () => {
    // `note` explains why a line is in the set. It is exactly the kind of
    // meta-commentary that would push the model back towards performing.
    for (const persona of SHIPPED) {
      const prompt = compile(persona)
      for (const example of persona.examples ?? []) {
        if (example.note) expect(prompt, persona.slug).not.toContain(example.note)
      }
    }
  })

  it('compiles nothing at all for a character with no examples', () => {
    // Absent is valid and means the behaviour this product had before. The
    // retired roster carries none and must not grow an empty heading.
    for (const persona of Object.values(RETIRED_PERSONAS)) {
      if (persona.examples?.length) continue
      expect(compile(persona), persona.slug).not.toContain('# How you actually sound')
    }
  })
})

describe('his name', () => {
  const withName = (persona: Persona, extra: Partial<Persona> = {}): string =>
    compileInstructions({ ...persona, userName: 'John', ...extra }, { canEndScene: false, rng: seed() })

  it('is withheld from a character who has not met him', () => {
    // MEASURED, 9 September 2026: at t=77.4s Tess said "…catch me at the book
    // club, John." At t=84.0s he said "My name is John." She used his name 6.7
    // seconds before he gave it, and five more times in fifteen turns.
    //
    // The block used to read "He is called John. You do not know that yet." You
    // cannot hand a model a fact and forbid it from knowing the fact.
    for (const persona of SHIPPED) {
      const prompt = withName(persona, { memorySummary: undefined })
      expect(prompt, persona.slug).not.toContain('John')
      expect(prompt, persona.slug).not.toContain('# His name')
    }
  })

  it('is given to a character who has met him before, because then she has it', () => {
    const prompt = withName(SHIPPED[0]!, { memorySummary: 'He was choosing a book for his brother.' })
    expect(prompt).toContain('# His name')
    expect(prompt).toContain('you have met him before')
    // And it still says how rarely people use a name they already have.
    expect(prompt).toContain('never twice in a row')
  })
})
