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

  const supabase = await supabaseServer()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) {
    // No detail. A 401 that explains itself tells an unauthenticated caller
    // which half of the check they failed.
    return { response: NextResponse.json({ error: 'unauthorised' }, { status: 401 }) }
  }
  return { userId: data.user.id }
}
