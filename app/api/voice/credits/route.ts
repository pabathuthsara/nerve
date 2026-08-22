/**
 * The voice vendor's own credit counter, read at the end of a rep so the
 * report's character count can be reconciled against the dashboard rather than
 * trusted.
 */

import { handleCreditsRequest } from '@/lib/voice/elevenlabs/server'

export const runtime = 'edge'

export function GET(): Promise<Response> {
  return handleCreditsRequest()
}
