/**
 * ElevenLabs persona compiler.
 *
 * The counterpart to the OpenAI compiler, and the reason the abstraction is
 * worth having. Same neutral schema in; a different idiom out.
 *
 * The seam is `delivery` (§04). OpenAI realises it as prose because flat
 * delivery is emergent from the character contract. ElevenLabs realises it as
 * voice settings and — on the tagged model — as audio markers, which force flat
 * delivery independently of the text. That is the thing that makes it the
 * better fit for a product built out of difficulty dials.
 *
 * What changed on this branch: the target is no longer an ElevenAgents config.
 * It is an assembled pipeline — our VAD, OpenAI STT, an OpenAI text model, and
 * ElevenLabs for the voice alone. So `turn` is now our own dial rather than a
 * translation into someone else's turn model, and the character contract is a
 * system prompt rather than an agent prompt.
 *
 * Pure. No network, no SDK, no DOM.
 */

import {
  clamp,
  effectiveSharpness,
  mayInterrupt,
  resolveSilenceMs,
  type Calibration,
  type Persona,
} from '../types'
import type { PersonaCompiler } from '../provider'
import { compileInstructions } from '../openai/persona'
import { paceFor } from '@/lib/warmth/timing'
import {
  resolvePipelineConfig,
  ttsModelSpec,
  type ElevenLabsTtsModelId,
  type PcmOutputFormat,
  type PipelineConfig,
  type PipelineEnv,
  type VoiceSettings,
} from './config'

export interface ElevenLabsPipelineConfig {
  /** The character contract, compiled once. Identical prose to the OpenAI arm,
   *  so a difference in the A/B is a difference in voice, not in writing. */
  llm: {
    model: string
    systemPrompt: string
    temperature: number
    maxTokens: number
  }
  stt: {
    model: string
    /** Sample rate of the PCM we feed the transcriber. */
    sampleRate: number
  }
  tts: {
    model: ElevenLabsTtsModelId
    voice_id: string
    outputFormat: PcmOutputFormat
    /** 0–1. Low stability lets the voice vary; high forces it flat. */
    stability: number
    similarity_boost: number
    speed: number
    /** Whether to request character-level alignment alongside the audio. */
    timestamps: boolean
    /** Credits this plan bills per character. Carried so the browser's own
     *  counter can be reconciled against the dashboard. */
    creditsPerChar: number
  }
  /**
   * Turn-taking. Ours, not theirs — which is exactly why this branch uses raw
   * TTS instead of ElevenAgents.
   */
  turn: {
    /** The calibrated threshold, in the units our own VAD wants. */
    silenceMs: number
    /** Kept in seconds as well, because that is how it reads in a log. */
    turn_timeout: number
    mode: 'silence'
    /** The Level 5 dial. Levels 1–4 never cut across the user (§05). */
    interrupts: boolean
  }
  /** Tags prepended to synthesis to force delivery independently of the text.
   *  Only emitted for a model that reads them. */
  delivery_tags: string[]
}

/**
 * Deliberately not a real voice id.
 *
 * Casting is a hand-written decision like every other line of a character
 * contract, so there is no sensible default to fall back to. Compiling a
 * placeholder and failing loudly at mint beats shipping a rep that connects
 * fine and then 404s on her first word.
 */
const VOICE_BY_TIMBRE: Record<Persona['voice']['timbre'], string> = {
  feminine: 'ELEVENLABS_VOICE_FEMININE',
  masculine: 'ELEVENLABS_VOICE_MASCULINE',
  neutral: 'ELEVENLABS_VOICE_NEUTRAL',
}

