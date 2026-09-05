import { describe, expect, it } from 'vitest'
import { PERSONAS } from '@/lib/personas'

const ROSTER = Object.values(PERSONAS)
import { DEFAULT_CALIBRATION } from '../types'
import { ElevenLabsPersonaCompiler, deliveryFor, EXPRESSION_TAG } from './persona'
import { remainingReplyDelayMs } from '@/lib/warmth/timing'

describe('latency-aware persona timing', () => {
  it('counts VAD and generation toward the personality beat', () => {
    expect(remainingReplyDelayMs(0, 600)).toBe(100)
    expect(remainingReplyDelayMs(0, 900)).toBe(0)
    expect(remainingReplyDelayMs(30, 600)).toBe(0)
    expect(remainingReplyDelayMs(100, 0)).toBe(0)
    expect(remainingReplyDelayMs(0, -100)).toBe(700)
  })
})

describe('persona-preserving delivery', () => {
  const compiler = new ElevenLabsPersonaCompiler({ ELEVENLABS_TTS_MODEL: 'eleven_v3_conversational' })
  for (const persona of ROSTER) {
    it(`keeps ${persona.name}'s voice, expression and stability at every warmth`, () => {
      const compiled = compiler.compile(persona, DEFAULT_CALIBRATION)
      for (const warmth of [0, 29, 30, 64, 65, 100]) {
        const delivery = deliveryFor(persona, compiled, warmth)
        expect(delivery.settings.stability).toBe(compiled.tts.stability)
        expect(delivery.settings.similarity_boost).toBe(compiled.tts.similarity_boost)
        expect(delivery.deliveryTags[0]).toBe(EXPRESSION_TAG[persona.personality.expression])
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
