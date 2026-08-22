/**
 * The character model, for adapters that are a pipeline rather than one model.
 *
 * Deliberately empty. Every line of provider vocabulary — endpoint, request
 * shape, streaming format — lives in `lib/voice/`, so §04's rule holds: nothing
 * in the application layer imports a provider SDK or names a provider API.
 * Repointing at another vendor never touches this file.
 */

import { handleLlmRequest } from '@/lib/voice/elevenlabs/server'

export const runtime = 'edge'

export function POST(request: Request): Promise<Response> {
  return handleLlmRequest(request)
}
