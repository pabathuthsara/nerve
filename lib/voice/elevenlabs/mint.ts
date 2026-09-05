/**
 * Session minting — ElevenLabs pipeline side.
 *
 * Three things have to be true before a rep can start, and all three are
 * cheaper to find out here than halfway through a session:
 *
 *  1. There is an ElevenLabs key.
 *  2. There are credits left on it. The free plan has no overage — synthesis
 *     stops, mid-sentence, and the rep is wasted.
 *  3. OpenAI will issue an ephemeral secret for a transcription session, so the
 *     browser can stream microphone audio without ever holding a standing key.
 *
 * The compiled character contract deliberately does *not* travel to the
 * browser. The LLM proxy recompiles it from the persona id on every turn, for
 * the same reason the token route compiles rather than accepts one: a client
 * that can post its own instructions can post its own character.
 */

import { rateFor } from '../rates'
import { VoiceError, type Calibration, type Persona, type Rate } from '../types'
import {
  ElevenLabsPersonaCompiler,
  isUncastVoice,
  type ElevenLabsPipelineConfig,
} from './persona'
import { resolvePipelineConfig, type PipelineEnv } from './config'

const CLIENT_SECRETS_ENDPOINT = 'https://api.openai.com/v1/realtime/client_secrets'
const SUBSCRIPTION_ENDPOINT = 'https://api.elevenlabs.io/v1/user/subscription'
const SUBSCRIPTION_TIMEOUT_MS = 750
const SUBSCRIPTION_CACHE_MS = 15_000
const TRANSCRIPTION_MINT_TIMEOUT_MS = 10_000

type CreditSnapshot = { used: number | null; limit: number | null }
const subscriptionCache = new Map<string, { expiresAt: number; value: CreditSnapshot }>()
const subscriptionPending = new Map<string, Promise<CreditSnapshot>>()

/** The stamped model on this arm is the voice model — the thing being A/B'd. */
export const PIPELINE_MODEL_ID = 'elevenlabs-pipeline'

/** Everything the adapter needs, minus the character contract. */
export interface PipelineClientConfig
  extends Omit<ElevenLabsPipelineConfig, 'llm'> {
  llm: { model: string; temperature: number; maxTokens: number }
}

export interface MintedPipelineSession {
  provider: 'elevenlabs'
  /** Ephemeral OpenAI secret, transcription session only. Short-lived. */
  clientSecret: string
  model: string
  rate: Rate
  pipeline: PipelineClientConfig
  /** Present after the server has atomically opened an owned voice rep. */
  sessionId?: string
  startupAttemptId?: string
  /** Capability advertisement permits old clients/mints during a deployment. */
  turn?: { endpoint: string }
  credits: {
    budget: number
    warnAt: number
    /** From the vendor's own counter. Null when the call failed. */
    used: number | null
    limit: number | null
  }
}

export interface ElevenLabsMintEnv {
  /** Falls back to process.env so the provider-neutral token route does not
   *  have to learn a second vendor's variable name. */
  elevenLabsApiKey?: string | undefined
  openAiApiKey?: string | undefined
  pipeline?: PipelineEnv | undefined
}

export async function mintElevenLabsSession(
  persona: Persona,
  calibration: Calibration,
  env: ElevenLabsMintEnv,
): Promise<MintedPipelineSession> {
  const elevenKey = env.elevenLabsApiKey ?? process.env['ELEVENLABS_API_KEY']
  const openAiKey = env.openAiApiKey ?? process.env['OPENAI_API_KEY']

  if (!elevenKey) {
    throw new VoiceError(
      'not_configured',
      'elevenlabs',
      'ELEVENLABS_API_KEY is not set. Copy .env.example to .env.local and add your key.',
    )
  }
  if (!openAiKey) {
    throw new VoiceError(
      'not_configured',
      'elevenlabs',
      'OPENAI_API_KEY is not set. The pipeline needs it for transcription and the character model.',
    )
  }

  const pipelineEnv = env.pipeline ?? (process.env as unknown as PipelineEnv)
  const config = resolvePipelineConfig(pipelineEnv)
  const compiled = new ElevenLabsPersonaCompiler(config).compile(persona, calibration)

  // Fail here rather than on her first word. A rep that connects, listens,
  // thinks and then 404s on synthesis is the most expensive way to discover
  // that nobody has cast the part.
  if (isUncastVoice(compiled.tts.voice_id)) {
    throw new VoiceError(
      'not_configured',
      'elevenlabs',
      `${persona.name} has no ElevenLabs voice yet. Pick one with "npm run voice:voices", `
      + 'hear it on her real lines with "npm run voice:audition -- <voice_id>", then set '
      + 'ELEVENLABS_VOICE_ID in .env.local or persona.voice.ids.elevenlabs. '
      + '(Voice Design needs a paid plan; the premade library does not.)',
    )
  }

  const [clientSecret, credits] = await Promise.all([
    mintTranscriptionSecret(openAiKey, compiled.stt),
    readSubscription(elevenKey),
  ])

  // Loud here as well as in the browser: a rep that cannot finish should not
  // start, and the server log is where a failed CI run gets read.
  if (credits.used !== null && credits.used >= config.credits.warnAt) {
    console.warn(
      `[voice] ElevenLabs credits at ${credits.used}/${credits.limit ?? config.credits.budget}. `
      + 'Sessions will stop mid-sentence when this runs out.',
    )
  }

  const { llm, ...rest } = compiled
  return {
    provider: 'elevenlabs',
    clientSecret,
    model: PIPELINE_MODEL_ID,
    rate: rateFor('elevenlabs', PIPELINE_MODEL_ID),
    pipeline: {
      ...rest,
      // The contract stays on the server.
      llm: { model: llm.model, temperature: llm.temperature, maxTokens: llm.maxTokens },
    },
    credits: {
      budget: config.credits.budget,
      warnAt: config.credits.warnAt,
      used: credits.used,
      limit: credits.limit,
    },
  }
}

