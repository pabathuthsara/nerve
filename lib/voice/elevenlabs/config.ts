/**
 * ElevenLabs pipeline configuration.
 *
 * Everything here is a dial rather than a constant, because the whole point of
 * this branch is to A/B it by ear against gpt-realtime and none of these
 * numbers can be decided from a desk.
 *
 * WHICH ELEVENLABS PRODUCT: this is **ElevenAPI — raw text-to-speech**, billed
 * per character. It is deliberately *not* ElevenAgents. Agents would take over
 * turn-taking, and turn-taking is ours: a calibrated silence threshold per user
 * (§05, problem one) is the thing the whole exposure mechanism rests on. We
 * want their voice and nothing else.
 *
 * Pure. No network, no SDK, no DOM. Runs on the edge, in the browser and in
 * tests.
 */

/* ------------------------------------------------------------------ *
 * TTS models
 * ------------------------------------------------------------------ */

export type ElevenLabsTtsModelId = 'eleven_flash_v2_5' | 'eleven_v3_conversational'

export interface TtsModelSpec {
  id: ElevenLabsTtsModelId
  /** Vendor-documented time to first byte. Expectation-setting only — the
   *  measured number is what `pipeline.stages.ttsFirstByteMs` reports. */
  nominalFirstByteMs: number
  /** USD per 1,000 characters. Identical across both models: the choice
   *  between them is latency versus expressiveness, never cost. */
  usdPer1kChars: number
  /**
   * Credits consumed per character.
   *
   * Held as a per-model dial rather than assumed, because ElevenLabs has at
   * times billed Flash at half a credit per character on paid plans while
   * charging the full credit on others. Set ELEVENLABS_CREDITS_PER_CHAR if the
   * dashboard disagrees with what we count; the USD figure above is derived
   * from characters and is unaffected either way.
   */
  creditsPerChar: number
  /** Whether the model reads inline delivery tags like `[flat]`. */
  supportsAudioTags: boolean
  /** Whether the `/with-timestamps` variant returns character alignment.
   *  Alignment is what makes barge-in truncation exact rather than estimated. */
  supportsTimestamps: boolean
}

export const TTS_MODELS: Record<ElevenLabsTtsModelId, TtsModelSpec> = {
  eleven_flash_v2_5: {
    id: 'eleven_flash_v2_5',
    nominalFirstByteMs: 75,
    usdPer1kChars: 0.05,
    creditsPerChar: 1,
    supportsAudioTags: false,
    supportsTimestamps: true,
  },
  eleven_v3_conversational: {
    id: 'eleven_v3_conversational',
    nominalFirstByteMs: 280,
    usdPer1kChars: 0.05,
    creditsPerChar: 1,
    // v3 is the tagged model. This is the seam §04 names: under ElevenLabs
    // flat delivery is forced by markers, not hoped for.
    supportsAudioTags: true,
    // Unverified against v3 specifically. The player degrades to proportional
    // truncation when alignment does not arrive, so a wrong guess here costs
    // precision on a barge-in, not correctness.
    supportsTimestamps: true,
  },
}

export const DEFAULT_TTS_MODEL: ElevenLabsTtsModelId = 'eleven_flash_v2_5'

export function isTtsModelId(value: unknown): value is ElevenLabsTtsModelId {
  return typeof value === 'string' && value in TTS_MODELS
}

export function ttsModelSpec(id: string): TtsModelSpec {
  return TTS_MODELS[isTtsModelId(id) ? id : DEFAULT_TTS_MODEL] as TtsModelSpec
}

/* ------------------------------------------------------------------ *
 * Audio format
 * ------------------------------------------------------------------ */

/**
 * Raw PCM, and only raw PCM.
 *
 * Not a taste decision. Barge-in has to truncate her stored turn to the words
 * that actually reached the ear, which means knowing playback position to the
 * sample. With MP3 that means decoding frames before we can schedule them, and
 * a frame boundary is not a character boundary. PCM goes straight into an
 * AudioBuffer and the playhead is exact.
 *
 * 24 kHz throughout: the mic capture, the audio graph and this all run at the
 * same rate, so nothing in the path resamples.
 */
export type PcmOutputFormat = 'pcm_16000' | 'pcm_22050' | 'pcm_24000'

export const PCM_RATES: Record<PcmOutputFormat, number> = {
  pcm_16000: 16_000,
  pcm_22050: 22_050,
  pcm_24000: 24_000,
}

export const DEFAULT_OUTPUT_FORMAT: PcmOutputFormat = 'pcm_24000'

export function isPcmOutputFormat(value: unknown): value is PcmOutputFormat {
  return typeof value === 'string' && value in PCM_RATES
}

