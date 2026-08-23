/**
 * Synthesis proxy.
 *
 * It exists because raw text-to-speech has no ephemeral-token story: the only
 * credential is a standing API key, which cannot go in a browser. Edge runtime,
 * because this hop is on the critical path of every reply and is the first
 * thing to move if `ttsFirstByteMs` comes back ugly.
 *
 * Deliberately empty, for the same reason as its sibling.
 */

import { requireUser } from '@/lib/db/api-auth'
import { handleTtsRequest } from '@/lib/voice/elevenlabs/server'

export const runtime = 'edge'

export async function POST(request: Request): Promise<Response> {
  const auth = await requireUser(request)
  if ('response' in auth) return auth.response

  return handleTtsRequest(request)
}
