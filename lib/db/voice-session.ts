import 'server-only'

import { supabaseAdmin } from './admin'
import { pipelineTranscriptionAllowance } from '@/lib/voice/mint'
import type { Json } from './types'
import type { PersonaContext } from './persona-context'

/** Server-only controls. A browser may identify a rep, never choose its budget. */
export type VoiceOperationKind = 'turn' | 'llm' | 'tts' | 'stt' | 'warmth' | 'grade'
export type VoiceResources = Partial<Record<
  'llmInputTokens' | 'llmOutputTokens' | 'warmthInputTokens' | 'warmthOutputTokens' |
  'gradeInputTokens' | 'gradeOutputTokens' | 'ttsCharacters' | 'sttAudioMs', number
>>

export interface VoiceBudgetPolicy {
  budgetUsd: number
  gradeReserveUsd: number
  liveSeconds: number
  gradeSeconds: number
  resources: Required<VoiceResources>
}

/**
 * Deliberately roomy until full-length persona trials establish a smaller cap.
 * These are admission limits, not an assertion about a provider invoice. In
 * particular, directly minted browser STT still needs a conservative estimate.
 */
export function voiceBudgetPolicy(env: Record<string, string | undefined> = process.env): VoiceBudgetPolicy {
  const configured = Number(env.NERVE_VOICE_BUDGET_USD)
  const budgetUsd = Number.isFinite(configured) && configured >= 0.08 && configured <= 1
    ? configured : 0.20
  return {
    budgetUsd,
    gradeReserveUsd: Math.min(0.03, budgetUsd / 4),
    // The ordinary rep remains 180 s; this includes connection and closing grace.
    liveSeconds: 240,
    gradeSeconds: 600,
    resources: {
      llmInputTokens: 240_000, llmOutputTokens: 6_000,
      warmthInputTokens: 120_000, warmthOutputTokens: 6_000,
      gradeInputTokens: 24_000, gradeOutputTokens: 2_400,
      // At most two credentials: initial connection and one bounded reconnect.
      ttsCharacters: 3_200, sttAudioMs: 480_000,
    },
  }
}

export interface VoiceRefusal {
  ok: false
  status: number
  message: string
  reason: string
  refusal?: 'daily' | 'upgrade'
}

type RpcObject = { [key: string]: Json | undefined }
function object(value: Json | null): RpcObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

const UNAVAILABLE: VoiceRefusal = {
  ok: false, status: 503, reason: 'unavailable',
  message: 'We could not prepare the rep. Please try again in a moment.',
}

function refusal(value: RpcObject | null): VoiceRefusal {
  const reason = typeof value?.reason === 'string' ? value.reason : 'unavailable'
  const messages: Record<string, string> = {
    halted: 'Training is paused right now. Nothing is wrong with your account.',
    upgrade: 'Voice reps are part of Pro. Everything else on your account stays open.',
    daily: 'You are out of reps for today.',
    cap: 'You have hit today’s limit. It resets at midnight your time.',
    budget: 'This rep has reached its limit. Your progress will be saved.',
    resources: 'This rep has reached its limit. Your progress will be saved.',
    expired: 'This rep has ended. Start a new rep when you are ready.',
    closed: 'This rep has ended. Start a new rep when you are ready.',
    duplicate: 'That request has already been handled.',
    busy: 'Another reply is still being prepared.',
    missing: 'This rep is no longer available.',
    invalid: 'The rep request was not valid.',
  }
  return {
    ok: false,
    status: ['unavailable', 'halted'].includes(reason) ? 503
      : reason === 'missing' ? 404 : ['expired', 'closed', 'duplicate', 'busy'].includes(reason) ? 409
      : reason === 'invalid' ? 400 : 429,
    message: messages[reason] ?? UNAVAILABLE.message,
    reason,
    ...(reason === 'daily' || reason === 'upgrade' ? { refusal: reason } : {}),
  }
}

function halted(): boolean {
  return ['1', 'true'].includes(process.env.NERVE_SPEND_HALT?.trim().toLowerCase() ?? '')
}

function validResources(resources: VoiceResources): boolean {
  const limits = voiceBudgetPolicy().resources
  return Object.entries(resources).every(([key, value]) =>
    key in limits && Number.isSafeInteger(value) && value >= 0,
  )
}

export type OpenVoiceSessionResult = VoiceRefusal | {
  ok: true
  sessionId: string
  expiresAt: string
  context: PersonaContext
  resumed: boolean
  budgetUsd: number
}

