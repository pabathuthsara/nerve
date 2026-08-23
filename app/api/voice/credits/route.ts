/**
 * The voice vendor's own credit counter, read at the end of a rep so the
 * report's character count can be reconciled against the dashboard rather than
 * trusted.
 */

import { requireUser } from '@/lib/db/api-auth'
import { handleCreditsRequest } from '@/lib/voice/elevenlabs/server'

export const runtime = 'edge'

// Reads the vendor's account balance. Not a spend, but it is our commercial
// position and there is no reason for an anonymous caller to have it.
export async function GET(request: Request): Promise<Response> {
  const auth = await requireUser(request)
  if ('response' in auth) return auth.response

  return handleCreditsRequest()
}
