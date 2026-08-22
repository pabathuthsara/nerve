/**
 * Provider-neutral session minting.
 *
 * The token route is application layer and must not know which provider it is
 * minting for, any more than the rep page does. It hands a persona id and a
 * calibration here; the right adapter's mint runs behind this function.
 */

import { mintOpenAISession } from './openai/mint'
import { VoiceError, type Calibration, type Persona, type ProviderId } from './types'
import type { MintedSession } from './openai'

export type { MintedSession }

export interface MintEnvironment {
  apiKey: string | undefined
  model: string | undefined
}

export async function mintSession(
  provider: ProviderId,
  persona: Persona,
  calibration: Calibration,
  env: MintEnvironment,
): Promise<MintedSession> {
  switch (provider) {
    case 'openai':
      return mintOpenAISession(persona, calibration, env)
    case 'elevenlabs':
      throw new VoiceError(
        'not_implemented',
        'elevenlabs',
        'The ElevenLabs adapter is a stub at M0. Set VOICE_PROVIDER=openai.',
      )
  }
}
