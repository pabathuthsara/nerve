import { after } from 'next/server'
import { requireUser } from '@/lib/db/api-auth'
import { maySpend } from '@/lib/db/spend'
import { findActiveVoiceSession, recordStandaloneUsage, settleVoiceOperation } from '@/lib/db/voice-session'
import { asJson } from '@/lib/db/json'
import { createCombinedTurn, parseVoiceRequest, turnReservation } from '@/lib/voice/elevenlabs/combined'
import { warmBound, warmSession } from '@/lib/voice/elevenlabs/warm'
import type { WarmRequest } from '@/lib/voice/elevenlabs/turn-protocol'

export const runtime = 'edge'

export async function POST(request: Request): Promise<Response> {
  const started = performance.now()
  // CONCURRENTLY, because they read different halves of the request and the
  // slow one is a network hop.
  //
  // `requireUser` reads cookies and, on a cache miss, contacts the auth server
  // in us-east-1 from a function in sin1 — measured p50 269ms. `parseTurnRequest`
  // drains the body and `turnReservation` compiles the whole persona prompt to
  // price the turn, neither of which needs to know who is asking. Running them
  // after the hop simply added their cost to it.
  //
  // The ORDER OF REFUSALS is unchanged: auth is still decided first below, so
  // an unauthenticated caller still gets a 401 and never a 400 that would tell
  // them their body parsed.
  const [auth, parsed] = await Promise.all([requireUser(request), parseVoiceRequest(request)])
  const authenticatedAt = performance.now()
  if ('response' in auth) return auth.response
  if (!parsed) return Response.json({ error: 'Invalid rep request.' }, { status: 400 })
  if (parsed.kind === 'warm') return warm(auth.userId, parsed.input, request.signal)
  const input = parsed.input
  const estimate = turnReservation(input)
  if (estimate.maxCostUsd === null) return Response.json({ error: 'This model has no verified rate.' }, { status: 503 })
  const allowed = await maySpend(auth.userId, 'turn', {
    sessionId: input.sessionId, personaSlug: input.personaId, operationId: input.turnId,
    kind: 'turn', model: estimate.model, maxCostUsd: estimate.maxCostUsd, resources: estimate.resources,
  })
  if (!allowed.ok) return allowed.response
  const admittedAt = performance.now()
  const { response, finished } = createCombinedTurn(input, allowed.reservation.context, request.signal, {
    onComplete: async (accounting) => {
      const llm = accounting.usage.llm
      try {
        const saved = await settleVoiceOperation({
          userId: auth.userId, sessionId: input.sessionId, operationId: input.turnId,
          costUsd: accounting.costUsd, status: accounting.status,
          ...(accounting.costUsd !== null && llm ? { resources: {
            llmInputTokens: llm.input, llmOutputTokens: llm.output,
            ttsCharacters: accounting.usage.tts.characters,
          } } : {}),
          usage: asJson(accounting.usage), metadata: asJson({
            ...accounting.metadata,
            authMs: Math.round(authenticatedAt - started),
            admissionMs: Math.round(admittedAt - authenticatedAt),
            requestToFirstAudioMs: typeof accounting.metadata.firstAudioMs === 'number'
              ? Math.round(admittedAt - started + accounting.metadata.firstAudioMs) : null,
          }),
        })
        if (!saved.ok) console.error('[nerve] voice usage persistence failed', { transport: 'combined-http', operationId: input.turnId })
      } catch {
        console.error('[nerve] voice usage persistence failed', { transport: 'combined-http', operationId: input.turnId })
      }
    },
  })
  // Keep settlement alive even when a barge-in closes the HTTP stream.
  after(() => finished)
  return response
}

/**
 * The countdown warm-up (`lib/voice/elevenlabs/warm.ts`). Answers 204 whatever
 * happens, because the client never waits for it and a rep must never hear
 * about it — but only after every gate a turn passes:
 *
 *   · `requireUser` above, so this instance's auth cache is warm for turn one;
 *   · the session is this user's, live, and for this character, read from the
 *     server (`voice_session_get`), which is also where the persona context the
 *     contract is compiled from comes from;
 *   · `maySpend` on the turn bucket — both kill switches, the daily cap, the
 *     rate limit (rule 11);
 *   · a bound computed before any vendor is called, and the ledger written
 *     from the providers' receipts or from that bound (rule 18).
 */
async function warm(userId: string, input: WarmRequest, signal: AbortSignal): Promise<Response> {
  const none = () => new Response(null, { status: 204 })
  const session = await findActiveVoiceSession({ userId, personaSlug: input.personaId })
  if (!session || session.sessionId !== input.sessionId) return none()
  const bound = warmBound(input, session.context)
  if (bound.maxCostUsd === null) return none()
  const allowed = await maySpend(userId, 'turn')
  if (!allowed.ok) return none()
  const accounting = await warmSession(input, session.context, signal)
  const saved = await recordStandaloneUsage({
    userId, operationId: input.operationId, kind: 'warm', provider: 'elevenlabs', model: bound.model,
    costUsd: accounting.costUsd,
    usage: asJson(accounting.usage),
    metadata: asJson({
      ...accounting.metadata, sessionId: input.sessionId,
      ...(accounting.measured ? {} : { measurement: 'reserved' }),
    }),
  }).catch(() => ({ ok: false }))
  if (!saved.ok) console.error('[nerve] warm-up usage persistence failed', { operationId: input.operationId })
  return none()
}
