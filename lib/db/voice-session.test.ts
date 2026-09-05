import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), upsert: vi.fn() }))
vi.mock('./admin', () => ({ supabaseAdmin: () => db }))

import {
  activateVoiceSession, abortVoiceSession, abortVoiceStartupAttempt, closeVoiceSession, findActiveVoiceSession,
  openVoiceSession, recordStandaloneUsage, refundEmptyVoiceSession, reserveVoiceOperation,
  serverVoiceSessionExists, settleVoiceOperation, voiceBudgetPolicy,
} from './voice-session'

const open = {
  userId: 'user-a', personaSlug: 'tess', provider: 'elevenlabs',
  model: 'eleven_v3_conversational', context: { userName: 'Alex' },
}
const operation = {
  userId: 'user-a', sessionId: 'session-a', personaSlug: 'tess', operationId: 'turn-a',
  kind: 'turn' as const, model: 'gpt-4.1-mini+eleven_v3_conversational',
  maxCostUsd: .035, resources: { llmInputTokens: 8_000, llmOutputTokens: 120, ttsCharacters: 600 },
}
const expires = '2026-09-05T12:04:00.000Z'

beforeEach(() => {
  vi.stubEnv('NERVE_SPEND_HALT', '')
  vi.stubEnv('NERVE_VOICE_BUDGET_USD', '')
  db.rpc.mockReset()
  db.from.mockReset().mockReturnValue({ upsert: db.upsert })
  db.upsert.mockReset().mockResolvedValue({ error: null })
})
afterEach(() => vi.unstubAllEnvs())

describe('voice budget policy', () => {
  it('preserves a roomy default and a protected grade instead of imposing an unvalidated eight-cent cap', () => {
    expect(voiceBudgetPolicy({})).toMatchObject({ budgetUsd: .20, gradeReserveUsd: .03, liveSeconds: 240, gradeSeconds: 600 })
  })
  it.each(['', '-1', '0', 'NaN', 'Infinity', '12', '0.01'])(
    'refuses unsafe environment budget %s', (value) => {
      expect(voiceBudgetPolicy({ NERVE_VOICE_BUDGET_USD: value }).budgetUsd).toBe(.20)
    },
  )
  it('accepts an explicitly selected bounded budget', () => {
    expect(voiceBudgetPolicy({ NERVE_VOICE_BUDGET_USD: '0.12' }).budgetUsd).toBe(.12)
  })
})

