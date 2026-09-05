import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runScoringCall } from './scoring-usage'
import { priceChatUsage } from '@/lib/voice/rates'

const mocks = vi.hoisted(() => ({
  allowance: vi.fn(), reserve: vi.fn(), settle: vi.fn(), standalone: vi.fn(),
}))
vi.mock('./spend', () => ({
  maySpend: async (userId: string, kind: string, operation?: Record<string, unknown>) => {
    if (!operation) return mocks.allowance(userId, kind)
    const allowed = await mocks.reserve({ ...operation, userId })
    return allowed.ok ? allowed : {
      ok: false, response: Response.json({ error: allowed.message, reason: allowed.reason }, { status: allowed.status }),
    }
  },
}))
vi.mock('./voice-session', () => ({
  reserveVoiceOperation: mocks.reserve,
  settleVoiceOperation: mocks.settle,
  recordStandaloneUsage: mocks.standalone,
}))

const sessionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const usage = {
  prompt_tokens: 1_000, completion_tokens: 100, total_tokens: 1_100,
  prompt_tokens_details: { cached_tokens: 800 },
}
const result = (content = '{}', finishReason = 'stop') => Response.json({
  id: 'chatcmpl-real-shape', model: 'gpt-4.1-mini-2025-04-14', usage,
  choices: [{ finish_reason: finishReason, message: { content } }],
}, { headers: { 'x-request-id': 'request-fixture' } })
const upstream = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.clearAllMocks()
  mocks.allowance.mockResolvedValue({ ok: true })
  mocks.reserve.mockResolvedValue({ ok: true, reservation: { sessionId } })
  mocks.settle.mockResolvedValue({ ok: true })
  mocks.standalone.mockResolvedValue({ ok: true })
  upstream.mockResolvedValue(result())
  vi.stubGlobal('fetch', upstream)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function options(overrides: Partial<Parameters<typeof runScoringCall>[0]> = {}) {
  return {
    request: new Request('https://nerve.test/api/warmth/score'),
    userId: 'user-1', sessionId, kind: 'warmth' as const,
    model: 'gpt-4.1-mini', apiKey: 'test-key',
    messages: [{ role: 'user' as const, content: 'A test turn.' }],
    maxOutputTokens: 160, timeoutMs: 8_000,
    ...overrides,
  }
}

describe('paid scoring calls', () => {
  it('refuses an exhausted owned rep before calling the provider', async () => {
    mocks.reserve.mockResolvedValue({ ok: false, status: 429, reason: 'budget', message: 'Limit reached.' })
    const response = await runScoringCall(options())
    expect('response' in response && response.response.status).toBe(429)
    expect(upstream).not.toHaveBeenCalled()
    expect(mocks.settle).not.toHaveBeenCalled()
  })

  it('reserves once, then records cached provider tokens and request IDs', async () => {
    const response = await runScoringCall(options())
    expect(response).toEqual({ content: '{}', model: 'gpt-4.1-mini-2025-04-14' })
    expect(mocks.allowance).not.toHaveBeenCalled()
    expect(mocks.reserve).toHaveBeenCalledOnce()
    expect(mocks.settle).toHaveBeenCalledWith(expect.objectContaining({
      sessionId, costUsd: priceChatUsage('gpt-4.1-mini', { input: 1_000, output: 100, cachedInput: 800 }),
      usage: { input: 1_000, output: 100, cachedInput: 800, total: 1_100 },
      resources: { warmthInputTokens: 1_000, warmthOutputTokens: 100 },
      metadata: expect.objectContaining({ measurement: 'provider', requestId: 'request-fixture' }),
      status: 'completed',
    }))
    const init = upstream.mock.calls[0]?.[1]
    expect(init?.cache).toBe('no-store')
    expect(JSON.parse(init?.body as string)).toMatchObject({ max_tokens: 160, temperature: 0 })
  })

  it('uses a fixed per-rep grade operation so duplicate requests cannot buy another grade', async () => {
    await runScoringCall(options({ kind: 'grade' }))
    expect(mocks.reserve).toHaveBeenCalledWith(expect.objectContaining({ operationId: 'grade', kind: 'grade' }))
  })

  it('accounts for a truncated completion but does not return a partial score', async () => {
    upstream.mockResolvedValue(result('{"intent":', 'length'))
    const response = await runScoringCall(options())
    expect('response' in response && response.response.status).toBe(502)
    expect(mocks.settle).toHaveBeenCalledWith(expect.objectContaining({ costUsd: expect.any(Number), status: 'completed' }))
  })

  it('retains the reservation if an accepted provider response contains no usage', async () => {
    upstream.mockResolvedValue(Response.json({ choices: [{ message: { content: '{}' } }] }))
    await runScoringCall(options())
    expect(mocks.settle).toHaveBeenCalledWith(expect.objectContaining({
      costUsd: null, usage: null,
      metadata: expect.objectContaining({ measurement: 'reserved' }),
    }))
  })

  it('retains an estimate for failed upstream requests instead of claiming no spend', async () => {
    upstream.mockRejectedValue(new Error('network disconnected after sending'))
    const response = await runScoringCall(options())
    expect('response' in response && response.response.status).toBe(502)
    expect(mocks.settle).toHaveBeenCalledWith(expect.objectContaining({ costUsd: null, status: 'failed' }))
  })

  it('cancels a stalled provider call and settles the in-flight reservation', async () => {
    vi.useFakeTimers()
    upstream.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
    }))
    const pending = runScoringCall(options({ timeoutMs: 100 }))
    await vi.advanceTimersByTimeAsync(100)
    const response = await pending
    expect('response' in response && response.response.status).toBe(504)
    expect(mocks.settle).toHaveBeenCalledWith(expect.objectContaining({ costUsd: null, status: 'aborted' }))
  })

  it('does not charge for a call that was cancelled before it was sent', async () => {
    const controller = new AbortController()
    controller.abort()
    await runScoringCall(options({ request: new Request('https://nerve.test', { signal: controller.signal }) }))
    expect(upstream).not.toHaveBeenCalled()
    expect(mocks.settle).toHaveBeenCalledWith(expect.objectContaining({ costUsd: 0, status: 'aborted' }))
  })

  it('keeps legacy standalone callers authenticated and writes their provider usage', async () => {
    await runScoringCall(options({ sessionId: undefined }))
    expect(mocks.allowance).toHaveBeenCalledWith('user-1', 'warmth')
    expect(mocks.reserve).not.toHaveBeenCalled()
    expect(mocks.standalone).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1', kind: 'warmth', provider: 'openai', costUsd: expect.any(Number),
      usage: { input: 1_000, output: 100, cachedInput: 800, total: 1_100 },
    }))
  })

  it('does not buy a call when its model has no configured tariff', async () => {
    const response = await runScoringCall(options({ model: 'unknown' }))
    expect('response' in response && response.response.status).toBe(503)
    expect(upstream).not.toHaveBeenCalled()
  })
})
