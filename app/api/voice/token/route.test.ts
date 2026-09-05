import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from './route'
import { VoiceError } from '@/lib/voice/types'
import { SCORING_LIMITS } from '@/lib/voice/scoring-request'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), spend: vi.fn(), context: vi.fn(), quota: vi.fn(), mint: vi.fn(),
  open: vi.fn(), reserve: vi.fn(), settle: vi.fn(), abort: vi.fn(), abortAttempt: vi.fn(), after: vi.fn(),
}))
vi.mock('@/lib/db/api-auth', () => ({ requireUser: mocks.auth }))
vi.mock('@/lib/db/spend', () => ({ maySpend: mocks.spend }))
vi.mock('@/lib/db/persona-context', () => ({ personaContext: mocks.context }))
vi.mock('@/lib/db/progress', () => ({ mayOpenSession: mocks.quota }))
vi.mock('@/lib/db/voice-session', () => ({
  openVoiceSession: mocks.open, reserveVoiceOperation: mocks.reserve,
  settleVoiceOperation: mocks.settle, abortVoiceSession: mocks.abort,
  abortVoiceStartupAttempt: mocks.abortAttempt,
}))
vi.mock('@/lib/voice/mint', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/voice/mint')>(), mintSession: mocks.mint,
}))
vi.mock('next/server', async (importOriginal) => ({
  ...await importOriginal<typeof import('next/server')>(), after: mocks.after,
}))

const sessionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const opened = {
  ok: true, sessionId, resumed: false, expiresAt: '2099-01-01T00:00:00Z', budgetUsd: 0.20,
  context: { userName: 'Alex', memorySummary: 'Still choosing a book for her sister.' },
}
const minted = { provider: 'elevenlabs', clientSecret: 'ephemeral-fixture', model: 'eleven_v3_conversational' }
const request = (body: unknown = { personaId: 'tess' }) => new Request('https://nerve.test/api/voice/token', {
  method: 'POST', body: JSON.stringify(body),
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('VOICE_PROVIDER', 'elevenlabs')
  vi.stubEnv('PIPELINE_STT_MODEL', 'gpt-4o-mini-transcribe')
  vi.stubEnv('ELEVENLABS_TTS_MODEL', 'eleven_v3_conversational')
  vi.stubEnv('OPENAI_API_KEY', 'server-only-fixture')
  mocks.auth.mockResolvedValue({ userId: 'authenticated-user' })
  mocks.spend.mockResolvedValue({ ok: true })
  mocks.context.mockResolvedValue({ userName: 'Changed after the rep opened' })
  mocks.quota.mockResolvedValue({ ok: true })
  mocks.open.mockResolvedValue(opened)
  mocks.reserve.mockResolvedValue({ ok: true })
  mocks.settle.mockResolvedValue({ ok: true })
  mocks.abort.mockResolvedValue({ ok: true })
  mocks.abortAttempt.mockResolvedValue({ ok: true, refunded: true })
  mocks.mint.mockResolvedValue(minted)
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('owned transcription credential admission', () => {
  it('opens and reserves for the authenticated user before minting, preserving cached persona context', async () => {
    const response = await POST(request({ personaId: 'tess', userId: 'forged-user' }))
    expect(response.status).toBe(200)
    expect(mocks.open).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'authenticated-user', personaSlug: 'tess', provider: 'elevenlabs', model: 'eleven_v3_conversational',
    }))
    expect(mocks.reserve).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'authenticated-user', sessionId, personaSlug: 'tess', kind: 'stt',
      model: 'gpt-4o-mini-transcribe', maxCostUsd: 0.012, resources: { sttAudioMs: 240_000 },
    }))
    expect(mocks.reserve.mock.invocationCallOrder[0]).toBeLessThan(mocks.mint.mock.invocationCallOrder[0]!)
    expect(mocks.mint).toHaveBeenCalledWith('elevenlabs', expect.objectContaining({
      slug: 'tess', ...opened.context,
    }), expect.any(Object), expect.any(Object))
    const json = await response.json()
    expect(json).toMatchObject({ ...minted, sessionId, turn: { endpoint: '/api/voice/turn' } })
    expect(json.startupAttemptId).toBe(mocks.reserve.mock.calls[0]?.[0].operationId)
    expect(mocks.quota).not.toHaveBeenCalled()
  })

  it('does not wait for the estimated receipt write before returning the credential', async () => {
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(mocks.after).toHaveBeenCalledOnce()
    expect(mocks.settle).not.toHaveBeenCalled()
    await mocks.after.mock.calls[0]?.[0]()
    expect(mocks.settle).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'authenticated-user', sessionId, costUsd: null, status: 'unknown',
      usage: { estimatedAudioMs: 240_000 },
      metadata: expect.objectContaining({ model: 'gpt-4o-mini-transcribe' }),
    }))
  })

  it('logs an asynchronous receipt failure without exposing credentials or failing the mint', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.settle.mockResolvedValue({ ok: false })
    expect((await POST(request())).status).toBe(200)
    await mocks.after.mock.calls[0]?.[0]()
    expect(log).toHaveBeenCalledOnce()
    expect(log).toHaveBeenCalledWith('[nerve] voice usage persistence failed', {
      transport: 'token', operationId: expect.any(String),
    })
    const written = JSON.stringify(log.mock.calls)
    expect(written).not.toContain('ephemeral-fixture')
    expect(written).not.toContain('server-only-fixture')
  })

  it('prices the configured transcriber rather than always reserving for Mini', async () => {
    vi.stubEnv('PIPELINE_STT_MODEL', 'gpt-4o-transcribe')
    expect((await POST(request())).status).toBe(200)
    expect(mocks.reserve).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-4o-transcribe', maxCostUsd: 0.024 }))
  })

  it('refuses an unknown transcription tariff without opening or minting a rep', async () => {
    vi.stubEnv('PIPELINE_STT_MODEL', 'unpriced-transcriber')
    expect((await POST(request())).status).toBe(503)
    expect(mocks.open).not.toHaveBeenCalled()
    expect(mocks.reserve).not.toHaveBeenCalled()
    expect(mocks.mint).not.toHaveBeenCalled()
  })

  it('returns the atomic quota refusal without minting', async () => {
    mocks.open.mockResolvedValue({ ok: false, status: 429, message: 'No reps left.', reason: 'daily', refusal: 'daily' })
    const response = await POST(request())
    expect(response.status).toBe(429)
    expect(await response.json()).toMatchObject({ refusal: 'daily' })
    expect(mocks.reserve).not.toHaveBeenCalled()
    expect(mocks.mint).not.toHaveBeenCalled()
  })

  it('cleans up only its own failed mint attempt after releasing unissued credential resources', async () => {
    mocks.mint.mockRejectedValue(new VoiceError('provider_error', 'elevenlabs', 'Transcription unavailable.'))
    const response = await POST(request())
    expect(response.status).toBe(502)
    const operationId = mocks.reserve.mock.calls[0]?.[0].operationId
    expect(mocks.settle).toHaveBeenCalledWith(expect.objectContaining({
      sessionId, operationId, costUsd: 0, resources: { sttAudioMs: 0 }, status: 'failed',
    }))
    expect(mocks.abortAttempt).toHaveBeenCalledWith({ userId: 'authenticated-user', sessionId, operationId })
    expect(mocks.abort).not.toHaveBeenCalled()
    expect(mocks.after).not.toHaveBeenCalled()
  })

  it('uses attempt-aware cleanup when credential reservation itself fails', async () => {
    mocks.reserve.mockResolvedValue({ ok: false, status: 429, reason: 'resources', message: 'Credential limit reached.' })
    expect((await POST(request())).status).toBe(429)
    expect(mocks.mint).not.toHaveBeenCalled()
    expect(mocks.abortAttempt).toHaveBeenCalledWith({ userId: 'authenticated-user', sessionId, operationId: null })
    expect(mocks.abort).not.toHaveBeenCalled()
  })

  it('passes only the failed attempt to cleanup when a concurrent retry has succeeded', async () => {
    let rejectFirst!: (cause: Error) => void
    const firstMint = new Promise<never>((_resolve, reject) => { rejectFirst = reject })
    mocks.open.mockResolvedValueOnce(opened).mockResolvedValueOnce({ ...opened, resumed: true })
    mocks.mint.mockImplementationOnce(() => firstMint).mockResolvedValueOnce(minted)
    const original = POST(request())
    await vi.waitFor(() => expect(mocks.mint).toHaveBeenCalledOnce())
    const retried = await POST(request())
    expect(retried.status).toBe(200)
    const retryJson = await retried.json()
    rejectFirst(new VoiceError('provider_error', 'elevenlabs', 'The original mint failed.'))
    expect((await original).status).toBe(502)
    const firstAttempt = mocks.reserve.mock.calls[0]?.[0].operationId
    const secondAttempt = mocks.reserve.mock.calls[1]?.[0].operationId
    expect(firstAttempt).not.toBe(secondAttempt)
    expect(retryJson.startupAttemptId).toBe(secondAttempt)
    expect(mocks.abortAttempt).toHaveBeenCalledOnce()
    expect(mocks.abortAttempt).toHaveBeenCalledWith({
      userId: 'authenticated-user', sessionId, operationId: firstAttempt,
    })
    expect(mocks.abort).not.toHaveBeenCalled()
  })

  it('does not open or mint for malformed or oversized JSON bodies', async () => {
    for (const body of [null, [], 'not an object']) expect((await POST(request(body))).status).toBe(400)
    expect((await POST(request({ personaId: 'tess', padding: 'x'.repeat(SCORING_LIMITS.jsonBytes) }))).status).toBe(413)
    expect(mocks.open).not.toHaveBeenCalled()
    expect(mocks.mint).not.toHaveBeenCalled()
  })

  it('preserves the existing OpenAI quota path without creating an ElevenLabs envelope', async () => {
    vi.stubEnv('VOICE_PROVIDER', 'openai')
    mocks.mint.mockResolvedValue({ provider: 'openai', clientSecret: 'ephemeral-openai' })
    expect((await POST(request())).status).toBe(200)
    expect(mocks.quota).toHaveBeenCalledWith('authenticated-user')
    expect(mocks.open).not.toHaveBeenCalled()
    expect(mocks.reserve).not.toHaveBeenCalled()
  })
})
