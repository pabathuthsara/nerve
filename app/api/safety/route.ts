/**
 * Moderation on both streams (§16.3), for the live rep.
 *
 * Called once per committed turn, from either side of the conversation, and
 * answered with one of five actions. The client does what it is told; it does
 * not decide. That split is deliberate — the strike count lives on the server
 * (`lib/safety/assess.ts`) because the browser is not the authority on how
 * many times it has crossed a line.
 *
 * Fire-and-forget from the caller's point of view. Nothing in a rep waits on
 * this response: a turn is classified while she is already answering, and the
 * action arrives when it arrives. A safety layer that added latency to every
 * reply would be a safety layer somebody eventually turns off.
 *
 * Text mode calls `assessTurn` directly from its Server Action instead of
 * coming through here, because it is already on the server and has the
 * message in hand — same function, one hop fewer.
 */

import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/db/api-auth'
import { maySpend } from '@/lib/db/spend'
import { assessTurn } from '@/lib/safety/assess'

export const runtime = 'edge'

interface Body {
  sessionId?: unknown
  speaker?: unknown
  text?: unknown
}

/** A uuid, or null. The session row may not have landed yet — see the hook. */
function sessionId(value: unknown): string | null {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null
}

export async function POST(request: Request): Promise<Response> {
  const auth = await requireUser(request)
  if ('response' in auth) return auth.response

  // The vendor call behind this is free today. The gate is here anyway: an
  // open route holding our key is a standing invoice at whatever the rate
  // turns out to be tomorrow (§14, and the note in `lib/db/spend.ts`).
  const allowed = await maySpend(auth.userId, 'safety')
  if (!allowed.ok) return allowed.response

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: 'malformed' }, { status: 400 })
  }

  const text = typeof body.text === 'string' ? body.text : ''
  if (!text.trim()) return NextResponse.json({ verdict: 'ok', action: 'none' })

  const speaker = body.speaker === 'agent' ? 'agent' : 'user'
  const id = sessionId(body.sessionId)

  const assessment = await assessTurn({
    userId: auth.userId,
    sessionId: id,
    // A rep whose row has not landed yet still needs somewhere to count
    // strikes. The user's own id is the fallback scope: it over-counts across
    // two simultaneous reps by the same person, which is not a thing one
    // microphone can do.
    scope: id ?? `rep:${auth.userId}`,
    speaker,
    text,
  })

  return NextResponse.json(assessment)
}
