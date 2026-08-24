/**
 * The character model, for adapters that are a pipeline rather than one model.
 *
 * Deliberately empty. Every line of provider vocabulary — endpoint, request
 * shape, streaming format — lives in `lib/voice/`, so §04's rule holds: nothing
 * in the application layer imports a provider SDK or names a provider API.
 * Repointing at another vendor never touches this file.
 */

import { requireUser } from '@/lib/db/api-auth'
import { maySpend } from '@/lib/db/spend'
import { handleLlmRequest } from '@/lib/voice/elevenlabs/server'

export const runtime = 'edge'

// The guard is not provider vocabulary, so it does not break the rule above:
// this proxies a standing vendor key and must know who is asking.
export async function POST(request: Request): Promise<Response> {
  const auth = await requireUser(request)
  if ('response' in auth) return auth.response

  // Proxies a standing vendor key, so the ceiling matters more here than the
  // session check does: a valid session with a loop behind it still spends.
  const allowed = await maySpend(auth.userId, 'llm')
  if (!allowed.ok) return allowed.response

  return handleLlmRequest(request)
}
