/**
 * Ephemeral token mint — OpenAI side.
 *
 * Lives here rather than in the route so that the provider's endpoint, request
 * shape and response shape stay inside the adapter directory. Swapping provider
 * changes the switch in ../mint.ts and nothing in app/.
 */

import { rateFor } from '../rates'
import { VoiceError, type Calibration, type Persona } from '../types'
import type { MintedSession } from './index'
import { OpenAIPersonaCompiler } from './persona'

const CLIENT_SECRETS_ENDPOINT = 'https://api.openai.com/v1/realtime/client_secrets'
const DEFAULT_MODEL = 'gpt-realtime-mini'

export async function mintOpenAISession(
  persona: Persona,
  calibration: Calibration,
  env: { apiKey: string | undefined; model: string | undefined },
): Promise<MintedSession> {
  if (!env.apiKey) {
    throw new VoiceError(
      'not_configured',
      'openai',
      'OPENAI_API_KEY is not set. Copy .env.example to .env.local and add your key.',
    )
  }

  const model = env.model ?? DEFAULT_MODEL
  const session = new OpenAIPersonaCompiler(model).compile(persona, calibration)

  let response: Response
  try {
    response = await fetch(CLIENT_SECRETS_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ session }),
    })
  } catch (cause) {
    throw new VoiceError('token_mint_failed', 'openai', 'Could not reach the provider.', { cause })
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new VoiceError(
      'token_mint_failed',
      'openai',
      `Provider refused the mint (${response.status}). ${detail.slice(0, 500)}`,
    )
  }

  const minted = (await response.json()) as { value?: string }
  if (!minted.value) {
    throw new VoiceError('token_mint_failed', 'openai', 'Provider returned no client secret.')
  }

  return { clientSecret: minted.value, model, rate: rateFor('openai', model), session }
}
