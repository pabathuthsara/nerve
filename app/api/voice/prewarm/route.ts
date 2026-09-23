import { after } from 'next/server'
import { requireUser } from '@/lib/db/api-auth'
import { maySpend } from '@/lib/db/spend'
import { settleVoiceOperation } from '@/lib/db/voice-session'
import { asJson } from '@/lib/db/json'
import { getPersona } from '@/lib/personas'
import { prewarmPipeline, prewarmReservation } from '@/lib/voice/elevenlabs/prewarm'

/**
 * Warm her first turn while the 3·2·1 is still counting
 * (PERSONA-REALISM-REPORT L1). See `lib/voice/elevenlabs/prewarm.ts`.
 *
 * Admitted through `maySpend` like every route that spends money (rule 11) —
 * a tenth of a cent is still spend — and settled from the vendors' own usage.
 * Answers 202 at once and does the work after the response, because nothing
 * is waiting on it: the whole point is that it finishes before he speaks. The
 * session call is the only thing the browser learns, and it learns nothing
 * from the answer.
 *
 * The same auth call also seeds the 60-second session cache
 * (`requireUser`), which is the first turn's other cold hop.
 */
export const runtime = 'edge'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: Request): Promise<Response> {
  const auth = await requireUser(request)
  if ('response' in auth) return auth.response
  let body: Record<string, unknown>
  try { body = (await request.json()) as Record<string, unknown> } catch { return Response.json({ error: 'Malformed.' }, { status: 400 }) }
  const sessionId = typeof body.sessionId === 'string' && UUID.test(body.sessionId) ? body.sessionId : null
  const personaId = typeof body.personaId === 'string' && getPersona(body.personaId) ? body.personaId : null
  if (!sessionId || !personaId) return Response.json({ error: 'Invalid prewarm.' }, { status: 400 })

  const bound = prewarmReservation(personaId, sessionId)
  if (!bound) return Response.json({ error: 'This model has no verified rate.' }, { status: 503 })
  // One per rep: the operation id is the rep's, so a second call is a
  // duplicate and is refused by the reservation itself.
  const operationId = `prewarm:${sessionId}`
  const allowed = await maySpend(auth.userId, 'llm', {
    sessionId, personaSlug: personaId, operationId, kind: 'llm',
    model: bound.model, maxCostUsd: bound.maxCostUsd, resources: bound.resources,
  })
  if (!allowed.ok) return allowed.response

  after(async () => {
    const result = await prewarmPipeline({ personaId, sessionId }, allowed.reservation.context, new AbortController().signal)
    await settleVoiceOperation({
      userId: auth.userId, sessionId, operationId, costUsd: result.costUsd,
      status: result.llm ? 'completed' : 'failed',
      ...(result.costUsd !== null && result.llm ? { resources: {
        llmInputTokens: result.llm.input, llmOutputTokens: result.llm.output, ttsCharacters: result.ttsCharacters,
      } } : {}),
      usage: asJson({ llm: result.llm, tts: { characters: result.ttsCharacters } }),
      metadata: asJson(result.metadata),
    }).catch(() => undefined)
  })
  return new Response(null, { status: 202 })
}