/* ------------------------------------------------------------------ *
 * The resolved configuration
 * ------------------------------------------------------------------ */

export interface VoiceSettings {
  /** 0–1. Low lets the voice vary; high forces it flat. The dial that buys a
   *  character who will not warm up on her own. */
  stability: number
  /** 0–1. How closely the render sticks to the source voice. */
  similarity_boost: number
  /** 0.7–1.2. Relative speaking rate. */
  speed: number
}

export interface PipelineConfig {
  tts: {
    model: ElevenLabsTtsModelId
    outputFormat: PcmOutputFormat
    /** Fallback when a persona names no ElevenLabs voice. */
    voiceId: string | null
    settings: VoiceSettings
    /** Credits per character, overriding the model spec when set. */
    creditsPerChar: number | null
  }
  stt: { model: string }
  llm: { model: string; temperature: number; maxTokens: number }
  credits: {
    /** The plan's monthly allowance. Free tier is 10,000. */
    budget: number
    /** Console screams from here up. */
    warnAt: number
  }
}

export const DEFAULT_STT_MODEL = 'gpt-4o-mini-transcribe'
export const DEFAULT_LLM_MODEL = 'gpt-4.1-mini'

/** Free plan. Ten thousand credits a month and no overage. */
export const DEFAULT_CREDIT_BUDGET = 10_000
export const DEFAULT_CREDIT_WARN_AT = 8_000

/** Everything a caller may reasonably want to override, all optional. */
export interface PipelineEnv {
  ELEVENLABS_TTS_MODEL?: string | undefined
  ELEVENLABS_OUTPUT_FORMAT?: string | undefined
  ELEVENLABS_VOICE_ID?: string | undefined
  ELEVENLABS_STABILITY?: string | undefined
  ELEVENLABS_SIMILARITY?: string | undefined
  ELEVENLABS_SPEED?: string | undefined
  ELEVENLABS_CREDITS_PER_CHAR?: string | undefined
  ELEVENLABS_CREDIT_BUDGET?: string | undefined
  ELEVENLABS_CREDIT_WARN_AT?: string | undefined
  PIPELINE_STT_MODEL?: string | undefined
  PIPELINE_LLM_MODEL?: string | undefined
  PIPELINE_LLM_TEMPERATURE?: string | undefined
}

function num(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

/**
 * Voice settings the persona does not dictate.
 *
 * `stability` and `speed` come off the persona in the compiler, because they
 * are character. These are the ones tuned by ear against a rendered clip, so
 * they live in the environment where they can be changed without a deploy.
 */
export function resolvePipelineConfig(env: PipelineEnv = {}): PipelineConfig {
  const model = isTtsModelId(env.ELEVENLABS_TTS_MODEL)
    ? env.ELEVENLABS_TTS_MODEL
    : DEFAULT_TTS_MODEL

  const creditsPerChar = env.ELEVENLABS_CREDITS_PER_CHAR
    ? num(env.ELEVENLABS_CREDITS_PER_CHAR, TTS_MODELS[model].creditsPerChar)
    : null

  return {
    tts: {
      model,
      outputFormat: isPcmOutputFormat(env.ELEVENLABS_OUTPUT_FORMAT)
        ? env.ELEVENLABS_OUTPUT_FORMAT
        : DEFAULT_OUTPUT_FORMAT,
      voiceId: env.ELEVENLABS_VOICE_ID?.trim() || null,
      settings: {
        stability: clamp01(num(env.ELEVENLABS_STABILITY, Number.NaN)),
        similarity_boost: clamp01(num(env.ELEVENLABS_SIMILARITY, 0.75)),
        speed: num(env.ELEVENLABS_SPEED, Number.NaN),
      },
      creditsPerChar,
    },
    stt: { model: env.PIPELINE_STT_MODEL?.trim() || DEFAULT_STT_MODEL },
    llm: {
      model: env.PIPELINE_LLM_MODEL?.trim() || DEFAULT_LLM_MODEL,
      temperature: num(env.PIPELINE_LLM_TEMPERATURE, 0.9),
      // She answers in three words. This is a guard against a runaway
      // generation, not a length target — length is the warmth band's job.
      maxTokens: 120,
    },
    credits: {
      budget: num(env.ELEVENLABS_CREDIT_BUDGET, DEFAULT_CREDIT_BUDGET),
      warnAt: num(env.ELEVENLABS_CREDIT_WARN_AT, DEFAULT_CREDIT_WARN_AT),
    },
  }
}

/** NaN means "the persona decides"; the compiler fills it in. */
function clamp01(value: number): number {
  if (!Number.isFinite(value)) return Number.NaN
  return Math.min(1, Math.max(0, value))
}
