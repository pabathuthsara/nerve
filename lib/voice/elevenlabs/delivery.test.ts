import { describe, expect, it } from 'vitest'
import { PERSONAS } from '@/lib/personas'

const ROSTER = Object.values(PERSONAS)
import { DEFAULT_CALIBRATION } from '../types'
import { ElevenLabsPersonaCompiler, deliveryFor, EXPRESSION_TAG } from './persona'
import { RESPONSE_FLOOR_MS, remainingResponseDelayMs, responseDelayFor } from '@/lib/warmth/timing'
import { bandFor } from '@/lib/warmth/bands'
import { STABILITY_RAMP, stabilityForWarmth } from './persona'

describe('latency-aware persona timing', () => {
  it('counts VAD and generation toward the personality beat', () => {
    // The target is an ONSET measured from the user finishing, not a wait to
    // add on top of the pipeline. Cold bands are usually already paid for.
    const cold = responseDelayFor(0, undefined, () => 0.5)
    expect(remainingResponseDelayMs(cold, 0)).toBe(cold)
    expect(remainingResponseDelayMs(cold, cold - 100)).toBe(100)
    expect(remainingResponseDelayMs(cold, cold + 400)).toBe(0)
    // Since R6 the warm onset sits at the pipeline's floor, so once the
    // pipeline has spent the floor there is nothing left to hold.
    expect(remainingResponseDelayMs(responseDelayFor(90, undefined, () => 0.5), RESPONSE_FLOOR_MS + 100)).toBe(0)
  })
})

describe('persona-preserving delivery', () => {
  const compiler = new ElevenLabsPersonaCompiler({ ELEVENLABS_TTS_MODEL: 'eleven_v3_conversational' })
  for (const persona of ROSTER) {
    it(`keeps ${persona.name}'s voice, expression and stability at every warmth`, () => {
      const compiled = compiler.compile(persona, DEFAULT_CALIBRATION)
      for (const warmth of [0, 29, 30, 64, 65, 100]) {
        const delivery = deliveryFor(persona, compiled, warmth)
        // STABILITY FOLLOWS THE BAND on the dating arm (PERSONA-REALISM-REPORT
        // R2): the compiled value is the COLD end, and it only ever moves toward
        // Natural as she warms. Every other track keeps the compiled value.
        expect(delivery.settings.stability).toBe(stabilityForWarmth(persona, compiled.tts.stability, warmth))
        expect(delivery.settings.stability).toBeLessThanOrEqual(Math.max(compiled.tts.stability, 0.8))
        if (persona.track !== 'dating') expect(delivery.settings.stability).toBe(compiled.tts.stability)
        expect(delivery.settings.similarity_boost).toBe(compiled.tts.similarity_boost)
        expect(delivery.deliveryTags[0]).toBe(EXPRESSION_TAG[persona.personality.expression])
        expect(Math.abs(delivery.settings.speed / compiled.tts.speed - 1)).toBeLessThanOrEqual(0.026)
        expect(compiled.tts.voice_id).toBe(persona.voice.ids.elevenlabs)
      }
    })
  }

  it('warms her voice with the meter, and never on her own', () => {
    // The production shape: the env dial is the cold end.
    const shipped = new ElevenLabsPersonaCompiler({ ELEVENLABS_TTS_MODEL: 'eleven_v3_conversational', ELEVENLABS_STABILITY: '0.9' })
    const nadia = PERSONAS.nadia!
    const compiled = shipped.compile(nadia, DEFAULT_CALIBRATION)
    const at = (warmth: number) => deliveryFor(nadia, compiled, warmth).settings.stability
    expect([5, 25, 45, 65, 85].map(at)).toEqual([0.9, 0.8, 0.65, 0.5, 0.5])
    // Monotonic in warmth: colder is never less stable.
    for (let w = -20; w < 100; w += 1) expect(at(w + 1), `@${w}`).toBeLessThanOrEqual(at(w))
    expect(STABILITY_RAMP[bandFor(85)]).toBe(0)
    // Robin's mask holds until she is genuinely engaged (§7.4).
    const robin = PERSONAS.robin!
    const robinCompiled = shipped.compile(robin, DEFAULT_CALIBRATION)
    expect([25, 45, 65].map((w) => deliveryFor(robin, robinCompiled, w).settings.stability)).toEqual([0.8, 0.8, 0.5])
  })

  it('does not introduce delivery tags to Flash', () => {
    const persona = ROSTER[0]!
    const compiled = new ElevenLabsPersonaCompiler().compile(persona, DEFAULT_CALIBRATION)
    expect(deliveryFor(persona, compiled, 80).deliveryTags).toEqual([])
  })
})