describe('server-owned admission', () => {
  it('sends only server policy to the atomic quota+session RPC', async () => {
    db.rpc.mockResolvedValue({ error: null, data: { ok: true, session_id: 'session-a', expires_at: expires, context: open.context, resumed: false, budget_usd: .20 } })
    expect(await openVoiceSession(open)).toEqual({ ok: true, sessionId: 'session-a', expiresAt: expires, context: open.context, resumed: false, budgetUsd: .20 })
    expect(db.rpc).toHaveBeenCalledOnce()
    expect(db.rpc).toHaveBeenCalledWith('voice_session_open', expect.objectContaining({ p_user_id: 'user-a', p_budget_usd: .20, p_grade_reserve_usd: .03, p_context: { userName: 'Alex' } }))
  })
  it('returns the upgrade refusal without treating it as a transient outage', async () => {
    db.rpc.mockResolvedValue({ error: null, data: { ok: false, reason: 'upgrade' } })
    expect(await openVoiceSession(open)).toMatchObject({ ok: false, status: 429, reason: 'upgrade', refusal: 'upgrade' })
  })
  it('honors the environment halt without requiring a functioning database', async () => {
    vi.stubEnv('NERVE_SPEND_HALT', 'TRUE')
    expect(await openVoiceSession(open)).toMatchObject({ ok: false, reason: 'halted' })
    expect(await reserveVoiceOperation(operation)).toMatchObject({ ok: false, reason: 'halted' })
    expect(db.rpc).not.toHaveBeenCalled()
  })
  it('fails closed if the database cannot reserve spending', async () => {
    db.rpc.mockResolvedValue({ error: { message: 'unreachable' }, data: null })
    expect(await reserveVoiceOperation(operation)).toMatchObject({ ok: false, status: 503 })
  })
  it('does not grant a new generation on an idempotency collision', async () => {
    db.rpc.mockResolvedValue({ error: null, data: { ok: false, reason: 'duplicate' } })
    expect(await reserveVoiceOperation(operation)).toMatchObject({ ok: false, status: 409, reason: 'duplicate' })
  })
  it('returns the authorized cached persona context from the one reservation call', async () => {
    db.rpc.mockResolvedValue({ error: null, data: { ok: true, context: { userName: 'Alex', memorySummary: 'An authored memory.' }, expires_at: expires } })
    expect(await reserveVoiceOperation(operation)).toEqual({ ok: true, reservation: {
      sessionId: 'session-a', operationId: 'turn-a', maxCostUsd: .035, expiresAt: expires,
      context: { userName: 'Alex', memorySummary: 'An authored memory.' },
    } })
    expect(db.rpc).toHaveBeenCalledOnce()
    expect(db.rpc).toHaveBeenCalledWith('voice_operation_reserve', expect.objectContaining({ p_user_id: 'user-a', p_session_id: 'session-a', p_persona_slug: 'tess', p_resources: operation.resources }))
  })
  it.each([NaN, Infinity, -1, 0, 2])('refuses invalid dollar reservations %s', async (cost) => {
    expect(await reserveVoiceOperation({ ...operation, maxCostUsd: cost })).toMatchObject({ ok: false, reason: 'invalid' })
    expect(db.rpc).not.toHaveBeenCalled()
  })
  it.each([-1, NaN, 1.5])('refuses corrupt resource reservations %s', async (value) => {
    expect(await reserveVoiceOperation({ ...operation, resources: { ttsCharacters: value } })).toMatchObject({ ok: false, reason: 'invalid' })
    expect(db.rpc).not.toHaveBeenCalled()
  })
})

describe('authoritative usage receipts', () => {
  it('keeps unknown/aborted usage reserved instead of calling it free', async () => {
    db.rpc.mockResolvedValue({ error: null, data: { ok: true, duplicate: false, cost_usd: .035 } })
    const result = await settleVoiceOperation({ ...operation, costUsd: null, status: 'aborted', metadata: { requestId: 'vendor-1' } })
    expect(result).toMatchObject({ ok: true, costUsd: .035 })
    expect(db.rpc).toHaveBeenCalledWith('voice_operation_settle', expect.objectContaining({ p_cost_usd: null, p_status: 'aborted', p_metadata: { requestId: 'vendor-1' } }))
  })
  it('preserves provider usage and exact resources for reconciliation', async () => {
    db.rpc.mockResolvedValue({ error: null, data: { ok: true, cost_usd: .001 } })
    await settleVoiceOperation({ ...operation, costUsd: .001, status: 'completed', usage: { input: 2000, cached: 1000 }, resources: { llmInputTokens: 2000, ttsCharacters: 90 } })
    expect(db.rpc).toHaveBeenCalledWith('voice_operation_settle', expect.objectContaining({ p_usage: { input: 2000, cached: 1000 }, p_resources: { llmInputTokens: 2000, ttsCharacters: 90 } }))
  })
  it('reports a failed settlement honestly; its reservation remains held', async () => {
    db.rpc.mockRejectedValue(new Error('network unavailable'))
    expect(await settleVoiceOperation({ ...operation, costUsd: .01, status: 'completed' })).toEqual({ ok: false, message: 'Usage remains reserved until reconciliation.' })
  })
  it('rejects invalid settlement numbers instead of zeroing a bill', async () => {
    expect(await settleVoiceOperation({ ...operation, costUsd: NaN, status: 'completed' })).toMatchObject({ ok: false })
    expect(db.rpc).not.toHaveBeenCalled()
  })
  it('records standalone text scoring with an idempotency key and complete receipt', async () => {
    expect(await recordStandaloneUsage({ userId: 'user-a', operationId: 'warmth-a', kind: 'warmth', provider: 'openai', model: 'gpt-4.1-mini', costUsd: .0012, usage: { input: 1000 } })).toEqual({ ok: true })
    expect(db.upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'user-a', session_id: null, cost_cents: .12, usage_key: 'standalone:warmth:warmth-a', usage_details: { kind: 'warmth', usage: { input: 1000 }, metadata: {} } }), { onConflict: 'user_id,usage_key', ignoreDuplicates: true })
  })
  it('marks a standalone missing-usage estimate as a reservation in the ledger source', async () => {
    await recordStandaloneUsage({ userId: 'user-a', operationId: 'grade-a', kind: 'grade', provider: 'openai', model: 'gpt-4.1', costUsd: .03, metadata: { measurement: 'reserved' } })
    expect(db.upsert).toHaveBeenCalledWith(expect.objectContaining({ usage_source: 'server_reservation' }), expect.anything())
  })
})

