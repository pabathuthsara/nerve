import 'server-only'

/**
 * The gate on every route that spends money.
 *
 * Six route handlers shipped without one. `/api/grade` and `/api/warmth/score`
 * each call a text model on request; `/api/voice/llm` and `/api/voice/tts`
 * proxy a standing vendor key; `/api/voice/token` mints Realtime credentials.
 * That last one is the worst of them — anyone who found the URL could mint a
 * session against our account and talk to it for eight minutes.
 *
 * Every one of these is called from `/rep`, which already redirects an
 * anonymous visitor to `/auth`. The routes were simply never told, so the
 * protection lived entirely in the fact that nobody had guessed the path.
 *
 * `getUser()` rather than `getSession()`, deliberately and at the cost of a
 * round trip to the auth server: `getSession()` reads the cookie without
 * contacting anyone and will happily return a user whose session has been
 * revoked. On a route whose whole job is to decide whether to spend money,
 * that is the wrong trade — the same reasoning `lib/db/server.ts` records for
 * `currentUser()`.
 */

import { NextResponse } from 'next/server'
import { supabaseServer } from './server'

export interface AuthorisedCaller {
  userId: string
}

/**
 * A machine caller, for harnesses that have no session to present.
 *
 * Off unless `INTERNAL_API_SECRET` is set on the server, so this cannot be
 * switched on by anything a request carries — an unset variable means the door
 * does not exist rather than that it stands open. Used by the opt-in scorer
 * calibration suite (`lib/warmth/calibration/`), which drives
 * `/api/warmth/score` over HTTP against a running server precisely so it
 * measures the deployed route rather than a re-implementation of it.
 *
 * Do not set it in production.
 */
function isInternalCaller(request: Request): boolean {
  const secret = process.env.INTERNAL_API_SECRET
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

/**
 * The signed-in user, or a 401 to return as-is.
 *
 * Returns a union rather than throwing, so a handler cannot forget to stop:
 * `if ('response' in auth) return auth.response` reads as a guard and fails
 * to compile if the caller tries to use `userId` without narrowing first.
 */
export async function requireUser(
  request: Request,
): Promise<AuthorisedCaller | { response: Response }> {
  if (isInternalCaller(request)) return { userId: 'internal' }

  const key = sessionKey(request)
  const hit = key === null ? null : recentlyVerified(key)
  if (hit !== null) return { userId: hit }

  const supabase = await supabaseServer()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) {
    // No detail. A 401 that explains itself tells an unauthenticated caller
    // which half of the check they failed.
    return { response: NextResponse.json({ error: 'unauthorised' }, { status: 401 }) }
  }
  if (key !== null) remember(key, data.user.id)
  return { userId: data.user.id }
}

/* ------------------------------------------------------------------ *
 * The verification cache
 * ------------------------------------------------------------------ */

/**
 * How long a successful verification stands before it is checked again.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 *
 * `getUser()` contacts the auth server on purpose — `getSession()` reads the
 * cookie without asking anyone and will happily return a user whose session has
 * been revoked, and on a route that decides whether to spend money that is the
 * wrong trade. That reasoning is unchanged and this does not weaken it.
 *
 * What it fixes is how OFTEN. Measured over 487 production turns on
 * 10 September 2026: `authMs` p50 **269ms**, because the functions run in
 * `sin1` and the auth server is in `us-east-1` — every check crosses the
 * Pacific. A three-minute rep is about fifteen turns, so a rep spent roughly
 * **four seconds** re-establishing, fifteen times, that the session which was
 * valid twelve seconds ago is still valid.
 *
 * That is not merely slow, it is the character. `lib/warmth/timing.ts` is built
 * on Stivers et al. (2009): the universal modal turn gap is ~200ms and anything
 * past ~700ms is decoded cross-culturally as a DISPREFERRED response. Her
 * measured median gap was 3.40s and `remainingResponseDelayMs` returned zero on
 * essentially every turn, so the fifth layer of the character did not exist in
 * production and every persona at every warmth sounded equally reluctant.
 *
 * ── WHAT IT COSTS ────────────────────────────────────────────────────────
 *
 * A revoked session stays usable for at most one minute, on the routes that
 * already fail OPEN when the allowance database is unreachable, and behind a
 * rep quota that was checked at `/api/voice/token` when the session opened.
 * Sixty seconds is three checks per rep instead of fifteen.
 *
 * Positive results only. A failure is never cached, so a 401 is always a fresh
 * answer and an attacker cannot pin one.
 */
const VERIFIED_TTL_MS = 60_000

/** Bounded, so a busy instance cannot grow this without limit. */
const VERIFIED_MAX = 500

const verified = new Map<string, { userId: string; at: number }>()

/**
 * The session cookies, verbatim, as the cache key.
 *
 * The WHOLE value and not a hash of it: a hash collision here would hand one
 * user another user's id, and no amount of unlikeliness makes that an
 * acceptable failure mode for a cache that exists to save 269 milliseconds. The
 * string is already in memory as a request header.
 *
 * Null when the request carries no Supabase cookie at all, which is the
 * anonymous case — there is nothing to remember and `getUser()` will refuse.
 */
function sessionKey(request: Request): string | null {
  const cookie = request.headers.get('cookie')
  if (!cookie) return null
  const parts = cookie
    .split(';')
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith('sb-'))
  return parts.length > 0 ? parts.sort().join(';') : null
}

function recentlyVerified(key: string): string | null {
  const entry = verified.get(key)
  if (!entry) return null
  if (Date.now() - entry.at > VERIFIED_TTL_MS) {
    verified.delete(key)
    return null
  }
  return entry.userId
}

function remember(key: string, userId: string): void {
  // Oldest first, because `Map` preserves insertion order and an entry is only
  // ever inserted after a real verification.
  if (verified.size >= VERIFIED_MAX) {
    const oldest = verified.keys().next()
    if (!oldest.done) verified.delete(oldest.value)
  }
  verified.set(key, { userId, at: Date.now() })
}

/** Exported for the tests, which must not inherit another test's cache. */
export function __resetAuthCache(): void {
  verified.clear()
}
