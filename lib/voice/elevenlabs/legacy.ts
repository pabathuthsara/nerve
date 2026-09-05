/** Owned-session protection for clients minted before the combined HTTP path.
 * The wire protocol stays byte-for-byte SSE / PCM / NDJSON; usage observation
 * never tees an unbounded response or waits for a full reply before forwarding. */
import { getPersona } from '@/lib/personas'
import { asJson } from '@/lib/db/json'
import { maySpend } from '@/lib/db/spend'
import { findActiveVoiceSession, settleVoiceOperation, type VoiceResources } from '@/lib/db/voice-session'
import { parseChatTokenUsage, readScoringBody, type ChatTokenUsage } from '../scoring-request'
import { priceChatUsage } from '../rates'
import { turnReservation } from './combined'
import { isTtsModelId, resolvePipelineConfig, ttsModelSpec, type PipelineEnv } from './config'
import { handleLlmRequest, handleTtsRequest } from './server'
import type { LlmMessage } from './llm'
import { proxiedRequestId } from '../request-id'

type Kind = 'llm' | 'tts'
type SettledStatus = 'completed' | 'failed' | 'aborted'
interface Dependencies {
  findSession?: typeof findActiveVoiceSession
  allow?: typeof maySpend
  settle?: typeof settleVoiceOperation
  llm?: typeof handleLlmRequest
  tts?: typeof handleTtsRequest
}

const refused = (error: string, status: number) => ({
  response: Response.json({ error }, { status }), finished: Promise.resolve(),
})

