/**
 * The countdown warm-up (`REP-FIXES-PLAN-2026-10-03.md` B2).
 *
 * Her first reply took 4–17 seconds on every rep against ~3.4 for every later
 * one (`REP-LATENCY-AUDIT-2026-10-03.md` §1), and the server half of that was
 * two cold caches, both measured: the model's prompt cache (`cachedInput` 0 on
 * every first turn, first token 1.0–3.0s against ~0.7s warm) and the voice
 * (first byte 0.15–2.5s against ~0.1s). Both are warmed here, during the
 * 3·2·1, by the route that will serve turn one.
 *
 * ── THE PREFIX MUST MATCH BYTE FOR BYTE ──────────────────────────────────
 *
 * A prompt cache only hits on an identical prefix, so the contract is compiled
 * by `handleLlmRequest` itself — the same function, the same persona overlay
 * from the same server-owned session context, the same mood seed (the session
 * id) and the same calibration a real turn sends. Only what FOLLOWS the
 * contract differs: one throwaway user line, and a one-token output cap. If
 * turn one still shows `cachedInput` 0 after this ships, the prefix has
 * drifted and that is the thing to find.
 *
 * ── IT IS NOT A TURN, AND IT IS NOT A VOICE OPERATION ────────────────────
 *
 * Nothing here reaches a transcript, the warmth engine, the incident counters,
 * the grader or the client's timeline. And it is deliberately NOT reserved as
 * a `voice_operations` row: `voice_session_refund_empty` and
 * `voice_session_close` both refuse a refund once any non-`stt` operation
 * exists on the session, so a warm-up booked there would make every rep that
 * dies in setup, or that never hears him, non-refundable — the user paying for
 * our cold start. It is bounded instead by the turn bucket's `maySpend`
 * (kill switches, daily cap, rate) and written to the ledger from the
 * provider's own usage, or from its bound when usage never arrived (rule 18).
 */
import { getPersona } from '@/lib/personas'
import { withInterviewBrief } from '@/lib/personas/interview/overlay'
import { DEFAULT_CALIBRATION } from '../types'
import { priceChatUsage } from '../rates'
import { resolvePipelineConfig, ttsModelSpec, type PipelineEnv } from './config'
import { ElevenLabsPersonaCompiler, deliveryFor } from './persona'
import { LlmClient } from './llm'
import { handleLlmRequest, handleTtsRequest } from './server'
import type { TurnContext } from './combined'
import type { WarmRequest } from './turn-protocol'
import { seededRandom } from '../seed'

/** The line the model reads after the contract. Never spoken, never stored. */
export const WARM_USER_LINE = 'Hi.'
/** What the voice is asked to say. Three characters; the audio is discarded. */
export const WARM_TTS_TEXT = 'Mm.'
/** One token: the cache is written by reading the prompt, not by answering. */
export const WARM_MAX_TOKENS = 1
/** Never let a warm-up outlive the countdown by much. */
const WARM_TIMEOUT_MS = 12_000

export interface WarmAccounting {
  /** Priced from the providers' own receipts, or the bound when one is missing. */
  costUsd: number
  measured: boolean
  usage: {
    llm: { input: number; output: number; cachedInput: number } | null
    tts: { characters: number }
  }
  metadata: Record<string, string | number | boolean | null>
}

export interface WarmDependencies {
  llm?: typeof handleLlmRequest
  tts?: typeof handleTtsRequest
  now?: () => number
}

function compile(input: WarmRequest, context: TurnContext) {
  const persona = withInterviewBrief({ ...getPersona(input.personaId)!, ...context }, context)
  const compiled = new ElevenLabsPersonaCompiler(resolvePipelineConfig(process.env as PipelineEnv))
    .compile(persona, context.calibration ?? DEFAULT_CALIBRATION, { rng: seededRandom(input.sessionId) })
  return { persona, compiled }
}

/**
 * The most a warm-up can cost, from what the server compiles. UTF-8 bytes
 * over-count BPE tokens, and 512 covers the exit line and message framing.
 */
export function warmBound(input: WarmRequest, context: TurnContext): { model: string; maxCostUsd: number | null } {
  const { compiled } = compile(input, context)
  const inputTokens = new TextEncoder().encode(compiled.llm.systemPrompt + WARM_USER_LINE).length + 512
  const llm = priceChatUsage(compiled.llm.model, { input: inputTokens, output: WARM_MAX_TOKENS, cachedInput: 0 })
  return {
    model: compiled.llm.model,
    maxCostUsd: llm === null ? null
      : llm + WARM_TTS_TEXT.length / 1000 * ttsModelSpec(compiled.tts.model).usdPer1kChars,
  }
}