describe('lifecycle and fallback protection', () => {
  it('binds startup cleanup to the failed attempt while preserving a concurrent retry', async () => {
    db.rpc.mockResolvedValue({ error: null, data: { ok: true, refunded: false } })
    expect(await abortVoiceStartupAttempt({ userId: 'user-a', sessionId: 'session-a', operationId: 'failed-mint' })).toEqual({ ok: true, refunded: false })
    expect(db.rpc).toHaveBeenCalledWith('voice_session_abort_attempt', { p_user_id: 'user-a', p_session_id: 'session-a', p_operation_id: 'failed-mint' })
  })
  it('uses an explicit null attempt when admission failed before any operation was reserved', async () => {
    db.rpc.mockResolvedValue({ error: null, data: { ok: true, refunded: true } })
    expect(await abortVoiceStartupAttempt({ userId: 'user-a', sessionId: 'session-a', operationId: null })).toEqual({ ok: true, refunded: true })
    expect(db.rpc).toHaveBeenCalledWith('voice_session_abort_attempt', { p_user_id: 'user-a', p_session_id: 'session-a', p_operation_id: null })
  })
  it('never authorizes the legacy client-priced fallback when accounting lookup fails', async () => {
    db.rpc.mockResolvedValue({ error: { message: 'timeout' }, data: null })
    await expect(serverVoiceSessionExists({ userId: 'user-a', sessionId: 'session-a' })).rejects.toThrow('Could not verify voice session accounting.')
  })
  it('uses a bound user and persona for legacy active-session lookup', async () => {
    db.rpc.mockResolvedValue({ error: null, data: { ok: true, session_id: 'session-a', expires_at: expires, context: {} } })
    expect(await findActiveVoiceSession({ userId: 'user-a', personaSlug: 'tess' })).toEqual({ sessionId: 'session-a', expiresAt: expires, context: {} })
    expect(db.rpc).toHaveBeenCalledWith('voice_session_get', { p_user_id: 'user-a', p_session_id: null, p_persona_slug: 'tess' })
  })
  it('activates, closes, and aborts through owner-bound atomic RPCs', async () => {
    db.rpc.mockResolvedValue({ error: null, data: { ok: true, refunded: true } })
    expect(await activateVoiceSession({ userId: 'user-a', sessionId: 'session-a' })).toEqual({ ok: true })
    expect(await closeVoiceSession({ userId: 'user-a', sessionId: 'session-a' })).toEqual({ ok: true, refunded: true })
    expect(await abortVoiceSession({ userId: 'user-a', sessionId: 'session-a' })).toEqual({ ok: true, refunded: true })
    expect(db.rpc).toHaveBeenLastCalledWith('voice_session_close', { p_user_id: 'user-a', p_session_id: 'session-a', p_abort: true })
  })
  it('delegates empty-rep refunds to server evidence rather than a browser speech flag', async () => {
    db.rpc.mockResolvedValue({ error: null, data: { ok: true, refunded: false } })
    expect(await refundEmptyVoiceSession({ userId: 'user-a', sessionId: 'session-a' })).toEqual({ ok: true, refunded: false })
    expect(db.rpc).toHaveBeenCalledWith('voice_session_refund_empty', { p_user_id: 'user-a', p_session_id: 'session-a' })
  })
})
