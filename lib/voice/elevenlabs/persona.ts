/**
 * ElevenLabs persona compiler.
 *
 * The counterpart to the OpenAI compiler, and the reason the abstraction is
 * worth having. Same neutral schema in; a different idiom out.
 *
 * The seam is `delivery` (§04). OpenAI realises it as prose because flat
 * delivery is emergent from the character contract. ElevenLabs realises it as
 * audio tags, which force flat delivery independently of the text — the thing
 * that makes it the better fit for a product built out of difficulty dials.
 *
 * This compiler is real and tested. Only the transport is stubbed.
 */

import { resolveSilenceMs, type Calibration, type Persona } from '../types'
import type { PersonaCompiler } from '../provider'
import { BANNED_REGISTER, compileInstructions } from '../openai/persona'

export interface ElevenLabsAgentConfig {
  agent: {
    prompt: { prompt: string }
    /** First turn is always the user's in Nerve — the character never opens. */
    first_message: string
    language: 'en'
  }
  tts: {
    voice_id: string
    /** 0–1. Low stability lets the voice vary; high forces it flat. */
    stability: number
    similarity_boost: number
    speed: number
  }
  turn: {
    /** Their turn model takes seconds, not milliseconds. */
    turn_timeout: number
    mode: 'silence' | 'turn'
  }
  /** Tags prepended to synthesis to force delivery independently of the text. */
  delivery_tags: string[]
}

const VOICE_BY_TIMBRE: Record<Persona['voice']['timbre'], string> = {
  // Placeholders. Real voice ids get cast before the blind A/B (§04).
  feminine: 'ELEVENLABS_VOICE_FEMININE',
  masculine: 'ELEVENLABS_VOICE_MASCULINE',
  neutral: 'ELEVENLABS_VOICE_NEUTRAL',
}

/**
 * Where the two providers genuinely diverge. Under tagged TTS we can state the
 * delivery directly rather than hoping it emerges.
 */
export function compileDeliveryTags(persona: Persona): string[] {
  const tags: string[] = []
  const { warmth, expansiveness } = persona.delivery

  if (warmth <= 33) tags.push('[flat]', '[disinterested]')
  else if (warmth <= 66) tags.push('[neutral]')
  else tags.push('[warm]')

  if (expansiveness <= 33) tags.push('[clipped]')
  if (persona.distraction >= 67) tags.push('[distracted]')
  if (persona.signal_clarity <= 33) tags.push('[polite]')

  for (const note of persona.delivery.notes) {
    const tag = note.toLowerCase().match(/^\[(.+)\]$/)
    if (tag) tags.push(note)
  }
  return tags
}

export class ElevenLabsPersonaCompiler implements PersonaCompiler<ElevenLabsAgentConfig> {
  compile(persona: Persona, calibration: Calibration): ElevenLabsAgentConfig {
    // The character contract is provider-neutral prose and carries over intact.
    // Only delivery changes hands, from prose to tags.
    const prompt = [
      compileInstructions(persona),
      '',
      '# Never',
      ...BANNED_REGISTER.map((line) => `- ${line}`),
    ].join('\n')

    return {
      agent: {
        prompt: { prompt },
        first_message: '',
        language: 'en',
      },
      tts: {
        voice_id: persona.voice.ids.elevenlabs ?? VOICE_BY_TIMBRE[persona.voice.timbre],
        // High stability is what buys us a character who will not warm up on
        // her own. This has no OpenAI equivalent.
        stability: persona.delivery.warmth <= 33 ? 0.85 : 0.5,
        similarity_boost: 0.75,
        speed: persona.delivery.pace,
      },
      turn: {
        turn_timeout: resolveSilenceMs(calibration) / 1000,
        mode: 'silence',
      },
      delivery_tags: compileDeliveryTags(persona),
    }
  }
}
