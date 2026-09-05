/**
 * Server-owned voice accounting through real Supabase REST RPCs.
 * Run with npm run db:voice. Creates two temporary confirmed test accounts and
 * removes them in finally, including all fixture ledger rows. No provider calls,
 * customer data writes, email sends, or microphone access occur.
 */

import { loadEnvLocal } from './env'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/db/types'
import { supabaseAdmin } from '@/lib/db/admin'
import {
  openVoiceSession, reserveVoiceOperation, settleVoiceOperation, closeVoiceSession,
  activateVoiceSession, serverVoiceSessionExists, refundEmptyVoiceSession,
  abortVoiceStartupAttempt,
} from '@/lib/db/voice-session'

async function main(): Promise<void> {
  await loadEnvLocal()
  const admin = supabaseAdmin()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !publishable) throw new Error('Missing public Supabase configuration.')
  const createdUsers: string[] = []
  let userId = ''
  let checks = 0
  function check(passed: boolean, text: string) {
    if (!passed) throw new Error(text)
    checks += 1
    console.log(`pass ${text}`)
  }
  try {
    const createTestUser = async (label: string) => {
      const credentials = { email: `voice-budget-${label}-${Date.now()}@nerve.test`, password: crypto.randomUUID() }
      const { data, error } = await admin.auth.admin.createUser({ ...credentials, email_confirm: true })
      if (error || !data.user) throw Error('Could not create test account.')
      createdUsers.push(data.user.id)
      const client = createClient<Database>(url, publishable, { auth: { autoRefreshToken: false, persistSession: false } })
      const signedIn = await client.auth.signInWithPassword(credentials)
      if (signedIn.error) throw new Error('Could not sign in test account.')
      return { id: data.user.id, client }
    }
    const a = await createTestUser('a')
    const b = await createTestUser('b')
    userId = a.id
    const input = { userId, personaSlug: 'tess', provider: 'elevenlabs', model: 'eleven_v3_conversational', context: { userName: 'Test' } }
    const opened = await openVoiceSession(input)
    check(opened.ok, 'new atomic rep opens through real REST RPC')
    if (!opened.ok) throw Error(opened.message)
    const sessionId = opened.sessionId
    const resumed = await openVoiceSession(input)
    check(resumed.ok && resumed.sessionId === sessionId && resumed.resumed, 'resume returns same paid quota')
    check(await serverVoiceSessionExists({ userId, sessionId }), 'authoritative lookup verifies ownership')
    const setup = { userId, sessionId, personaSlug: 'tess', kind: 'stt' as const,
      model: 'test:no-vendor-call', maxCostUsd: .012, resources: { sttAudioMs: 240_000 } }
    check((await reserveVoiceOperation({ ...setup, operationId: 'setup-original' })).ok, 'first setup attempt reserves its own transcription allowance')
    check((await reserveVoiceOperation({ ...setup, operationId: 'setup-retry' })).ok, 'concurrent retry reserves a separate bounded allowance')
    await settleVoiceOperation({ userId, sessionId, operationId: 'setup-original', costUsd: 0, status: 'failed', resources: {}, metadata: { noVendorCalls: true } })
    check(!(await abortVoiceStartupAttempt({ userId, sessionId, operationId: 'setup-original' })).refunded, 'failed original attempt cannot abort a pending retry')
    check(!(await abortVoiceStartupAttempt({ userId, sessionId, operationId: null })).refunded, 'failed admission cannot abort another admitted attempt')
    await settleVoiceOperation({ userId, sessionId, operationId: 'setup-retry', costUsd: null, status: 'unknown', metadata: { noVendorCalls: true } })
    check(!(await abortVoiceStartupAttempt({ userId, sessionId, operationId: 'setup-original' })).refunded, 'failed original attempt cannot abort an issued retry')
    check((await activateVoiceSession({ userId, sessionId })).ok, 'connection activation persists')
    const op = { userId, sessionId, personaSlug: 'tess', operationId: 'test-turn', kind: 'turn' as const, model: 'test:no-vendor-call', maxCostUsd: .03, resources: { ttsCharacters: 300 } }
    const reserved = await reserveVoiceOperation(op)
    check(reserved.ok, 'spending reserved before generation')
    check(!(await reserveVoiceOperation(op)).ok, 'duplicate operation cannot authorize new generation')
    check((await settleVoiceOperation({ userId, sessionId, operationId: op.operationId, costUsd: .01, status: 'completed', resources: { ttsCharacters: 100 }, usage: { fixture: true }, metadata: { noVendorCalls: true } })).ok, 'server provider receipt settles over REST')
    check((await settleVoiceOperation({ userId, sessionId, operationId: op.operationId, costUsd: .01, status: 'completed' })).duplicate === true, 'receipt replay stays idempotent')
    const { data: ledger } = await admin.from('usage_ledger').select('cost_cents,usage_source,usage_details').eq('user_id', userId).eq('usage_key', `voice:${sessionId}:test-turn`)
    check(ledger?.length === 1 && ledger[0]?.cost_cents === 1 && ledger[0]?.usage_source === 'server', 'one complete authoritative receipt stored')
    check((await closeVoiceSession({ userId, sessionId })).ok, 'rep closes while grade remains allowed')
    check(!(await refundEmptyVoiceSession({ userId, sessionId })).refunded, 'client cannot refund a rep containing paid turn')
    const grade = { userId, sessionId, operationId: 'grade', kind: 'grade' as const, model: 'test:no-vendor-call', maxCostUsd: .02 }
    check((await reserveVoiceOperation(grade)).ok, 'grade reserves after live session closes')
    check((await settleVoiceOperation({ userId, sessionId, operationId: 'grade', costUsd: null, status: 'unknown', metadata: { noVendorCalls: true } })).ok, 'unreported grade stays explicitly estimated')
    const denial = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/voice_operation_reserve`, {
      method: 'POST', headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_user_id: userId, p_session_id: sessionId, p_persona_slug: 'tess', p_operation_id: 'anon', p_kind: 'tts', p_model: 'test', p_max_cost_usd: .01, p_resources: {} }),
    })
    check(denial.status === 401 || denial.status === 403, 'public REST caller cannot access paid reservation RPC')

    // These probes touch only the two disposable accounts. No authored persona,
    // library item, challenge, or customer storage object is a test target.
    const { error: privateSessionRead } = await a.client.from('voice_sessions').select('id').eq('user_id', userId)
    check(privateSessionRead?.code === '42501', 'signed-in A cannot read server-only voice session state')
    const { error: privateOperationRead } = await a.client.from('voice_operations').select('operation_id').eq('user_id', userId)
    check(privateOperationRead?.code === '42501', 'signed-in A cannot read server-only operation state')
    const { error: privateSessionInsert } = await a.client.from('voice_sessions').insert({
      id: crypto.randomUUID(), user_id: userId, persona_slug: 'tess', provider: 'elevenlabs', model: 'test',
      budget_usd: .20, grade_reserve_usd: .03, resource_limits: {}, quota_kind: 'signup',
      quota_day: new Date().toISOString().slice(0, 10), expires_at: new Date(Date.now() + 240_000).toISOString(),
      grade_expires_at: new Date(Date.now() + 840_000).toISOString(),
    })
    check(privateSessionInsert?.code === '42501', 'signed-in A cannot create a server budget')
    const { error: privateOperationInsert } = await a.client.from('voice_operations').insert({
      session_id: sessionId, operation_id: 'forged', user_id: userId, kind: 'tts', model: 'test', max_cost_usd: .01,
    })
    check(privateOperationInsert?.code === '42501', 'signed-in A cannot create a paid operation')
    const { error: privateSessionUpdate } = await a.client.from('voice_sessions').update({ budget_usd: 1 }).eq('id', sessionId)
    check(privateSessionUpdate?.code === '42501', 'signed-in A cannot raise its server budget')
    const { error: privateOperationUpdate } = await a.client.from('voice_operations').update({ cost_usd: 0 }).eq('session_id', sessionId)
    check(privateOperationUpdate?.code === '42501', 'signed-in A cannot lower a server operation charge')
    const { error: privateRpc } = await a.client.rpc('voice_operation_reserve', {
      p_user_id: userId, p_session_id: sessionId, p_persona_slug: 'tess', p_operation_id: 'forged',
      p_kind: 'tts', p_model: 'test', p_max_cost_usd: .01, p_resources: {},
    })
    check(privateRpc?.code === '42501', 'signed-in A cannot execute the private reservation RPC')
    const { error: privateSettleRpc } = await a.client.rpc('voice_operation_settle', {
      p_user_id: userId, p_session_id: sessionId, p_operation_id: 'test-turn', p_cost_usd: 0,
      p_resources: {}, p_usage: {}, p_metadata: {}, p_status: 'completed',
    })
    check(privateSettleRpc?.code === '42501', 'signed-in A cannot execute the private settlement RPC')

    const { error: transcriptFixture } = await admin.from('transcripts').insert({
      session_id: sessionId, user_id: userId,
      turns: [{ speaker: 'user', text: 'Temporary verification fixture.', t_start: 0, t_end: 1 }],
    })
    check(!transcriptFixture, 'server writes a transcript owned by temporary A')
    const ownSession = await a.client.from('sessions').select('id').eq('id', sessionId)
    check(!ownSession.error && ownSession.data?.length === 1, 'A can read its own normal session history')
    const ownTranscript = await a.client.from('transcripts').select('session_id').eq('session_id', sessionId)
    check(!ownTranscript.error && ownTranscript.data?.length === 1, 'A can read its own transcript')
    const otherSession = await b.client.from('sessions').select('id').eq('id', sessionId)
    check(!otherSession.error && otherSession.data?.length === 0, 'B cannot read A’s session')
    const otherTranscript = await b.client.from('transcripts').select('session_id').eq('session_id', sessionId)
    check(!otherTranscript.error && otherTranscript.data?.length === 0, 'B cannot read A’s transcript')
    const otherSessionUpdate = await b.client.from('sessions').update({ duration_s: 999 }, { count: 'exact' }).eq('id', sessionId)
    check(!otherSessionUpdate.error && otherSessionUpdate.count === 0, 'B cannot update A’s session')
    const otherTranscriptUpdate = await b.client.from('transcripts').update({ turns: [] }, { count: 'exact' }).eq('session_id', sessionId)
    check(!otherTranscriptUpdate.error && otherTranscriptUpdate.count === 0, 'B cannot update A’s transcript')

    const { error: ownMeterForgery } = await a.client.from('usage_ledger').insert({
      user_id: userId, session_id: sessionId, seconds: 0, provider: 'elevenlabs', model: 'test', rate: 0, cost_cents: 0,
    })
    check(ownMeterForgery?.code === '42501', 'A cannot append a client-authored ledger charge')
    const { error: bReceipt } = await admin.from('usage_ledger').insert({
      user_id: b.id, seconds: 0, provider: 'openai', model: 'test:no-vendor-call', rate: 0, cost_cents: .5,
      usage_source: 'server', usage_key: 'fixture:b', usage_details: { noVendorCalls: true },
    })
    check(!bReceipt, 'server creates B’s separate disposable ledger receipt')
    const ownReceipts = await a.client.from('usage_ledger').select('user_id')
    check(!ownReceipts.error && (ownReceipts.data?.length ?? 0) > 0 && ownReceipts.data!.every((row) => row.user_id === userId), 'A’s ledger view contains only A’s receipts')
    const bReceipts = await b.client.from('usage_ledger').select('user_id')
    check(!bReceipts.error && bReceipts.data?.length === 1 && bReceipts.data[0]?.user_id === b.id, 'B’s ledger view contains B’s receipt and none of A’s')
    const { error: changedTurnCost } = await admin.from('usage_ledger').update({ cost_cents: 0 })
      .eq('user_id', userId).eq('usage_key', `voice:${sessionId}:test-turn`)
    check(!!changedTurnCost, 'server-recorded turn charge remains append-only even to the service role')
    const { error: changedGradeReceipt } = await admin.from('usage_ledger').update({ usage_details: { changed: true } })
      .eq('user_id', userId).eq('usage_key', `voice:${sessionId}:grade`)
    check(!!changedGradeReceipt, 'server-recorded grade receipt metadata remains append-only')
    console.log(`${checks} new budget checks passed; no vendor calls made.`)
  } finally {
    const cleanupErrors: string[] = []
    for (const id of createdUsers) {
      const { error } = await admin.auth.admin.deleteUser(id)
      if (error) cleanupErrors.push(id)
    }
    if (cleanupErrors.length) throw new Error(`Test account cleanup failed for ${cleanupErrors.length} account(s).`)
    console.log('Both temporary budget test accounts deleted; no storage objects were created.')
  }
}

void main()
