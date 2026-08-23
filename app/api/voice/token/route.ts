/**
 * Ephemeral token mint (§04).
 *
 * The browser holds the peer connection directly with the model; this route
 * exists so the standing API key never leaves the server. Runs on the edge,
 * because a slow mint is latency the user feels before the rep even starts.
 *
 * The persona is compiled from an id rather than accepted from the client. A
 * client that could post its own instructions could post its own character, and
 * the character contract is the product.
 *
 * Note what this file does not contain: any provider's endpoint, request shape
 * or vocabulary. It resolves a provider and calls `mintSession`.
 */

import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/db/api-auth'
import { mayOpenSession } from '@/lib/db/progress'
import { getPersona } from '@/lib/personas'
import { mintSession } from '@/lib/voice/mint'
import { resolveProviderId } from '@/lib/voice'
import { DEFAULT_CALIBRATION, VoiceError, clamp, type Calibration } from '@/lib/voice/types'

export const runtime = 'edge'

interface MintRequest {
  personaId?: unknown
  calibration?: unknown
  /** A/B and debugging hook. At M1 this comes off the authenticated profile. */
  userId?: unknown
  /** M0-only character-model arm. Restricted below. */
  model?: unknown
}

const M0_MODELS = ['gpt-realtime-mini', 'gpt-realtime-2.1-mini', 'gpt-realtime'] as const

function parseModel(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined
  return (M0_MODELS as readonly string[]).includes(input) ? input : undefined
}

function parseCalibration(input: unknown): Calibration {
  if (!input || typeof input !== 'object') return DEFAULT_CALIBRATION
  const raw = input as Record<string, unknown>
  const silenceMs =
    typeof raw['silenceMs'] === 'number' ? raw['silenceMs'] : DEFAULT_CALIBRATION.silenceMs
  const patience = typeof raw['patienceOffsetMs'] === 'number' ? raw['patienceOffsetMs'] : 0
  return {
    silenceMs: clamp(silenceMs, 200, 3000),
    patienceOffsetMs: clamp(patience, 0, 1500),
  }
}

export async function POST(request: Request): Promise<Response> {
  // The most expensive endpoint in the product. It hands back a credential that
  // buys an eight-minute Realtime session on our account, and it shipped open —
  // the only thing protecting it was that the path had not been guessed.
  const auth = await requireUser(request)
  if ('response' in auth) return auth.response

  // The daily quota, at the point where money is actually committed. The rep
  // itself spends the counter when the transport connects; this refuses to
  // hand out a credential to somebody who has none left to spend (§14).
  if (auth.userId !== 'internal') {
    const allowed = await mayOpenSession(auth.userId)
    if (!allowed.ok) {
      return NextResponse.json({ error: allowed.message ?? 'No reps left today.' }, { status: 429 })
    }
  }

  let body: MintRequest
  try {
    body = (await request.json()) as MintRequest
  } catch {
    return NextResponse.json({ error: 'Malformed request body.' }, { status: 400 })
  }

  const personaId = typeof body.personaId === 'string' ? body.personaId : ''
  const persona = getPersona(personaId)
  if (!persona) {
    return NextResponse.json({ error: `No persona named "${personaId}".` }, { status: 404 })
  }

  // Resolved here as well as in the page, from the same function, so the two
  // cannot disagree about which adapter a given user is on.
  const provider = resolveProviderId({
    envDefault: process.env.VOICE_PROVIDER,
    userId: typeof body.userId === 'string' ? body.userId : undefined,
  })

  try {
    const minted = await mintSession(provider, persona, parseCalibration(body.calibration), {
      apiKey: process.env.OPENAI_API_KEY,
      model: parseModel(body.model) ?? process.env.OPENAI_REALTIME_MODEL,
    })
    return NextResponse.json(minted)
  } catch (cause) {
    if (cause instanceof VoiceError) {
      // A missing key is our misconfiguration (500); a stubbed adapter is
      // unimplemented (501); anything else means the provider refused (502).
      const status =
        cause.code === 'not_configured' ? 500 : cause.code === 'not_implemented' ? 501 : 502
      return NextResponse.json({ error: cause.message }, { status })
    }
    return NextResponse.json({ error: String(cause) }, { status: 500 })
  }
}