/** Creates the real rep and consumes quota atomically; a retry adopts that rep. */
export async function openVoiceSession(input: {
  userId: string
  personaSlug: string
  provider: string
  model: string
  context: PersonaContext
}): Promise<OpenVoiceSessionResult> {
  if (halted()) return refusal({ reason: 'halted' })
  const policy = voiceBudgetPolicy()
  try {
    const { data, error } = await supabaseAdmin().rpc('voice_session_open', {
      p_user_id: input.userId, p_persona_slug: input.personaSlug,
      p_provider: input.provider, p_model: input.model,
      p_context: { ...input.context }, p_budget_usd: policy.budgetUsd,
      p_grade_reserve_usd: policy.gradeReserveUsd,
      p_live_seconds: policy.liveSeconds, p_grade_seconds: policy.gradeSeconds,
      p_resource_limits: { ...policy.resources },
    })
    const row = object(data)
    if (error || !row) return UNAVAILABLE
    if (!row.ok) return refusal(row)
    if (typeof row.session_id !== 'string' || typeof row.expires_at !== 'string') return UNAVAILABLE
    return {
      ok: true, sessionId: row.session_id, expiresAt: row.expires_at,
      context: personaContextFrom(row.context), resumed: row.resumed === true,
      budgetUsd: typeof row.budget_usd === 'number' ? row.budget_usd : policy.budgetUsd,
    }
  } catch { return UNAVAILABLE }
}

function personaContextFrom(value: Json | undefined): PersonaContext {
  const raw = object(value ?? null)
  return {
    ...(typeof raw?.memorySummary === 'string' ? { memorySummary: raw.memorySummary } : {}),
    ...(typeof raw?.userName === 'string' ? { userName: raw.userName } : {}),
  }
}

export interface VoiceReservation {
  sessionId: string
  operationId: string
  maxCostUsd: number
  context: PersonaContext
  expiresAt: string
}

/**
 * One database trip: ownership, persona, expiry, halt, cumulative budget and
 * resources. A duplicate is refused, never permission to generate a second time.
 */
export async function reserveVoiceOperation(input: {
  userId: string
  sessionId: string
  personaSlug?: string
  operationId: string
  kind: VoiceOperationKind
  model: string
  maxCostUsd: number
  resources?: VoiceResources
}): Promise<VoiceRefusal | { ok: true; reservation: VoiceReservation }> {
  if (halted()) return refusal({ reason: 'halted' })
  if (!Number.isFinite(input.maxCostUsd) || input.maxCostUsd <= 0 || input.maxCostUsd > 1 ||
      !input.operationId || input.operationId.length > 120 || !validResources(input.resources ?? {})) {
    return refusal({ reason: 'invalid' })
  }
  try {
    const { data, error } = await supabaseAdmin().rpc('voice_operation_reserve', {
      p_user_id: input.userId, p_session_id: input.sessionId,
      p_persona_slug: input.personaSlug ?? null, p_operation_id: input.operationId,
      p_kind: input.kind, p_model: input.model, p_max_cost_usd: input.maxCostUsd,
      p_resources: { ...input.resources },
    })
    const row = object(data)
    if (error || !row) return UNAVAILABLE
    if (!row.ok) return refusal(row)
    if (typeof row.expires_at !== 'string') return UNAVAILABLE
    return { ok: true, reservation: {
      sessionId: input.sessionId, operationId: input.operationId,
      maxCostUsd: input.maxCostUsd, context: personaContextFrom(row.context), expiresAt: row.expires_at,
    } }
  } catch { return UNAVAILABLE }
}

export interface UsageWriteResult { ok: boolean; message?: string; duplicate?: boolean; costUsd?: number }

/**
 * Settle from the provider response, never a browser's reported spend. Unknown
 * or aborted usage keeps the entire reservation as an explicitly estimated
 * ledger charge; a process crash leaves it held for daily-cap accounting.
 */
export async function settleVoiceOperation(input: {
  userId: string
  sessionId: string
  operationId: string
  costUsd: number | null
  resources?: VoiceResources
  usage?: Json
  metadata?: Json
  status: 'completed' | 'failed' | 'aborted' | 'unknown'
}): Promise<UsageWriteResult> {
  if ((input.costUsd !== null && (!Number.isFinite(input.costUsd) || input.costUsd < 0)) ||
      !validResources(input.resources ?? {})) return { ok: false, message: 'Invalid usage.' }
  try {
    const { data, error } = await supabaseAdmin().rpc('voice_operation_settle', {
      p_user_id: input.userId, p_session_id: input.sessionId, p_operation_id: input.operationId,
      p_cost_usd: input.costUsd, p_resources: input.resources ? { ...input.resources } : null,
      p_usage: input.usage ?? {}, p_metadata: input.metadata ?? {}, p_status: input.status,
    })
    const row = object(data)
    if (error || !row?.ok) return { ok: false, message: 'Usage remains reserved until reconciliation.' }
    return { ok: true, duplicate: row.duplicate === true,
      ...(typeof row.cost_usd === 'number' ? { costUsd: row.cost_usd } : {}) }
  } catch { return { ok: false, message: 'Usage remains reserved until reconciliation.' } }
}

