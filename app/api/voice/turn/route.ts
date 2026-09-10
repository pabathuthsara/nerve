import { after } from 'next/server'
import { requireUser } from '@/lib/db/api-auth'
import { maySpend } from '@/lib/db/spend'
import { settleVoiceOperation } from '@/lib/db/voice-session'
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
