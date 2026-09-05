/**
 * Provider-neutral session minting.
 *
 * The token route is application layer and must not know which provider it is
 * minting for, any more than the rep page does. It hands a persona id and a
 * calibration here; the right adapter's mint runs behind this function.
 */

import { mintOpenAISession } from './openai/mint'
import { mintElevenLabsSession, type MintedPipelineSession } from './elevenlabs/mint'
import { type Calibration, type Persona, type ProviderId } from './types'
import type { MintedSession } from './openai'
import { resolvePipelineConfig, type PipelineEnv } from './elevenlabs/config'

export type { MintedSession, MintedPipelineSession }

/** What the token route actually returns. The adapter on the other end knows
 *  which arm it is, so it knows which member it is looking at. */
export type MintedVoiceSession = MintedSession | MintedPipelineSession

/** Model stamped on an owned pipeline rep before handing out its credential. */
export function pipelineSessionModel(): string {
  return resolvePipelineConfig(process.env as PipelineEnv).tts.model
}

/** A conservative duration estimate for the directly connected transcriber.
 * It is an admission allowance, not a provider usage receipt. */
export function pipelineTranscriptionAllowance(): { model: string; maxCostUsd: number; audioMs: number } | null {
  const { model } = resolvePipelineConfig(process.env as PipelineEnv).stt
  const perMinute = model === 'gpt-4o-mini-transcribe' ? 0.003
    : model === 'gpt-4o-transcribe' ? 0.006 : null
  return perMinute === null ? null : { model, maxCostUsd: perMinute * 4, audioMs: 240_000 }
}

export interface MintEnvironment {
  apiKey: string | undefined
  model: string | undefined
  /**
   * Optional. The ElevenLabs mint falls back to `process.env` when this is
   * absent, so the provider-neutral route does not have to learn a second
   * vendor's variable name to stay neutral.
   */
  elevenLabsApiKey?: string | undefined
}

export async function mintSession(
  provider: ProviderId,
  persona: Persona,
  calibration: Calibration,
  env: MintEnvironment,
): Promise<MintedVoiceSession> {
  switch (provider) {
    case 'openai':
      return mintOpenAISession(persona, calibration, env)
    case 'elevenlabs':
      return mintElevenLabsSession(persona, calibration, {
        elevenLabsApiKey: env.elevenLabsApiKey,
        openAiApiKey: env.apiKey,
      })
  }
}
