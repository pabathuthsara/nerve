/**
 * The factory (§04).
 *
 * Reads VOICE_PROVIDER, with a per-user override. The override is here at M0
 * rather than retrofitted because it is what makes both the blind A/B before M3
 * and any later canary rollout possible.
 *
 * Import this. Never import an adapter directly outside of tests.
 */

import { OpenAIVoiceProvider, type OpenAIAdapterOptions } from './openai'
import { ElevenLabsVoiceProvider } from './elevenlabs'
import type { VoiceProvider } from './provider'
import type { ProviderId } from './types'

export * from './types'
export type { VoiceProvider, PersonaCompiler } from './provider'

const PROVIDERS: readonly ProviderId[] = ['openai', 'elevenlabs']

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && (PROVIDERS as readonly string[]).includes(value)
}

export interface ProviderResolution {
  /** From the VOICE_PROVIDER environment variable. */
  envDefault?: string | undefined
  /** A specific user pinned to a provider — support, debugging, or an A/B arm. */
  userOverride?: string | undefined
  /**
   * Stable user identifier. When `abSplit` is set, this buckets the user, so a
   * given user always lands in the same arm across sessions.
   */
  userId?: string | undefined
  /** Fraction of users routed to ElevenLabs, 0–1. Ignored without a userId. */
  abSplit?: number | undefined
}

/**
 * Pure, and deliberately so — it runs on the edge when minting a token and in
 * the RSC that renders the rep, and both must agree on the answer.
 *
 * Precedence: explicit user override > A/B bucket > env default > openai.
 */
export function resolveProviderId(resolution: ProviderResolution = {}): ProviderId {
  const { envDefault, userOverride, userId, abSplit } = resolution

  if (isProviderId(userOverride)) return userOverride

  if (userId && typeof abSplit === 'number' && abSplit > 0) {
    if (bucket(userId) < Math.min(abSplit, 1)) return 'elevenlabs'
  }

  if (isProviderId(envDefault)) return envDefault
  return 'openai'
}

/** FNV-1a over the user id, mapped to [0, 1). Stable across processes. */
function bucket(userId: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < userId.length; i += 1) {
    hash ^= userId.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash / 0x100000000
}

export interface CreateVoiceProviderOptions extends ProviderResolution {
  openai?: OpenAIAdapterOptions
}

export function createVoiceProvider(
  options: CreateVoiceProviderOptions = {},
): VoiceProvider {
  const id = resolveProviderId(options)
  switch (id) {
    case 'elevenlabs':
      return new ElevenLabsVoiceProvider()
    case 'openai':
      return new OpenAIVoiceProvider(options.openai)
  }
}
