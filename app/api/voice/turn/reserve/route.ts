import { requireUser } from '@/lib/db/api-auth'
import { maySpend } from '@/lib/db/spend'
import { markPrereserved, releaseUnclaimedTurns } from '@/lib/db/voice-session'
import { getPersona } from '@/lib/personas'
import { turnReservation } from '@/lib/voice/elevenlabs/combined'
import { TICKET_TTL_MS, signTurnTicket, ticketsEnabled } from '@/lib/voice/elevenlabs/ticket'
import type { TurnRequest } from '@/lib/voice/elevenlabs/turn-protocol'

/**
 * Reserve her NEXT turn while this one is still playing
 * (PERSONA-REALISM-REPORT L2, `PERSONA-AUDIT.md` §14.7).
 *
 * `maySpend` still runs for every turn — rule 11 is untouched — it just runs
 * while nobody is waiting on it. What comes back is a signed ticket
 * (`lib/voice/elevenlabs/ticket.ts`) that lets the turn route skip the
 * 378-ms-median admission hop from the edge to the database, and a turn that
 * cannot present one simply takes the ordinary path.
 *
 * ── THE BOUND ─────────────────────────────────────────────────────────────
 *
 * A reservation has to be an UPPER bound on a turn nobody has spoken yet
 * (rule 18). The history the browser holds now is everything but three
 * things: his next line, the rest of her current one, and the steering line —
 * and the turn route refuses more than 2,000 characters for either line and
 * 4,000 for the steering. So the bound prices exactly that worst case, and the
 * turn route checks its own estimate against the ticket and falls back to the
 * ordinary path if it is ever exceeded.
 *
 * ── AND WHAT IT RELEASES ─────────────────────────────────────────────────
 *
 * Before reserving, any earlier ticket for this rep that was never used is
 * settled at zero (`releaseUnclaimedTurns`). A reservation holds budget, and a
 * rep that abandoned three tickets must not run out of it at two minutes.
 */
export const runtime = 'edge'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const WORST_LINE = 'x'.repeat(2000)
const WORST_STEERING = 'x'.repeat(4000)

export async function POST(request: Request): Promise<Response> {
  // No secret, no tickets: nothing is reserved, because a reservation nobody
  // can present would only collide with the ordinary path's own.
  if (!ticketsEnabled()) return new Response(null, { status: 204 })
  const auth = await requireUser(request)
  if ('response' in auth) return auth.response
  let body: Record<string, unknown>
  try { body = (await request.json()) as Record<string, unknown> } catch { return Response.json({ error: 'Malformed.' }, { status: 400 }) }
  const sessionId = typeof body.sessionId === 'string' && UUID.test(body.sessionId) ? body.sessionId : null
  const turnId = typeof body.turnId === 'string' && UUID.test(body.turnId) ? body.turnId : null
  const personaId = typeof body.personaId === 'string' && getPersona(body.personaId) ? body.personaId : null
  const history: TurnRequest['history'] = []
  if (Array.isArray(body.history)) {
    for (const raw of body.history.slice(-80)) {
      const entry = raw as Record<string, unknown>
      if ((entry?.role === 'user' || entry?.role === 'assistant') && typeof entry.content === 'string') {
        history.push({ role: entry.role, content: entry.content.slice(0, 2000) })
      }
    }
  }
  if (!sessionId || !turnId || !personaId) return Response.json({ error: 'Invalid reservation.' }, { status: 400 })

  await releaseUnclaimedTurns({ userId: auth.userId, sessionId })

  const estimate = turnReservation({
    sessionId, turnId, personaId, warmth: 0, steering: WORST_STEERING,
    history: [...history, { role: 'assistant', content: WORST_LINE }, { role: 'user', content: WORST_LINE }],
  })
  if (estimate.maxCostUsd === null) return Response.json({ error: 'This model has no verified rate.' }, { status: 503 })
  const allowed = await maySpend(auth.userId, 'turn', {
    sessionId, personaSlug: personaId, operationId: turnId, kind: 'turn',
    model: estimate.model, maxCostUsd: estimate.maxCostUsd, resources: estimate.resources,
  })
  if (!allowed.ok) return allowed.response
  await markPrereserved({ userId: auth.userId, sessionId, operationId: turnId })

  const expiresAt = Date.now() + TICKET_TTL_MS
  const ticket = await signTurnTicket({
    userId: auth.userId, sessionId, operationId: turnId, personaSlug: personaId,
    maxCostUsd: estimate.maxCostUsd, context: allowed.reservation.context, expiresAt,
  })
  if (!ticket) return new Response(null, { status: 204 })
  return Response.json({ turnId, ticket, expiresAt }, { headers: { 'cache-control': 'no-store' } })
}
