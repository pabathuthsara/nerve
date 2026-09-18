/**
 * The OAuth code exchange, and the funnel's second crossing.
 *
 * This route existed for months with nothing pointing at it, so that turning
 * Google on (§04) would be a dashboard change plus one button. That was true
 * of the exchange and not of the three lines around it, all of which only
 * become reachable the moment a provider is enabled:
 *
 *   1. `next` was taken from the query and concatenated. `?next=//evil.com`
 *      builds `https://www.hellonerve.com//evil.com`, which a browser reads as
 *      protocol-relative and follows to another host. An open redirect on the
 *      one route whose whole job is to be arrived at from somewhere else.
 *   2. The redirect is built from THIS request rather than from `SITE_ORIGIN`.
 *      That looks like a rule 15 violation and is the opposite of one: the
 *      session cookies were just written onto this response, for this host, so
 *      sending the browser to a different host lands it signed out. The apex
 *      308s to `www` in the edge before any of this runs, so in production the
 *      host here is already canonical — and on localhost and on a preview
 *      deployment it is the only correct answer.
 *   3. A `/start` run that signed up with Google arrives here with its answers
 *      in a cookie and nothing else to read them.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { supabaseServer } from '@/lib/db/server'
import { crossOAuthAccount } from '@/lib/db/start-crossing'
import { START_COOKIE, decodeStartAnswers, hasStartAnswers } from '@/lib/data/start-funnel'
import { safeNextPath } from '@/lib/site/next-path'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeNextPath(searchParams.get('next'))

  const fail = NextResponse.redirect(new URL('/auth?error=oauth', request.url))
  if (!code) return fail

  const supabase = await supabaseServer()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) return fail

  /**
   * The crossing, before the redirect rather than after it.
   *
   * `/` is where `next` points and `/` is the router: it reads
   * `age_confirmed_at`, `active_track` and the onboarding flags to decide
   * where this account belongs. Writing the answers afterwards would be a
   * race against that read, and losing it means an interview sign-up landing
   * on the dating home — `INTERVIEW-PLAN.md` E2, arriving through a new door.
   */
  const carried = request.cookies.get(START_COOKIE)?.value
  if (carried && data.user) {
    const answers = decodeStartAnswers(carried)
    if (hasStartAnswers(answers)) await crossOAuthAccount(data.user.id, answers)
  }

  const response = NextResponse.redirect(new URL(next, request.url))
  // Read once. It describes a crossing that has now happened, and leaving it
  // on the browser is an answer waiting to be applied to a second account.
  if (carried) response.cookies.delete(START_COOKIE)
  return response
}