async function mintTranscriptionSecret(
  apiKey: string,
  stt: ElevenLabsPipelineConfig['stt'],
): Promise<string> {
  try {
    return await boundedRequest(async (signal) => {
      const response = await fetch(CLIENT_SECRETS_ENDPOINT, {
        method: 'POST',
        cache: 'no-store',
        signal,
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session: {
            type: 'transcription',
            audio: {
              input: {
                format: { type: 'audio/pcm', rate: stt.sampleRate },
                transcription: { model: stt.model },
                // Turn-taking is ours. See ./vad.ts.
                turn_detection: null,
              },
            },
          },
        }),
      })
      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        throw new VoiceError(
          'token_mint_failed',
          'elevenlabs',
          `Transcription mint refused (${response.status}). ${detail.slice(0, 500)}`,
        )
      }
      const minted = (await response.json()) as { value?: string; client_secret?: { value?: string } }
      const secret = minted.value ?? minted.client_secret?.value
      if (!secret) {
        throw new VoiceError('token_mint_failed', 'elevenlabs', 'Transcription mint returned no secret.')
      }
      return secret
    }, TRANSCRIPTION_MINT_TIMEOUT_MS)
  } catch (cause) {
    if (cause instanceof VoiceError) throw cause
    throw new VoiceError('token_mint_failed', 'elevenlabs', 'Could not reach the transcription mint.', {
      cause,
    })
  }
}

/**
 * The vendor's own credit counter.
 *
 * Best-effort: a rep should not be blocked because a status endpoint was slow.
 * Our local character count carries the session either way; this is what makes
 * the number in the report reconcilable with the dashboard.
 */
export async function readSubscription(
  apiKey: string,
): Promise<CreditSnapshot> {
  const cached = subscriptionCache.get(apiKey)
  if (cached && cached.expiresAt > Date.now()) return cached.value
  const pending = subscriptionPending.get(apiKey)
  if (pending) return pending

  const request = fetchSubscription(apiKey).then((value) => {
    // A transient failure is not a fresh zero balance. Preserve a successful
    // recent reading, and avoid hammering a slow status endpoint on reconnect.
    const snapshot = value.used === null ? cached?.value ?? value : value
    if (subscriptionCache.size >= 8) {
      const oldest = subscriptionCache.keys().next().value
      if (oldest !== undefined) subscriptionCache.delete(oldest)
    }
    subscriptionCache.set(apiKey, { expiresAt: Date.now() + SUBSCRIPTION_CACHE_MS, value: snapshot })
    return snapshot
  }).finally(() => subscriptionPending.delete(apiKey))
  subscriptionPending.set(apiKey, request)
  return request
}

async function fetchSubscription(apiKey: string): Promise<CreditSnapshot> {
  try {
    return await boundedRequest(async (signal) => {
      const response = await fetch(SUBSCRIPTION_ENDPOINT, {
        headers: { 'xi-api-key': apiKey },
        cache: 'no-store',
        signal,
      })
      if (!response.ok) return { used: null, limit: null }
      const body = (await response.json()) as Record<string, unknown>
      return {
        used: numberOf(body['character_count']),
        limit: numberOf(body['character_limit']),
      }
    }, SUBSCRIPTION_TIMEOUT_MS)
  } catch {
    return { used: null, limit: null }
  }
}

/** Bound both the network wait and cancellation. A status endpoint is advisory;
 *  it must never keep the start screen waiting indefinitely. */
async function boundedRequest<T>(request: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const abort = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      abort.abort()
      reject(new Error('Voice provider request timed out.'))
    }, timeoutMs)
  })
  try {
    return await Promise.race([request(abort.signal), timeout])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

function numberOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
