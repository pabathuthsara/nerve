import { after } from 'next/server'
import { requireUser } from '@/lib/db/api-auth'
import { maySpend } from '@/lib/db/spend'
import { claimVoiceOperation, settleVoiceOperation } from '@/lib/db/voice-session'
import { verifyTurnTicket } from '@/lib/voice/elevenlabs/ticket'
import { asJson } from '@/lib/db/json'
import { createCombinedTurn, parseTurnRequest, turnReservation } from '@/lib/voice/elevenlabs/combined'

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
  const [auth, input] = await Promise.all([requireUser(request), parseTurnRequest(request)])
  const authenticatedAt = performance.now()
  if ('response' in auth) return auth.response
  if (!input) return Response.json({ error: 'Invalid rep request.' }, { status: 400 })
  const estimate = turnReservation(input)
  if (estimate.maxCostUsd === null) return Response.json({ error: 'This model has no verified rate.' }, { status: 503 })

  // THE TICKET PATH (PERSONA-REALISM-REPORT L2). This turn was admitted by
  // `maySpend` while her previous line was still playing, and the ticket is
  // the signed proof. It is honoured only when it verifies for this user, this
  // rep, this turn and this persona, and when this turn's own estimate still
  // fits the bound it was reserved under; otherwise it is ignored and the turn
  // is admitted here, exactly as before. The claim runs beside the writer and
  // gates synthesis — see `CombinedDependencies.admission`.
  const claims = input.ticket
    ? await verifyTurnTicket(input.ticket, {
        userId: auth.userId, sessionId: input.sessionId, operationId: input.turnId, personaSlug: input.personaId,
      })
    : null
  const ticketed = claims !== null && estimate.maxCostUsd <= claims.maxCostUsd
  // A ticket that did not verify may still name a real reservation, which the
  // ordinary path must not collide with. That reservation is never claimed and
  // is released at zero by the next reserve or the end of the rep.
  const operationId = input.ticket && !ticketed ? `${input.turnId}:r` : input.turnId
  let context
  let admission: Promise<boolean> | undefined
  if (ticketed) {
    context = claims.context
    admission = claimVoiceOperation({ userId: auth.userId, sessionId: input.sessionId, operationId })
  } else {
    const allowed = await maySpend(auth.userId, 'turn', {
      sessionId: input.sessionId, personaSlug: input.personaId, operationId,
      kind: 'turn', model: estimate.model, maxCostUsd: estimate.maxCostUsd, resources: estimate.resources,
    })
    if (!allowed.ok) return allowed.response
    context = allowed.reservation.context
  }
  const admittedAt = performance.now()
  const { response, finished } = createCombinedTurn(input, context, request.signal, {
    ...(admission ? { admission } : {}),
    onComplete: async (accounting) => {
      // A ticket whose claim was refused never owned this reservation — it was
      // replayed, or already used — so it has nothing here to settle.
      if (admission && !(await admission)) return
      const llm = accounting.usage.llm
      try {
        const saved = await settleVoiceOperation({
          userId: auth.userId, sessionId: input.sessionId, operationId,
          costUsd: accounting.costUsd, status: accounting.status,
          ...(accounting.costUsd !== null && llm ? { resources: {
            llmInputTokens: llm.input, llmOutputTokens: llm.output,
            ttsCharacters: accounting.usage.tts.characters,
          } } : {}),
          usage: asJson(accounting.usage), metadata: asJson({
            ...accounting.metadata,
            authMs: Math.round(authenticatedAt - started),
            admissionMs: Math.round(admittedAt - authenticatedAt),
            ticketed,
            requestToFirstAudioMs: typeof accounting.metadata.firstAudioMs === 'number'
              ? Math.round(admittedAt - started + accounting.metadata.firstAudioMs) : null,
          }),
        })
        if (!saved.ok) console.error('[nerve] voice usage persistence failed', { transport: 'combined-http', operationId })
      } catch {
        console.error('[nerve] voice usage persistence failed', { transport: 'combined-http', operationId })
      }
    },
  })
  // Keep settlement alive even when a barge-in closes the HTTP stream.
  after(() => finished)
  return response
}
