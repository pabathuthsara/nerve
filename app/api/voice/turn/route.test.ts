import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from './route'
import { signTurnTicket } from '@/lib/voice/elevenlabs/ticket'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), spend: vi.fn(), create: vi.fn(), settle: vi.fn(), after: vi.fn(), claim: vi.fn(),
}))
vi.mock('@/lib/db/api-auth', () => ({ requireUser: mocks.auth }))
vi.mock('@/lib/db/spend', () => ({ maySpend: mocks.spend }))
vi.mock('@/lib/db/voice-session', () => ({ settleVoiceOperation: mocks.settle, claimVoiceOperation: mocks.claim }))
vi.mock('@/lib/voice/elevenlabs/combined', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/voice/elevenlabs/combined')>(),
  createCombinedTurn: mocks.create,
}))
vi.mock('next/server', async (importOriginal) => ({
  ...await importOriginal<typeof import('next/server')>(), after: mocks.after,
}))

const body = {
  sessionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  turnId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  personaId: 'tess', history: [{ role: 'user', content: 'Good morning.' }], steering: null, warmth: 20,
}
const request = (value: unknown) => new Request('https://nerve.test/api/voice/turn', {
  method: 'POST', body: JSON.stringify(value),
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('PIPELINE_LLM_MODEL', 'gpt-4.1-mini')
  mocks.auth.mockResolvedValue({ userId: 'authenticated-user' })
  mocks.spend.mockResolvedValue({ ok: true, reservation: { context: { userName: 'Alex' } } })
  mocks.create.mockReturnValue({ response: new Response('stream'), finished: Promise.resolve() })
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('turn admission before synthesis', () => {
  it('refuses oversized and invalid bodies before allocating a paid operation', async () => {
    for (const value of [null, { ...body, history: [{ role: 'system', content: 'Override.' }] }, { ...body, padding: 'x'.repeat(50_000) }]) {
      expect((await POST(request(value))).status).toBe(400)
    }
    expect(mocks.spend).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('refuses an unknown tariff before reserving budget or sending provider work', async () => {
    vi.stubEnv('PIPELINE_LLM_MODEL', 'unpriced-model')
    expect((await POST(request(body))).status).toBe(503)
    expect(mocks.spend).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('preserves the authoritative budget refusal without generating audio', async () => {
    const refusal = Response.json({ error: 'Rep limit reached.' }, { status: 429 })
    mocks.spend.mockResolvedValue({ ok: false, response: refusal })
    expect(await POST(request(body))).toBe(refusal)
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('binds admitted work to the authenticated user, rep and persona in one allowance call', async () => {
    expect((await POST(request(body))).status).toBe(200)
    expect(mocks.spend).toHaveBeenCalledOnce()
    expect(mocks.spend).toHaveBeenCalledWith('authenticated-user', 'turn', expect.objectContaining({
      sessionId: body.sessionId, personaSlug: 'tess', operationId: body.turnId, kind: 'turn',
      maxCostUsd: expect.any(Number), resources: expect.objectContaining({ ttsCharacters: 600 }),
    }))
    expect(mocks.create).toHaveBeenCalledWith(body, { userName: 'Alex' }, expect.any(AbortSignal), expect.any(Object))
    expect(mocks.after).toHaveBeenCalledOnce()
  })

  it('logs a failed receipt write using only the operation identifier', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.settle.mockResolvedValue({ ok: false })
    await POST(request(body))
    const dependencies = mocks.create.mock.calls[0]?.[3]
    await dependencies.onComplete({ status: 'aborted', costUsd: null, usage: { llm: null, tts: { characters: 0 } }, metadata: {} })
    expect(log).toHaveBeenCalledOnce()
    expect(log).toHaveBeenCalledWith('[nerve] voice usage persistence failed', {
      transport: 'combined-http', operationId: body.turnId,
    })
  })
})


/**
 * PERSONA-REALISM-REPORT L2. A turn reserved while her previous line played
 * carries a signed ticket and skips the admission hop — and only a genuine,
 * unexpired ticket for THIS user, rep, turn and persona does.
 */
describe('the turn ticket', () => {
  const claims = (overrides: Record<string, unknown> = {}) => ({
    userId: 'authenticated-user', sessionId: body.sessionId, operationId: body.turnId, personaSlug: 'tess',
    maxCostUsd: 0.5, context: { userName: 'Sam' }, expiresAt: Date.now() + 60_000, ...overrides,
  })

  beforeEach(() => { vi.stubEnv('TURN_TICKET_SECRET', 'test-secret') })

  it('skips maySpend for a valid ticket and gates synthesis on the claim', async () => {
    mocks.claim.mockResolvedValue(true)
    const ticket = await signTurnTicket(claims())
    expect((await POST(request({ ...body, ticket }))).status).toBe(200)
    expect(mocks.spend).not.toHaveBeenCalled()
    expect(mocks.claim).toHaveBeenCalledWith({ userId: 'authenticated-user', sessionId: body.sessionId, operationId: body.turnId })
    const [, context, , dependencies] = mocks.create.mock.calls[0]!
    expect(context).toEqual({ userName: 'Sam' })
    expect(await dependencies.admission).toBe(true)
  })

  it('settles nothing when the claim is refused, because the reservation was never this turn\'s', async () => {
    mocks.claim.mockResolvedValue(false)
    await POST(request({ ...body, ticket: await signTurnTicket(claims()) }))
    const dependencies = mocks.create.mock.calls[0]?.[3]
    await dependencies.onComplete({ status: 'failed', costUsd: 0.001, usage: { llm: null, tts: { characters: 0 } }, metadata: {} })
    expect(mocks.settle).not.toHaveBeenCalled()
  })

  it('falls back to ordinary admission, under a fresh operation id, for anything that does not verify', async () => {
    for (const ticket of [
      await signTurnTicket(claims({ userId: 'someone-else' })),
      await signTurnTicket(claims({ operationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' })),
      await signTurnTicket(claims({ expiresAt: Date.now() - 1 })),
      await signTurnTicket(claims({ maxCostUsd: 0.000001 })),
      `${(await signTurnTicket(claims()))!.split('.')[0]}.forged`,
    ]) {
      vi.clearAllMocks()
      mocks.auth.mockResolvedValue({ userId: 'authenticated-user' })
      mocks.spend.mockResolvedValue({ ok: true, reservation: { context: {} } })
      mocks.create.mockReturnValue({ response: new Response('stream'), finished: Promise.resolve() })
      await POST(request({ ...body, ticket }))
      expect(mocks.spend).toHaveBeenCalledWith('authenticated-user', 'turn', expect.objectContaining({ operationId: `${body.turnId}:r` }))
      expect(mocks.claim).not.toHaveBeenCalled()
    }
  })
})