export async function createLegacyVoiceResponse(
  request: Request,
  userId: string,
  kind: Kind,
  dependencies: Dependencies = {},
): Promise<{ response: Response; finished: Promise<void> }> {
  let body: Record<string, unknown>
  try { body = await readScoringBody(request) } catch { return refused('Invalid voice request.', 400) }
  const personaSlug = typeof body.personaId === 'string' ? body.personaId : ''
  if (!getPersona(personaSlug)) return refused('No such persona.', 404)

  const config = resolvePipelineConfig(process.env as PipelineEnv)
  let model: string
  let maxCostUsd: number | null
  let resources: VoiceResources
  let characters = 0
  if (kind === 'llm') {
    const history = parseHistory(body.history)
    if (!history || (body.steering != null && typeof body.steering !== 'string')
      || (typeof body.steering === 'string' && body.steering.length > 4000)) return refused('Invalid voice history.', 400)
    body = { ...body, history }
    const estimate = turnReservation({
      sessionId: '', turnId: '', personaId: personaSlug, history,
      steering: typeof body.steering === 'string' ? body.steering : null, warmth: 0,
    })
    model = estimate.model
    resources = { llmInputTokens: estimate.resources.llmInputTokens, llmOutputTokens: estimate.resources.llmOutputTokens }
    maxCostUsd = priceChatUsage(model, {
      input: estimate.resources.llmInputTokens, output: estimate.resources.llmOutputTokens,
    })
  } else {
    const text = typeof body.text === 'string' ? body.text.trim() : ''
    if (!text || text.length > 600) return refused('Invalid synthesis text.', 400)
    body = { ...body, text }
    model = isTtsModelId(body.model) ? body.model : config.tts.model
    characters = text.length
    resources = { ttsCharacters: characters }
    maxCostUsd = characters / 1000 * ttsModelSpec(model).usdPer1kChars
  }
  if (maxCostUsd === null) return refused('This model has no verified rate.', 503)

  const session = await (dependencies.findSession ?? findActiveVoiceSession)({ userId, personaSlug })
  if (!session) return refused('Start an active rep before requesting a voice reply.', 409)
  const operationId = crypto.randomUUID()
  const allowed = await (dependencies.allow ?? maySpend)(userId, kind, {
    sessionId: session.sessionId, personaSlug, operationId, kind, model, maxCostUsd, resources,
  })
  if (!allowed.ok) return { response: allowed.response, finished: Promise.resolve() }

  const abort = new AbortController()
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null
  let closed = false
  let accepted = false
  let usage: ChatTokenUsage | null = null
  let settlement: Promise<void> | null = null
  let finish!: () => void
  const finished = new Promise<void>((resolve) => { finish = resolve })
  const startedAt = performance.now()
  let firstByteMs: number | null = null
  let region: string | null = null
  let requestId: string | null = null
  const logReceiptFailure = () => console.error('[nerve] voice usage persistence failed', {
    transport: 'legacy-http', kind, operationId,
  })
  const finalize = (status: SettledStatus): Promise<void> => {
    if (settlement) return settlement
    clearTimeout(timer)
    request.signal.removeEventListener('abort', cancelFromRequest)
    const costUsd = kind === 'tts' ? accepted ? maxCostUsd : null
      : usage ? priceChatUsage(model, usage) : null
    settlement = (dependencies.settle ?? settleVoiceOperation)({
      userId, sessionId: session.sessionId, operationId, costUsd, status,
      ...(costUsd !== null ? { resources: kind === 'tts' ? resources : {
        llmInputTokens: usage!.input, llmOutputTokens: usage!.output,
      } } : {}),
      usage: asJson(kind === 'tts' ? { characters, accepted, basis: 'submitted_characters' } : { llm: usage }),
      metadata: asJson({ transport: 'legacy-http', kind, model, firstByteMs,
        durationMs: Math.round(performance.now() - startedAt), region, requestId,
        functionRegion: process.env.VERCEL_REGION ?? 'local' }),
    }).then((saved) => { if (!saved.ok) logReceiptFailure() }).catch(logReceiptFailure).finally(finish)
    return settlement
  }
  const cancel = (status: SettledStatus) => {
    abort.abort()
    void reader?.cancel().catch(() => {})
    if (!closed && controller) {
      closed = true
      if (status === 'failed') controller.error(new Error('The voice reply timed out.'))
      else controller.close()
    }
    void finalize(status)
  }
  const cancelFromRequest = () => cancel('aborted')
  const timer = setTimeout(() => cancel('failed'), 25_000)
  request.signal.addEventListener('abort', cancelFromRequest, { once: true })
  if (request.signal.aborted) {
    cancel('aborted')
    return { response: new Response(null, { status: 499 }), finished }
  }

  const upstreamRequest = new Request(request.url, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: abort.signal,
  })
  let upstream: Response
  try {
    upstream = kind === 'llm'
      ? await (dependencies.llm ?? handleLlmRequest)(upstreamRequest, allowed.reservation.context)
      : await (dependencies.tts ?? handleTtsRequest)(upstreamRequest)
  } catch {
    void finalize(request.signal.aborted ? 'aborted' : 'failed')
    return { response: Response.json({ error: 'The voice provider was unreachable.' }, { status: 502 }), finished }
  }
  requestId = proxiedRequestId(upstream.headers)
  if (abort.signal.aborted) {
    await upstream.body?.cancel().catch(() => {})
    return { response: new Response(null, { status: 499 }), finished }
  }
  if (!upstream.ok || !upstream.body) {
    void finalize('failed')
    return { response: upstream, finished }
  }
  accepted = true
  region = upstream.headers.get('x-nerve-tts-region')
  reader = upstream.body.getReader()
  const decoder = new TextDecoder()
  let pending = ''
  const inspect = (chunk: Uint8Array, done: boolean) => {
    if (kind !== 'llm') return
    pending += decoder.decode(chunk, { stream: !done })
    if (pending.length > 1_000_000) throw new Error('Invalid model stream.')
    const lines = pending.split('\n')
    pending = done ? '' : lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data:')) continue
      try {
        const payload = JSON.parse(line.slice(5).trim()) as { usage?: unknown }
        usage = parseChatTokenUsage(payload.usage) ?? usage
      } catch { /* SSE done marker or an unrelated vendor event. */ }
    }
  }
  const output = new ReadableStream<Uint8Array>({
    start(value) { controller = value },
    async pull(value) {
      if (closed) return
      try {
        const next = await reader!.read()
        if (closed) return
        if (next.done) {
          inspect(new Uint8Array(), true)
          closed = true
          value.close()
          void finalize('completed')
          reader!.releaseLock()
          return
        }
        if (firstByteMs === null) firstByteMs = Math.round(performance.now() - startedAt)
        inspect(next.value, false)
        value.enqueue(next.value)
      } catch (cause) {
        if (!closed) { closed = true; value.error(cause) }
        abort.abort()
        await reader!.cancel().catch(() => {})
        void finalize(request.signal.aborted ? 'aborted' : 'failed')
      }
    },
    cancel() { closed = true; cancel('aborted') },
  })
  return { response: new Response(output, { status: upstream.status, headers: upstream.headers }), finished }
}

function parseHistory(raw: unknown): LlmMessage[] | null {
  if (!Array.isArray(raw) || raw.length > 120) return null
  const history: LlmMessage[] = []
  let total = 0
  for (const value of raw) {
    if (!value || typeof value !== 'object') return null
    const item = value as Record<string, unknown>
    if ((item.role !== 'user' && item.role !== 'assistant') || typeof item.content !== 'string'
      || item.content.length > 2000) return null
    total += item.content.length
    if (total > 16_000) return null
    history.push({ role: item.role, content: item.content })
  }
  return history
}
