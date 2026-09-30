import { describe, expect, it } from 'vitest'
import { PERSONAS } from '@/lib/personas'

const ROSTER = Object.values(PERSONAS)
import { DEFAULT_CALIBRATION } from '../types'
import { ElevenLabsPersonaCompiler, deliveryFor, DATING_TAG_RULE, EXPRESSION_TAG, WARMTH_TAGS, tagReply } from './persona'
import { bandFor } from '@/lib/warmth/bands'
import { remainingResponseDelayMs, responseDelayFor } from '@/lib/warmth/timing'

describe('latency-aware persona timing', () => {
  it('counts VAD and generation toward the personality beat', () => {
    // The target is an ONSET measured from the user finishing, not a wait to
    // add on top of the pipeline. Cold bands are usually already paid for.
    const cold = responseDelayFor(0, undefined, () => 0.5)
    expect(remainingResponseDelayMs(cold, 0)).toBe(cold)
    expect(remainingResponseDelayMs(cold, cold - 100)).toBe(100)
    expect(remainingResponseDelayMs(cold, cold + 400)).toBe(0)
    expect(remainingResponseDelayMs(responseDelayFor(90, undefined, () => 0.5), 800)).toBe(0)
  })
})

describe('persona-preserving delivery', () => {
  const compiler = new ElevenLabsPersonaCompiler({ ELEVENLABS_TTS_MODEL: 'eleven_v3_conversational' })
  for (const persona of ROSTER) {
    it(`keeps ${persona.name}'s voice and stability at every warmth, and tags by track`, () => {
      const compiled = compiler.compile(persona, DEFAULT_CALIBRATION)
      for (const warmth of [0, 29, 30, 64, 65, 100]) {
        const delivery = deliveryFor(persona, compiled, warmth)
        expect(delivery.settings.stability).toBe(compiled.tts.stability)
        expect(delivery.settings.similarity_boost).toBe(compiled.tts.similarity_boost)
        // Dating: the band's pair (WARMTH_TAGS). Interview: the constant first.
        if (persona.track === 'dating') {
          const { usual, when } = WARMTH_TAGS[bandFor(warmth)]
          expect(delivery.deliveryTags).toEqual([usual, when])
        } else {
          expect(delivery.deliveryTags[0]).toBe(EXPRESSION_TAG[persona.personality.expression])
        }
        expect(Math.abs(delivery.settings.speed / compiled.tts.speed - 1)).toBeLessThanOrEqual(0.026)
        expect(compiled.tts.voice_id).toBe(persona.voice.ids.elevenlabs)
      }
    })
  }

  it('does not introduce delivery tags to Flash', () => {
    const persona = ROSTER[0]!
    const compiled = new ElevenLabsPersonaCompiler().compile(persona, DEFAULT_CALIBRATION)
    expect(deliveryFor(persona, compiled, 80).deliveryTags).toEqual([])
  })
})

describe('the dating arm tags by warmth', () => {
  const compiler = new ElevenLabsPersonaCompiler({ ELEVENLABS_TTS_MODEL: 'eleven_v4_turbo' })
  const nadia = PERSONAS.nadia!
  const compiled = compiler.compile(nadia, DEFAULT_CALIBRATION)
  const pairAt = (warmth: number) => deliveryFor(nadia, compiled, warmth).deliveryTags

  it('allows flat or bored when cold, warm or curious in the middle, warm or amused when warm', () => {
    expect([-10, 0, 19, 20, 39].map(pairAt)).toEqual(Array(5).fill(['[flat]', '[bored]']))
    expect([40, 59].map(pairAt)).toEqual(Array(2).fill(['[warm]', '[curious]']))
    expect([60, 79, 80, 100].map(pairAt)).toEqual(Array(4).fill(['[warm]', '[amused]']))
    expect(Object.values(WARMTH_TAGS).flatMap(({ usual, when }) => [usual, when])).not.toContain('[playful]')
  })

  it('keeps the tag she chose when her band allows it', () => {
    const dating = { track: 'dating' } as const
    expect(tagReply('[bored] Right.', pairAt(25), dating)).toBe('[bored] Right.')
    expect(tagReply('[curious] Where was that?', pairAt(50), dating)).toBe('[curious] Where was that?')
    expect(tagReply('[amused] Okay, that was good.', pairAt(70), dating)).toBe('[amused] Okay, that was good.')
    expect(tagReply('[Amused]Okay, that was good. ', pairAt(70), dating)).toBe('[amused] Okay, that was good.')
  })

  it('sends the usual tag when she chose one her band does not allow, or none', () => {
    const dating = { track: 'dating' } as const
    // Amused while cold, bored while warm, and her old constant: all bounded.
    expect(tagReply('[amused] No, you didn’t.', pairAt(25), dating)).toBe('[flat] No, you didn’t.')
    expect(tagReply('[bored] That is sweet.', pairAt(70), dating)).toBe('[warm] That is sweet.')
    expect(tagReply('[playful] Not mourning.', pairAt(25), dating)).toBe('[flat] Not mourning.')
    expect(tagReply('Not mourning.', pairAt(25), dating)).toBe('[flat] Not mourning.')
    expect(tagReply('Not mourning.', [], dating)).toBe('Not mourning.')
  })

  it('leaves interviewers as they were: her own tag wins, otherwise the constant', () => {
    expect(tagReply('[dry] Walk me through it.', ['[earnest]'], { track: 'interview' })).toBe('[dry] Walk me through it.')
    expect(tagReply('Walk me through it.', ['[earnest]'], { track: 'interview' })).toBe('[earnest] Walk me through it.')
  })

  it('tells a dating character the tags and when each is earned, and nobody else', () => {
    expect(compiled.llm.systemPrompt).toContain(DATING_TAG_RULE)
    for (const tag of ['[flat]', '[bored]', '[warm]', '[curious]', '[amused]']) expect(DATING_TAG_RULE).toContain(tag)
    const interviewer = Object.values(PERSONAS).find((persona) => persona.track === 'interview')!
    expect(compiler.compile(interviewer, DEFAULT_CALIBRATION).llm.systemPrompt).not.toContain(DATING_TAG_RULE)
  })
})