/**
 * Settle the browser's transcription envelope against the rep that actually ran.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 *
 * The pipeline's transcriber is connected directly from the browser, so no
 * server route ever sees a usage receipt for it. `/api/voice/token` therefore
 * reserves a flat four minutes of continuous speech as an admission bound —
 * correct, because a reservation has to be an upper bound — and then used to
 * settle it immediately with `costUsd: null`, which
 * `voice_operation_settle` turns into the FULL reservation:
 * `coalesce(p_cost_usd, max_cost_usd)`.
 *
 * Every rep was therefore billed $0.024 for transcription the moment it was
 * minted. The rep of 6 September ran for 74 seconds and spent $0.0018 of real
 * transcription; the flat envelope was thirteen times that, and on its own it
 * was 27% of the rep's whole ledger.
 *
 * ── AND WHY IT DOES NOT ASK THE BROWSER ──────────────────────────────────
 *
 * The measured token count reaches us in `pipeline_telemetry`, and it is the
 * obvious number to bill. It is also a number the client supplies, and this
 * module's whole contract is "settle from the provider response, never a
 * browser's reported spend" — a client that under-reports would be buying free
 * work, which is exactly what rule 11 exists to prevent.
 *
 * So the prorating uses the one bound the server owns outright: the user cannot
 * have spoken for longer than his rep ran. It is still an over-estimate — he
 * was silent while she talked — but it is an honest one, it is proportional,
 * and a rep that ends at thirty seconds is no longer charged for four minutes.
 * The measured figure stays in `pipeline_telemetry` as the diagnostic that will
 * tighten this model once a billing period reconciles it.
 *
 * Never raises the charge: the envelope's own bound still caps it.
 */
export async function settleTranscriptionEnvelope(input: {
  userId: string
  sessionId: string
  /** Wall-clock seconds the rep ran. The ceiling on how long he can have spoken. */
  seconds: number
}): Promise<UsageWriteResult> {
  const allowance = pipelineTranscriptionAllowance()
  if (!allowance) return { ok: false, message: 'This transcription model has no verified rate.' }

  let operationIds: string[]
  try {
    const { data, error } = await supabaseAdmin()
      .from('voice_operations')
      .select('operation_id')
      .eq('session_id', input.sessionId)
      .eq('kind', 'stt')
      .eq('state', 'reserved')
    // Nothing outstanding is the ordinary case for a realtime rep, and for a
    // pipeline rep whose startup already settled its envelope as failed.
    if (error) return { ok: false, message: 'Usage remains reserved until reconciliation.' }
    operationIds = (data ?? []).map((row) => row.operation_id)
    if (operationIds.length === 0) return { ok: true }
  } catch {
    return { ok: false, message: 'Usage remains reserved until reconciliation.' }
  }

  const seconds = Number.isFinite(input.seconds) ? Math.max(0, input.seconds) : 0
  const audioMs = Math.min(Math.round(seconds * 1000), allowance.audioMs)
  const costUsd = Math.min(allowance.usdPerMinute * (audioMs / 60_000), allowance.maxCostUsd)

  // Normally exactly one. A retried startup resumes the same rep and mints a
  // second credential, and there is no way to tell afterwards which of them the
  // browser actually transcribed through — so both are charged the same bound
  // rather than one of them being forgiven. Over-charging a retry is the safe
  // error here for the reason the rate card records: a ceiling that trips early
  // costs a rep, one that trips late costs a bill.
  let result: UsageWriteResult = { ok: true }
  for (const operationId of operationIds) {
    const settled = await settleVoiceOperation({
      userId: input.userId,
      sessionId: input.sessionId,
      operationId,
      costUsd,
      status: 'completed',
      resources: { sttAudioMs: audioMs },
      usage: { estimatedAudioMs: audioMs },
      metadata: {
        source: 'direct-browser-stt-envelope',
        model: allowance.model,
        measurement: 'session-elapsed-bound',
        repSeconds: Math.round(seconds),
      },
    })
    if (!settled.ok) result = settled
  }
  return result
}

