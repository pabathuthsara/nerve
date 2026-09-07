/**
 * Reading a token-mint refusal, for both adapters.
 *
 * ── RULE 1's CAUTIONARY TALE, APPLIED BEFORE IT HAPPENS ──────────────────
 *
 * `lib/voice/audibility.ts` was written provider-neutral, wired into one
 * adapter, and four days later that adapter stopped shipping. This is the same
 * shape of fact — *what did the server say when it said no* — and both arms
 * mint through the same route, so it is one function that both call rather than
 * two that will drift.
 *
 * ── WHAT IT SEPARATES ────────────────────────────────────────────────────
 *
 * A REFUSAL is a decision the user can act on: no interview credits, the daily
 * rep quota spent, the spend ceiling reached. `/api/voice/token` answers those
 * with 402/403/429 and a body carrying a sentence written for a person.
 *
 * Everything else is a failure: a 500, a vendor timeout, a socket that never
 * opened. Those are worth retrying and a refusal is not, which is exactly the
 * distinction the UI was missing when a 402 came out as "Connection lost" with
 * a Retry button that could never succeed.
 */

import { VoiceError, type ProviderId } from './types'

/** Statuses the token route uses to say no on purpose. */
const REFUSAL_STATUSES = new Set([401, 402, 403, 429])

/**
 * The error to throw for a non-OK mint response.
 *
 * The body is read once — the caller must not have consumed it — and its
 * `error` string is preferred over anything invented here, because the route is
 * the only thing that knows whether this was credits, quota or the ceiling.
 */
export async function mintRefusal(
  response: Response,
  provider: ProviderId,
): Promise<VoiceError> {
  let message = ''
  let refusal: string | null = null
  try {
    const body = (await response.json()) as { error?: unknown; refusal?: unknown }
    if (typeof body.error === 'string') message = body.error
    if (typeof body.refusal === 'string') refusal = body.refusal
  } catch {
    // A refusal with an unreadable body is still a refusal if the status says
    // so. Falling back to a generic sentence beats reporting a network fault.
  }
  const refused = REFUSAL_STATUSES.has(response.status) || refusal !== null
  if (refused) {
    return new VoiceError(
      'refused',
      provider,
      message || 'This rep cannot start right now.',
    )
  }
  return new VoiceError(
    'token_mint_failed',
    provider,
    `Token mint failed (${response.status}).${message ? ` ${message.slice(0, 300)}` : ''}`,
  )
}
