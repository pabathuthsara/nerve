import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLegacyVoiceResponse } from './legacy'
import type { PersonaOverlay } from './server'
import type { settleVoiceOperation } from '@/lib/db/voice-session'
import { PROVIDER_REQUEST_ID_HEADER } from '../request-id'

const sessionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
function request(body: Record<string, unknown>, signal?: AbortSignal): Request {
  return new Request('http://test/api/voice/llm', {
    method: 'POST', body: JSON.stringify({ personaId: 'tess', ...body }),
    ...(signal ? { signal } : {}),
  })
}
function dependencies() {
  const reservation = {
    sessionId, operationId: 'operation', maxCostUsd: 0.03,
    context: { userName: 'Alice' }, expiresAt: '2099-01-01T00:00:00Z',
  }
  return {
    findSession: vi.fn(async (input: { userId: string; personaSlug: string }) => input.userId === 'owner'
      ? { sessionId, expiresAt: reservation.expiresAt, context: reservation.context } : null),
    allow: vi.fn(async (_user: string, _bucket: string, _operation?: unknown) => ({ ok: true as const, reservation })),
    settle: vi.fn(async (_input: Parameters<typeof settleVoiceOperation>[0]) => ({ ok: true })),
    llm: vi.fn(async (_request: Request, _overlay?: PersonaOverlay) => new Response('data: [DONE]\n\n')),
    tts: vi.fn(async (_request: Request) => new Response('audio', { headers: { 'x-nerve-tts-format': 'pcm' } })),
  }
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('legacy paid voice endpoints', () => {
  it.each(['llm', 'tts'] as const)('refuses %s without an owned active rep before spending', async (kind) => {
    const deps = dependencies()
    const result = await createLegacyVoiceResponse(request({ history: [], text: 'Hello.' }), 'foreign-user', kind, deps)
    expect(result.response.status).toBe(409)
    expect(deps.allow).not.toHaveBeenCalled()
    expect(deps.llm).not.toHaveBeenCalled()
    expect(deps.tts).not.toHaveBeenCalled()
  })

  it('reserves the active owner session rather than any submitted session id', async () => {
    const deps = dependencies()
    const result = await createLegacyVoiceResponse(request({
      text: ' Hello. ', sessionId: 'someone-elses-session', model: 'eleven_v3_conversational',
    }), 'owner', 'tts', deps)
    expect(deps.allow).toHaveBeenCalledWith('owner', 'tts', expect.objectContaining({
      sessionId, personaSlug: 'tess', resources: { ttsCharacters: 6 }, maxCostUsd: expect.closeTo(0.0003, 8),
    }))
    expect(result.response.headers.get('x-nerve-tts-format')).toBe('pcm')
    expect(await result.response.text()).toBe('audio')
    await result.finished
    expect(deps.settle).toHaveBeenCalledOnce()
    expect(deps.settle).toHaveBeenCalledWith(expect.objectContaining({ sessionId, costUsd: expect.closeTo(0.0003, 8), status: 'completed' }))
  })

  it('forwards SSE bytes unchanged and prices provider-reported cached tokens', async () => {
    const deps = dependencies()
    const wire = 'data: {"choices":[{"delta":{"content":"Hi."}}]}\n\n'
      + 'data: {"usage":{"prompt_tokens":1000,"completion_tokens":20,"prompt_tokens_details":{"cached_tokens":800}},"choices":[]}'
    deps.llm.mockResolvedValue(new Response(wire, { headers: { 'content-type': 'text/event-stream' } }))
    const result = await createLegacyVoiceResponse(request({ history: [], steering: null }), 'owner', 'llm', deps)
    expect(result.response.headers.get('content-type')).toBe('text/event-stream')
    expect(await result.response.text()).toBe(wire)
    await result.finished
    expect(deps.llm).toHaveBeenCalledWith(expect.any(Request), { userName: 'Alice' })
    expect(deps.settle).toHaveBeenCalledWith(expect.objectContaining({
      costUsd: 0.000192, resources: { llmInputTokens: 1000, llmOutputTokens: 20 }, status: 'completed',
    }))
  })

  it('keeps the reservation when LLM usage is missing', async () => {
    const deps = dependencies()
    const result = await createLegacyVoiceResponse(request({ history: [] }), 'owner', 'llm', deps)
    await result.response.text()
    await result.finished
    expect(deps.settle).toHaveBeenCalledWith(expect.objectContaining({ costUsd: null, status: 'completed' }))
  })

  it('settles a disconnected stream once, cancels upstream, and keeps unknown usage reserved', async () => {
    const deps = dependencies()
    const cancel = vi.fn()
    deps.llm.mockResolvedValue(new Response(new ReadableStream({ cancel })))
    const abort = new AbortController()
    const result = await createLegacyVoiceResponse(request({ history: [] }, abort.signal), 'owner', 'llm', deps)
    const reader = result.response.body!.getReader()
    const reading = reader.read()
    abort.abort()
    await reading
    await result.finished
    expect(cancel).toHaveBeenCalledOnce()
    expect(deps.settle).toHaveBeenCalledOnce()
    expect(deps.settle).toHaveBeenCalledWith(expect.objectContaining({ costUsd: null, status: 'aborted' }))
    await reader.cancel()
    expect(deps.settle).toHaveBeenCalledOnce()
  })

  it('forwards the first audio chunk before the synthesis completes', async () => {
    const deps = dependencies()
    let controller!: ReadableStreamDefaultController<Uint8Array>
    deps.tts.mockResolvedValue(new Response(new ReadableStream({ start(value) { controller = value } })))
    const result = await createLegacyVoiceResponse(request({ text: 'Hello.' }), 'owner', 'tts', deps)
    const reader = result.response.body!.getReader()
    controller.enqueue(new Uint8Array([1, 2]))
    expect((await reader.read()).value).toEqual(new Uint8Array([1, 2]))
    expect(deps.settle).not.toHaveBeenCalled()
    controller.close()
    await reader.read()
    await result.finished
    expect(deps.settle).toHaveBeenCalledOnce()
  })

  it('refuses oversized history before reserving or generating', async () => {
    const deps = dependencies()
    const result = await createLegacyVoiceResponse(request({ history: [{ role: 'user', content: 'x'.repeat(2001) }] }), 'owner', 'llm', deps)
    expect(result.response.status).toBe(400)
    expect(deps.allow).not.toHaveBeenCalled()
    expect(deps.llm).not.toHaveBeenCalled()
  })

  it('preserves request IDs and logs failed receipts without changing the streamed audio', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const deps = dependencies()
    deps.settle.mockResolvedValue({ ok: false })
    deps.tts.mockResolvedValue(new Response('original audio', {
      headers: { [PROVIDER_REQUEST_ID_HEADER]: 'eleven_request_fixture' },
    }))
    const result = await createLegacyVoiceResponse(request({ text: 'Hello.' }), 'owner', 'tts', deps)
    expect(await result.response.text()).toBe('original audio')
    await result.finished
    expect(deps.settle).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ requestId: 'eleven_request_fixture' }),
    }))
    expect(log).toHaveBeenCalledOnce()
    expect(log).toHaveBeenCalledWith('[nerve] voice usage persistence failed', {
      transport: 'legacy-http', kind: 'tts', operationId: expect.any(String),
    })
  })
})