/** Closing does not release in-flight reservations or the protected grade. */
export async function closeVoiceSession(input: {
  userId: string; sessionId: string; abort?: boolean
}): Promise<UsageWriteResult & { refunded?: boolean }> {
  try {
    const { data, error } = await supabaseAdmin().rpc('voice_session_close', {
      p_user_id: input.userId, p_session_id: input.sessionId, p_abort: input.abort ?? false,
    })
    const row = object(data)
    if (error || !row?.ok) return { ok: false, message: 'The session could not be closed.' }
    return { ok: true, refunded: row.refunded === true }
  } catch { return { ok: false, message: 'The session could not be closed.' } }
}

export const abortVoiceSession = (input: { userId: string; sessionId: string }) =>
  closeVoiceSession({ ...input, abort: true })

/** A failed mint owns one attempt, not another tab's successfully issued token. */
export async function abortVoiceStartupAttempt(input: {
  userId: string; sessionId: string; operationId: string | null
}): Promise<UsageWriteResult & { refunded?: boolean }> {
  try {
    const { data, error } = await supabaseAdmin().rpc('voice_session_abort_attempt', {
      p_user_id: input.userId, p_session_id: input.sessionId, p_operation_id: input.operationId,
    })
    const row = object(data)
    return { ok: !error && row?.ok === true, refunded: !error && row?.refunded === true }
  } catch { return { ok: false, refunded: false } }
}

export async function refundEmptyVoiceSession(input: {
  userId: string; sessionId: string
}): Promise<UsageWriteResult & { refunded?: boolean }> {
  try {
    const { data, error } = await supabaseAdmin().rpc('voice_session_refund_empty', {
      p_user_id: input.userId, p_session_id: input.sessionId,
    })
    const row = object(data)
    return { ok: !error && row?.ok === true, refunded: !error && row?.refunded === true }
  } catch { return { ok: false, refunded: false } }
}

export async function serverVoiceSessionExists(input: {
  userId: string; sessionId: string
}): Promise<boolean> {
  const { data, error } = await supabaseAdmin().rpc('voice_session_get', {
    p_user_id: input.userId, p_session_id: input.sessionId, p_persona_slug: null,
  })
  // A database outage must never enable the old client-priced ledger fallback.
  if (error) throw new Error('Could not verify voice session accounting.')
  return object(data)?.ok === true
}

export async function findActiveVoiceSession(input: {
  userId: string; personaSlug: string
}): Promise<{ sessionId: string; expiresAt: string; context: PersonaContext } | null> {
  try {
    const { data, error } = await supabaseAdmin().rpc('voice_session_get', {
      p_user_id: input.userId, p_session_id: null, p_persona_slug: input.personaSlug,
    })
    const row = object(data)
    if (error || !row?.ok || typeof row.session_id !== 'string' || typeof row.expires_at !== 'string') return null
    return { sessionId: row.session_id, expiresAt: row.expires_at, context: personaContextFrom(row.context) }
  } catch { return null }
}

/** Mark connection success before exposing the rep; failed setup can refund once. */
export async function activateVoiceSession(input: {
  userId: string; sessionId: string
}): Promise<UsageWriteResult> {
  try {
    const { data, error } = await supabaseAdmin().rpc('voice_session_activate', {
      p_user_id: input.userId, p_session_id: input.sessionId,
    })
    return { ok: !error && object(data)?.ok === true }
  } catch { return { ok: false } }
}

/** Standalone text scoring still has no voice session, but must not lose usage. */
export async function recordStandaloneUsage(input: {
  userId: string; operationId: string; kind: string; provider: string; model: string
  costUsd: number; usage?: Json; metadata?: Json
}): Promise<UsageWriteResult> {
  if (!Number.isFinite(input.costUsd) || input.costUsd < 0 || !input.operationId ||
      input.operationId.length > 120) return { ok: false, message: 'Invalid usage.' }
  try {
    const { error } = await supabaseAdmin().from('usage_ledger').upsert({
      user_id: input.userId, session_id: null, provider: input.provider, model: input.model,
      seconds: 0, rate: 0, cost_cents: input.costUsd * 100,
      usage_key: `standalone:${input.kind}:${input.operationId}`,
      usage_source: object(input.metadata ?? null)?.measurement === 'reserved' ? 'server_reservation' : 'server',
      usage_details: { kind: input.kind, usage: input.usage ?? {}, metadata: input.metadata ?? {} },
    }, { onConflict: 'user_id,usage_key', ignoreDuplicates: true })
    return { ok: !error, ...(error ? { message: 'Usage could not be saved.' } : {}) }
  } catch { return { ok: false, message: 'Usage could not be saved.' } }
}
