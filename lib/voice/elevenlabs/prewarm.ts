/**
 * Warm the first turn while the 3·2·1 is still counting
 * (PERSONA-REALISM-REPORT L1).
 *
 * ── THE FIRST TURN IS A DIFFERENT, WORSE ANIMAL ──────────────────────────
 *
 * Measured on production: server request to first audio was 3,294 ms on her
 * FIRST reply against 1,728 ms afterwards, and in the transcripts her first
 * line landed a mean 7.6 s after his on Cass — the free sign-up rep, so the
 * first thing this product ever does, and the slowest. Every part of it was
 * cold: the character model's first token took 1,794 ms against 671 ms later
 * (a cold prompt cache and a new connection), and synthesis 558 ms against 173.
 *
 * The countdown already opens the session under the count (`PIPELINE.md`), so
 * the rep is owned before he can speak. This spends those two seconds on the
 * two things that were cold:
 *
 *   · the character model is sent the EXACT prefix the first turn will send —
 *     the same compiled contract, the same seed, the same exit-rule message —
 *     with a one-token ceiling, so OpenAI's prompt cache holds it. The prefix
 *     is built by `handleLlmRequest` itself rather than copied, because a cache
 *     keyed on bytes is a cache a copy will quietly miss;
 *   · her voice is asked for three characters ("Mm."), at her own settings, so
 *     the synthesis path to this voice is warm.
 *
 * About a tenth of a cent, reserved and settled like every other operation
 * (rule 11, rule 18). Best-effort from end to end: a prewarm that fails costs
 * the first turn nothing it was not already paying.
 */

import { LlmClient } from './llm'
import { handleLlmRequest, handleTtsRequest, type PersonaOverlay } from './server'
import { ElevenLabsPersonaCompiler, deliveryFor } from './persona'
import { resolvePipelineConfig, ttsModelSpec, type PipelineEnv } from './config'
import { priceChatUsage } from '../rates'
import { DEFAULT_CALIBRATION } from '../types'
import { getPersona } from '@/lib/personas'
import { seededRandom } from '../seed'

/** What the prewarm asks her to say. A particle, so it is also on-voice. */
export const PREWARM_TEXT = 'Mm.'

/**
 * A stand-in first line from him. The cache prefix ends before it, so what it
 * says does not matter; a chat completion needs something that is not a
 * system message to answer.
 */
const PREWARM_USER = 'Hi.'

export interface PrewarmReservation {
  model: string
  maxCostUsd: number
  resources: { llmInputTokens: number; llmOutputTokens: number; ttsCharacters: number }
}

/** The bound, priced exactly as a turn is: bytes over-count tokens. */
export function prewarmReservation(personaId: string, sessionId: string): PrewarmReservation | null {
  const persona = getPersona(personaId)
  if (!persona) return null
  const compiled = new ElevenLabsPersonaCompiler(resolvePipelineConfig(process.env as PipelineEnv))
    .compile(persona, DEFAULT_CALIBRATION, { rng: seededRandom(sessionId) })
  const inputTokens = new TextEncoder().encode(compiled.llm.systemPrompt).length + 4096
  const llm = priceChatUsage(compiled.llm.model, { input: inputTokens, output: 1, cachedInput: 0 })
  if (llm === null) return null
  return {
    model: compiled.llm.model,
    maxCostUsd: llm + PREWARM_TEXT.length / 1000 * ttsModelSpec(compiled.tts.model).usdPer1kChars,
    resources: { llmInputTokens: inputTokens, llmOutputTokens: 1, ttsCharacters: PREWARM_TEXT.length },
  }
}

export interface PrewarmResult {
  costUsd: number | null
  llm: { input: number; output: number; cachedInput: number } | null
  ttsCharacters: number
  metadata: Record<string, number | string | boolean | null>
}

export interface PrewarmDependencies {
  llm?: typeof handleLlmRequest
  tts?: typeof handleTtsRequest
  now?: () => number
}

export async function prewarmPipeline(
  input: { personaId: string; sessionId: string },
  overlay: PersonaOverlay,
  signal: AbortSignal,
  dependencies: PrewarmDependencies = {},
): Promise<PrewarmResult> {
  const now = dependencies.now ?? (() => performance.now())
  const started = now()
  const persona = getPersona(input.personaId)
  const config = resolvePipelineConfig(process.env as PipelineEnv)
  const compiled = persona
    ? new ElevenLabsPersonaCompiler(config).compile(persona, DEFAULT_CALIBRATION, { rng: seededRandom(input.sessionId) })
    : null

  let llmUsage: PrewarmResult['llm'] = null
  let llmMs: number | null = null
  let ttsMs: number | null = null
  let ttsCharacters = 0

  const warmLlm = (async () => {
    const client = new LlmClient({
      fetchImpl: async (_url, options) => (dependencies.llm ?? handleLlmRequest)(new Request('http://nerve.internal/llm', {
        ...options,
        body: JSON.stringify({ personaId: input.personaId, history: [{ role: 'user', content: PREWARM_USER }], steering: null }),
        signal,
      }), { ...overlay, moodSeed: input.sessionId }, { maxTokens: 1 }),
    })
    try {
      await client.stream({ personaId: input.personaId, history: [], steering: null }, {
        onFirstToken: () => { llmMs = Math.round(now() - started) },
        onUsage: (usage) => { llmUsage = { input: usage.input, output: usage.output, cachedInput: usage.cachedInput ?? 0 } },
      }, signal)
    } catch { /* A cold first turn is what we had. */ }
  })()

  const warmTts = (async () => {
    if (!persona || !compiled) return
    try {
      const response = await (dependencies.tts ?? handleTtsRequest)(new Request('http://nerve.internal/tts', {
        method: 'POST',
        signal,
        body: JSON.stringify({
          personaId: input.personaId, text: PREWARM_TEXT, model: compiled.tts.model,
          outputFormat: compiled.tts.outputFormat, timestamps: true,
          settings: deliveryFor(persona, compiled, persona.trajectory.start).settings,
        }),
      }))
      if (response.ok && response.body) {
        ttsCharacters = PREWARM_TEXT.length
        const reader = response.body.getReader()
        for (;;) { const chunk = await reader.read(); if (chunk.done) break }
        ttsMs = Math.round(now() - started)
      }
    } catch { /* Nothing lost but the warm-up. */ }
  })()

  await Promise.all([warmLlm, warmTts])
  const usage = llmUsage as PrewarmResult['llm']
  const llmCost = usage && compiled ? priceChatUsage(compiled.llm.model, usage) : null
  const ttsCost = compiled ? ttsCharacters / 1000 * ttsModelSpec(compiled.tts.model).usdPer1kChars : 0
  return {
    // Unknown LLM usage is settled at the reservation's bound (rule 18).
    costUsd: llmCost === null ? null : llmCost + ttsCost,
    llm: usage,
    ttsCharacters,
    metadata: {
      source: 'prewarm', llmMs, ttsMs, durationMs: Math.round(now() - started),
      cachedInput: usage?.cachedInput ?? null,
      functionRegion: process.env.VERCEL_REGION ?? 'local',
    },
  }
}
