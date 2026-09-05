import 'server-only'

import { NextResponse } from 'next/server'
import { maySpend } from './spend'
import { settleVoiceOperation, recordStandaloneUsage } from './voice-session'
import { priceChatUsage } from '@/lib/voice/rates'
import { parseChatTokenUsage, reserveChatCost, scoringDeadline } from '@/lib/voice/scoring-request'

interface ScoringCall {
  request: Request
  userId: string
  sessionId: unknown
  kind: 'grade' | 'warmth'
  model: string
  apiKey: string
  messages: { role: 'system' | 'user'; content: string }[]
  maxOutputTokens: number
  timeoutMs: number
}

interface Completion {
  id?: unknown
  model?: unknown
  usage?: unknown
  choices?: { finish_reason?: unknown; message?: { content?: unknown } }[]
}

/** Both scorers account for every vendor attempt, including invalid JSON,
 * truncation and cancellation. A missing usage receipt retains the reservation
 * as an explicit estimate; it is never silently booked at zero. */
export async function runScoringCall(options: ScoringCall): Promise<
  { content: string; model: string } | { response: Response }
> {
  const { request, userId, kind, model, messages, maxOutputTokens } = options
  const sessionId = options.sessionId
  if (sessionId !== undefined && sessionId !== null
    && (typeof sessionId !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId))) {
    return { response: NextResponse.json({ error: 'invalid session' }, { status: 400 }) }
  }
  const boundSession = typeof sessionId === 'string' && userId !== 'internal' ? sessionId : null
  if (!boundSession) {
    const allowed = await maySpend(userId, kind)
    if (!allowed.ok) return { response: allowed.response }
  }
  const estimate = reserveChatCost(model, messages, maxOutputTokens)
  if (!estimate) {
    return { response: NextResponse.json({ error: 'scoring model has no configured tariff' }, { status: 503 }) }
  }
  const operationId = boundSession && kind === 'grade' ? 'grade' : crypto.randomUUID()
  if (boundSession) {
    const allowed = await maySpend(userId, kind, {
      sessionId: boundSession, operationId, kind, model,
      maxCostUsd: estimate.maxCostUsd,
      resources: { [`${kind}InputTokens`]: estimate.inputTokens, [`${kind}OutputTokens`]: maxOutputTokens },
    })
    if (!allowed.ok) {
      return { response: allowed.response }
    }
  }

  const started = performance.now()
  const deadline = scoringDeadline(request, options.timeoutMs)
  let upstream: Response | undefined
  let payload: Completion | undefined
  let attempted = false
  let state: 'completed' | 'failed' | 'aborted' | 'unknown' = 'unknown'
  let errorResponse: Response | undefined
  try {
    // Abort before fetch when the browser has already disconnected. There is
    // no automatic retry here: a retry is another separately budgeted call.
    deadline.signal.throwIfAborted()
    attempted = true
    upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
      cache: 'no-store',
      signal: deadline.signal,
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: maxOutputTokens,
        response_format: { type: 'json_object' },
        messages,
      }),
    })
    if (!upstream.ok) {
      state = 'failed'
      errorResponse = NextResponse.json({ error: `upstream ${upstream.status}` }, { status: 502 })
    } else {
      const decoded: unknown = await upstream.json()
      if (decoded && typeof decoded === 'object' && !Array.isArray(decoded)) payload = decoded as Completion
      state = 'completed'
    }
  } catch {
    state = deadline.signal.aborted ? 'aborted' : 'failed'
    errorResponse = NextResponse.json(
      { error: deadline.signal.aborted ? 'scoring interrupted' : 'upstream unreachable' },
      { status: deadline.signal.aborted ? 504 : 502 },
    )
  } finally {
    deadline.dispose()
    const usage = parseChatTokenUsage(payload?.usage)
    const reportedModel = typeof payload?.model === 'string' ? payload.model : model
    const costUsd = !attempted ? 0 : usage ? priceChatUsage(reportedModel, usage) : null
    const metadata = {
      measurement: !attempted ? 'not_requested' : costUsd === null ? 'reserved' : 'provider',
      providerModel: reportedModel,
      requestId: upstream?.headers.get('x-request-id') ?? null,
      completionId: typeof payload?.id === 'string' ? payload.id : null,
      elapsedMs: Math.round(performance.now() - started),
      status: state,
      upstreamStatus: upstream?.status ?? null,
      finishReason: typeof payload?.choices?.[0]?.finish_reason === 'string'
        ? payload.choices[0].finish_reason : null,
      region: process.env.VERCEL_REGION ?? null,
      deploymentUrl: process.env.VERCEL_URL ?? 'local',
    }
    try {
      let saved: { ok: boolean } | undefined
      if (boundSession) {
        saved = await settleVoiceOperation({
          userId, sessionId: boundSession, operationId, costUsd,
          usage: usage ? { ...usage } : null,
          metadata,
          status: state,
          ...(usage ? { resources: { [`${kind}InputTokens`]: usage.input, [`${kind}OutputTokens`]: usage.output } } : {}),
        })
      } else if (userId !== 'internal') {
        saved = await recordStandaloneUsage({
          userId, operationId, kind, provider: 'openai', model: reportedModel,
          costUsd: costUsd ?? estimate.maxCostUsd,
          usage: usage ? { ...usage } : null,
          metadata,
        })
      }
      if (saved && !saved.ok) {
        console.error('[nerve] scoring usage persistence failed', { kind, operationId })
      }
    } catch {
      // Bound calls retain their atomic reservation if receipt persistence
      // fails. Do not turn a valid debrief into an error after paying for it.
      console.error('[nerve] scoring usage persistence failed', { kind, operationId })
    }
  }

  if (errorResponse) return { response: errorResponse }
  if (payload?.choices?.[0]?.finish_reason === 'length') {
    return { response: NextResponse.json({ error: 'scoring output truncated' }, { status: 502 }) }
  }
  const content = payload?.choices?.[0]?.message?.content
  if (typeof content !== 'string') {
    return { response: NextResponse.json({ error: 'no content' }, { status: 502 }) }
  }
  return { content, model: typeof payload?.model === 'string' ? payload.model : model }
}