/**
 * Delivery tags, removed from anything that becomes a transcript.
 *
 * ElevenLabs CONSUMES a tag as prosody but ECHOES IT BACK in the
 * `/with-timestamps` alignment, character for character. So the tag we prepend
 * for delivery arrives back as part of her line and lands in the stored
 * transcript: real reps recorded `"[playful] Trying to find a birthday present
 * for my sister"`.
 *
 * That is not cosmetic. §04 requires both adapters to emit identical
 * normalised turns because scoring depends on comparability, and the OpenAI arm
 * emits no tags — so every EL turn carried nine characters and a bracketed word
 * that the grader, the word-count band check and `lib/metrics` all read as
 * speech. A provider switch was silently changing the score.
 *
 * Applied at the transcript seam rather than in the compiler: the tag must
 * still reach the vendor, it just must not reach the record. Anything
 * bracketed goes, not only tags we authored — the model is free to open with
 * one of its own, and a stranger does not speak in brackets either way.
 */
export function stripDeliveryTags(text: string): string {
  return text.replace(/\[[^\]]*\]/g, '').replace(/\s{2,}/g, ' ').trim()
}

/** True while nobody has cast this persona. */
export function isUncastVoice(voiceId: string): boolean {
  return voiceId.startsWith('ELEVENLABS_VOICE_')
}

/**
 * Where the two providers genuinely diverge. Under tagged TTS we can state the
 * delivery directly rather than hoping it emerges.
 */
export function compileDeliveryTags(persona: Persona, warmth?: number): string[] {
  const tags: string[] = []
  const p = persona.personality

  // Expression is the constant; warmth only decides how much is being given,
  // never how it sounds. That separation is the whole point of layer 2.
  tags.push(EXPRESSION_TAG[p.expression])

  // The sharpness curve, if a live warmth is supplied. A stranger who is
  // already cold is sharper than a neutral one.
  const sharp = warmth === undefined
    ? p.sharpness
    : effectiveSharpness(p, warmth)
  if (sharp >= 67) tags.push('[cutting]')

  if (p.talkativeness <= 33) tags.push('[clipped]')
  if (p.distraction >= 67) tags.push('[distracted]')
  if (p.signalClarity <= 33) tags.push('[polite]')
  if (p.humour >= 67) tags.push('[amused]')

  return tags
}

/**
 * Layer 2's expression, as an audio tag. Exported so the conformance tests can
 * assert the *mapping* rather than restate whichever expression a character
 * happens to carry today — a tuning pass moves those, and a test that breaks
 * when a persona is retuned is a test that argues against retuning personas.
 */
export const EXPRESSION_TAG: Record<Persona['personality']['expression'], string> = {
  playful: '[playful]',
  dry: '[dry]',
  earnest: '[earnest]',
  flat: '[flat]',
}

/**
 * Stability off the persona.
 *
 * A cold character must not warm up on her own between turns, and this is the
 * dial that stops her. OpenAI has no equivalent — under speech-to-speech, when
 * the model softens its voice softens with it.
 */
export function stabilityFor(persona: Persona): number {
  // Expression, not warmth. A flat character must stay flat at every point on
  // the meter; under OpenAI the voice softens as the model softens and there is
  // nothing to be done about it, which is the argument §04 makes for this arm.
  return STABILITY_BY_EXPRESSION[persona.personality.expression]
}

const STABILITY_BY_EXPRESSION: Record<Persona['personality']['expression'], number> = {
  flat: 0.9,
  dry: 0.75,
  earnest: 0.55,
  playful: 0.4,
}

/** Delivery may lean with interest, but the cast voice and expression never
 *  change. Stability remains the authored (or explicitly auditioned) baseline.
 *  Three small pace bands avoid a different voice setting on every meter tick. */
export function deliveryFor(
  persona: Persona,
  compiled: Pick<ElevenLabsPipelineConfig, 'tts' | 'delivery_tags'>,
  warmth: number,
): { settings: VoiceSettings; deliveryTags: string[] } {
  const interest = Number.isFinite(warmth) ? clamp(warmth, 0, 100) : 40
  const paceBand = interest < 30 ? 15 : interest < 65 ? 40 : 70
  return {
    settings: {
      stability: compiled.tts.stability,
      similarity_boost: compiled.tts.similarity_boost,
      speed: clamp(paceFor(compiled.tts.speed, paceBand), 0.7, 1.2),
    },
    deliveryTags: compiled.delivery_tags.length > 0 ? compileDeliveryTags(persona, interest) : [],
  }
}