/**
 * Warm the model and the voice in parallel. Never throws: a warm-up that fails
 * has cost what it cost and changed nothing else, and the rep must not hear
 * about it.
 */
export async function warmSession(
  input: WarmRequest,
  context: TurnContext,
  signal: AbortSignal,
  dependencies: WarmDependencies = {},
): Promise<WarmAccounting> {
  const now = dependencies.now ?? performance.now.bind(performance)
  const started = now()
  const { persona, compiled } = compile(input, context)
  const bound = warmBound(input, context)
  const abort = new AbortController()
  const forward = () => abort.abort(signal.reason)
  signal.addEventListener('abort', forward, { once: true })
  if (signal.aborted) forward()
  const deadline = setTimeout(() => abort.abort(new Error('Warm-up deadline.')), WARM_TIMEOUT_MS)

  let llmUsage: WarmAccounting['usage']['llm'] = null
  let llmFirstTokenMs: number | null = null
  let ttsFirstByteMs: number | null = null
  let ttsCharacters = 0
  let ttsRegion: string | null = null

  const model = (async () => {
    const client = new LlmClient({
      fetchImpl: async (_url, options) => (dependencies.llm ?? handleLlmRequest)(
        new Request('http://nerve.internal/llm', {
          ...options,
          // EXACTLY the fields a real turn hands the same function, in
          // `combined.ts` — the persona, the server-owned calibration, and the
          // overlay with the session id as the mood seed. History and steering
          // follow the contract, so they cannot move the cached prefix.
          body: JSON.stringify({
            personaId: input.personaId,
            history: [{ role: 'user', content: WARM_USER_LINE }],
            steering: null,
            calibration: context.calibration,
          }),
          signal: abort.signal,
        }),
        { ...context, moodSeed: input.sessionId },
        { maxTokens: WARM_MAX_TOKENS },
      ),
    })
    await client.stream({ personaId: input.personaId, history: [], steering: null }, {
      onFirstToken: () => { llmFirstTokenMs = Math.round(now() - started) },
      onUsage: (usage) => { llmUsage = { input: usage.input, output: usage.output, cachedInput: usage.cachedInput ?? 0 } },
    }, abort.signal)
  })()

  const voice = (async () => {
    const text = WARM_TTS_TEXT
    const response = await (dependencies.tts ?? handleTtsRequest)(new Request('http://nerve.internal/tts', {
      method: 'POST',
      // The same model, format, path (with timestamps) and voice a turn uses,
      // so the vendor's side is warm for the exact request that follows.
      body: JSON.stringify({
        personaId: input.personaId, text, model: compiled.tts.model,
        outputFormat: compiled.tts.outputFormat, timestamps: true,
        settings: deliveryFor(persona, compiled, 0).settings,
      }),
      signal: abort.signal,
    }))
    // Characters are billed once a request is accepted, whatever happens to
    // the audio afterwards, so they are counted as soon as it is.
    if (!response.ok || !response.body) return
    ttsCharacters = text.length
    ttsRegion = response.headers.get('x-nerve-tts-region')
    const reader = response.body.getReader()
    try {
      for (;;) {
        const chunk = await reader.read()
        if (chunk.done) break
        if (ttsFirstByteMs === null) ttsFirstByteMs = Math.round(now() - started)
      }
    } finally {
      reader.releaseLock()
    }
  })()

  const [modelResult, voiceResult] = await Promise.allSettled([model, voice])
  clearTimeout(deadline)
  signal.removeEventListener('abort', forward)

  const ttsCost = ttsCharacters / 1000 * ttsModelSpec(compiled.tts.model).usdPer1kChars
  const llmCost = llmUsage ? priceChatUsage(compiled.llm.model, llmUsage) : null
  // Rule 18: a missing receipt is the bound, never zero and never unknown.
  const measured = llmCost !== null
  const costUsd = measured ? llmCost + ttsCost : bound.maxCostUsd ?? 0
  return {
    costUsd,
    measured,
    usage: { llm: llmUsage, tts: { characters: ttsCharacters } },
    metadata: {
      durationMs: Math.round(now() - started),
      llmFirstTokenMs, ttsFirstByteMs, ttsRegion,
      llmOk: modelResult.status === 'fulfilled',
      ttsOk: voiceResult.status === 'fulfilled' && ttsCharacters > 0,
      llmModel: compiled.llm.model, ttsModel: compiled.tts.model,
      functionRegion: process.env.VERCEL_REGION ?? 'local',
    },
  }
}
