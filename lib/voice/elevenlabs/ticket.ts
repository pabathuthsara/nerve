/**
 * The turn ticket: proof that a turn was admitted BEFORE it was asked for
 * (PERSONA-REALISM-REPORT L2).
 *
 * ── WHY ──────────────────────────────────────────────────────────────────
 *
 * Every turn used to pay for its own admission on the critical path: the edge
 * function in `sin1` asks Supabase in `us-east-1` whether this user may spend,
 * and the answer took 378 ms median and 955 ms at p90 — measured, before a
 * single token was generated. `PERSONA-AUDIT.md` §14.7 costed the compliant
 * fix: run `maySpend` for turn N+1 while turn N is still PLAYING, when nobody
 * is waiting on it. Rule 11 holds — every turn is still admitted by
 * `maySpend`, just earlier.
 *
 * The ticket is how the turn route knows that happened without asking the
 * database again. It is issued by `/api/voice/turn/reserve` only after a
 * reservation succeeded, and it binds the user, the rep, the operation id, the
 * persona, the reservation's cost bound and the persona context the prompt
 * needs. It is HMAC-signed with a server-only secret, so a browser can carry it
 * but cannot write one.
 *
 * ── AND WHY A SIGNATURE IS NOT THE WHOLE ANSWER ──────────────────────────
 *
 * A signed ticket can be REPLAYED. The turn route therefore also CLAIMS the
 * reservation (`claimVoiceOperation`, one conditional update) and will not send
 * a single character to synthesis until the claim lands — synthesis is 58% of a
 * turn's cost and every word she speaks. The claim runs concurrently with the
 * writer, which takes longer than the claim, so it costs the turn nothing on
 * the critical path; a replay gets a refused claim and an aborted writer.
 *
 * Pure apart from Web Crypto, which the edge runtime, the browser-free tests
 * and Node 22 all provide.
 */

import type { PersonaContext } from '@/lib/db/persona-context'

export interface TurnTicketClaims {
  /** The user the reservation belongs to. */
  userId: string
  sessionId: string
  /** The turn id the reservation was made under. */
  operationId: string
  personaSlug: string
  /** The reservation's bound, which the turn's own estimate may not exceed. */
  maxCostUsd: number
  /** The persona context the reservation returned, for the prompt. */
  context: PersonaContext
  /** Milliseconds since the epoch. */
  expiresAt: number
}

import { TICKET_TTL_MS } from './turn-protocol'

export { TICKET_TTL_MS }

const LABEL = 'nerve-turn-ticket-v1'

function secret(env: Record<string, string | undefined> = process.env): string | null {
  const value = env.TURN_TICKET_SECRET?.trim() || env.SUPABASE_SECRET_KEY?.trim()
  return value ? `${LABEL}:${value}` : null
}

async function hmac(key: string, data: string): Promise<string> {
  const encoder = new TextEncoder()
  const imported = await crypto.subtle.importKey(
    'raw', encoder.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', imported, encoder.encode(data))
  return base64url(new Uint8Array(signature))
}

function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64url(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

/** Constant-time comparison, so a forged signature cannot be found a byte at a time. */
function equal(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Whether this deployment can issue tickets at all. */
export function ticketsEnabled(env?: Record<string, string | undefined>): boolean {
  return secret(env) !== null
}

/** Null when no secret is configured, which disables pre-reservation entirely. */
export async function signTurnTicket(
  claims: TurnTicketClaims,
  env?: Record<string, string | undefined>,
): Promise<string | null> {
  const key = secret(env)
  if (!key) return null
  const body = base64url(new TextEncoder().encode(JSON.stringify(claims)))
  return `${body}.${await hmac(key, body)}`
}

/**
 * The claims, if the ticket is genuine, unexpired and for THIS turn.
 *
 * Every mismatch is the same answer — null — and the route then takes the
 * ordinary path. A ticket can only ever make a turn faster; it can never make
 * one happen that `maySpend` would have refused.
 */
export async function verifyTurnTicket(
  ticket: string,
  expected: { userId: string; sessionId: string; operationId: string; personaSlug: string },
  options: { now?: number; env?: Record<string, string | undefined> } = {},
): Promise<TurnTicketClaims | null> {
  const key = secret(options.env)
  if (!key || typeof ticket !== 'string' || ticket.length > 24_000) return null
  const [body, signature, extra] = ticket.split('.')
  if (!body || !signature || extra !== undefined) return null
  if (!equal(signature, await hmac(key, body))) return null
  let claims: TurnTicketClaims
  try {
    claims = JSON.parse(fromBase64url(body)) as TurnTicketClaims
  } catch {
    return null
  }
  if (claims.userId !== expected.userId || claims.sessionId !== expected.sessionId
    || claims.operationId !== expected.operationId || claims.personaSlug !== expected.personaSlug) return null
  if (!Number.isFinite(claims.expiresAt) || claims.expiresAt < (options.now ?? Date.now())) return null
  if (!Number.isFinite(claims.maxCostUsd) || claims.maxCostUsd <= 0) return null
  return claims
}