export class ElevenLabsPersonaCompiler implements PersonaCompiler<ElevenLabsPipelineConfig> {
  private readonly config: PipelineConfig

  constructor(env: PipelineEnv | PipelineConfig = {}) {
    this.config = isResolved(env) ? env : resolvePipelineConfig(env)
  }

  compile(persona: Persona, calibration: Calibration): ElevenLabsPipelineConfig {
    const spec = ttsModelSpec(this.config.tts.model)
    const silenceMs = resolveSilenceMs(calibration)

    // The character contract is provider-neutral prose and carries over intact.
    // Only delivery changes hands, from prose to tags and voice settings.
    //
    // `canEndScene` is false here: there is no tool channel in a raw-TTS
    // pipeline. The exit rides on a sentinel the model appends instead
    // (EXIT_SENTINEL in ./llm.ts), which is stripped before synthesis — so
    // unlike a tool name it cannot leak into speech at all.
    // NO SECOND COPY OF `BANNED_REGISTER` HERE, and its absence is the fix.
    //
    // `compileInstructions` already closes with those twelve lines under
    // "# Absolute rules". This compiler appended them again under "# Never", so
    // the shipping arm's prompt carried the same twelve prohibitions twice —
    // about 1,100 characters of it — while the realtime arm carried them once.
    //
    // That breaks the claim at the top of this file. §04 wants "identical prose
    // to the OpenAI arm, so a difference in the A/B is a difference in voice,
    // not in writing", and the two prompts were not identical prose. It is also
    // the wrong kind of instruction to double: thirty-six prohibitions and no
    // demonstrations push a writer towards hedging, and hedging is words.
    const systemPrompt = [
      compileInstructions(persona, { canEndScene: false }),
      '',
      '# Output',
      'Reply with spoken words only. No stage directions, no asterisks, no markdown, no emoji.',
      ...(spec.supportsAudioTags
        ? [
            'You may open a reply with at most one bracketed delivery tag such as [flat] or [distracted] when it genuinely fits. Never invent tags and never use more than one.',
          ]
        : ['Never write anything in square brackets.']),
    ].join('\n')

    const settings = this.voiceSettings(persona)

    return {
      llm: {
        model: this.config.llm.model,
        systemPrompt,
        temperature: this.config.llm.temperature,
        maxTokens: this.config.llm.maxTokens,
      },
      stt: {
        model: this.config.stt.model,
        sampleRate: 24_000,
      },
      tts: {
        model: spec.id,
        voice_id:
          persona.voice.ids.elevenlabs
          ?? this.config.tts.voiceId
          ?? VOICE_BY_TIMBRE[persona.voice.timbre],
        outputFormat: this.config.tts.outputFormat,
        stability: settings.stability,
        similarity_boost: settings.similarity_boost,
        speed: settings.speed,
        timestamps: spec.supportsTimestamps,
        creditsPerChar: this.config.tts.creditsPerChar ?? spec.creditsPerChar,
      },
      turn: {
        silenceMs,
        // Their turn model took seconds. Ours takes milliseconds; both are kept
        // so a log line reads the same on either arm.
        turn_timeout: silenceMs / 1000,
        mode: 'silence',
        interrupts: mayInterrupt(persona),
      },
      delivery_tags: spec.supportsAudioTags ? compileDeliveryTags(persona) : [],
    }
  }

  /** Persona first, environment override second — the env dials exist to be
   *  turned during a listening pass, so they win when explicitly set. */
  private voiceSettings(persona: Persona): VoiceSettings {
    const env = this.config.tts.settings
    return {
      stability: Number.isFinite(env.stability) ? env.stability : stabilityFor(persona),
      similarity_boost: env.similarity_boost,
      speed: Number.isFinite(env.speed)
        ? clamp(env.speed, 0.7, 1.2)
        : clamp(persona.voice.pace ?? 1, 0.7, 1.2),
    }
  }
}

function isResolved(value: PipelineEnv | PipelineConfig): value is PipelineConfig {
  return typeof (value as PipelineConfig).tts === 'object'
}
