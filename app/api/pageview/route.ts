/**
 * The page-view beacon.
 *
 * One `POST` per screen from `components/analytics.tsx`, answered with 204 and
 * nothing else. It writes the row the admin panel counts (`page_views`).
 *
 * ── WHY THIS EXISTS WHEN POSTHOG IS ALREADY IN THE TREE ──────────────────
 *
 * PostHog is installed and unkeyed (`LAUNCH-GAP.md` B7), and even keyed it puts
 * the traffic number in a vendor's dashboard rather than beside the accounts it
 * turned into. `/admin` has to answer "did anybody come, and did they sign up"
 * on one screen, from data this product owns. That is a different job from the
 * funnel events, so it is a different pipe, and neither one blocks the other.
 *
 * ── WHAT IT COLLECTS, WHICH IS DELIBERATELY LESS THAN IT COULD ───────────
 *
 * No cookie is set and no identifier is returned to the browser. `visitor` is
 * `sha256(salt | UTC day | ip | user agent)` truncated to 32 hex characters,
 * computed here and never stored in any other form. It groups one person's
 * views within one day and is useless across two, because the day is inside the
 * digest. That is worse than a real analytics identity on purpose: privacy
 * clause 07 promises no tracking cookie and no consent banner, and a counter
 * that needed either would be a change to what we told people rather than a
 * feature.
 *
 * The IP address itself is never written. Vercel's own edge logs hold one for
 * security and debugging, which privacy clause 01 already discloses; this adds
 * nothing to that.
 *
 * ── IT SPENDS NO MONEY, SO IT DOES NOT GO THROUGH maySpend ───────────────
 *
 * Rule 11 puts every route that spends money behind `maySpend`. This one calls
 * no vendor and reserves nothing — the ceiling it needs is on *rows*, not on
 * cents, so it carries its own. `maySpend` would also mean a database round
 * trip per page view to protect a database write, which is a worse trade than
 * the in-memory limiter below.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createHash } from 'node:crypto'
import { supabaseAdmin } from '@/lib/db/admin'
import { secretSupabaseKey } from '@/lib/db/env'
import { currentUser } from '@/lib/db/server'
import { countryCode, deviceFor, isBot, normalisePath, referrerHost } from '@/lib/analytics/pageview'

export const dynamic = 'force-dynamic'

/** The most one visitor may write in one window, and how long that window is. */
const BURST = 80
const WINDOW_MS = 10 * 60 * 1000

/** How many visitors the limiter remembers before it starts forgetting. */
const TRACKED = 5_000

/**
 * The limiter, in memory rather than in `rate_limits`.
 *
 * Per-instance and therefore approximate: Fluid Compute reuses instances, so a
 * flood from one address mostly meets the same counter, and a flood spread
 * across instances gets a multiple of `BURST` instead of `BURST`. That is the
 * right accuracy for this. The thing being protected is a row count in a table
 * nobody bills us for, and paying a database round trip per page view to
 * protect a database write would cost more than the abuse does.
 *
 * Anything that actually matters — money, quota, a live rep — uses
 * `lib/db/spend.ts`, which is durable and shared, and none of that is here.
 */
const seen = new Map<string, { count: number; until: number }>()

function withinBurst(visitor: string, now: number): boolean {
  const entry = seen.get(visitor)
  if (!entry || entry.until <= now) {
    // Bounded, or a long-running instance grows a map for every visitor it has
    // ever answered. Cleared wholesale rather than swept: the entries are ten
    // minutes long and rebuilding them costs one miss each.
    if (seen.size >= TRACKED) seen.clear()
    seen.set(visitor, { count: 1, until: now + WINDOW_MS })
    return true
  }
  entry.count += 1
  return entry.count <= BURST
}

/**
 * The salt behind the visitor digest.
 *
 * `ANALYTICS_SALT` when it is set, so it can be rotated without touching
 * anything else; the Supabase secret otherwise, so this works on a deployment
 * nobody has configured for it. Either way it is server-only and never leaves
 * this process — a digest whose salt is public is a lookup table.
 */
function salt(): string {
  return process.env.ANALYTICS_SALT ?? secretSupabaseKey()
}

function visitorDigest(request: NextRequest, userAgent: string): string {
  // `x-forwarded-for` is a list; the client is the first entry. Vercel sets
  // `x-real-ip` too, which is already just the client.
  const ip =
    request.headers.get('x-real-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? 'unknown'
  const day = new Date().toISOString().slice(0, 10)
  return createHash('sha256')
    .update(`${salt()}|${day}|${ip}|${userAgent}`, 'utf8')
    .digest('hex')
    .slice(0, 32)
}

/**
 * Always 204, whatever happened.
 *
 * The browser has nothing to do with the answer and an error body would only
 * tell somebody probing this endpoint which of their guesses was closest. The
 * same reasoning `lib/db/admin-gate.ts` gives for answering a non-admin with
 * `notFound()` rather than a 403.
 */
function done(): NextResponse {
  return new NextResponse(null, { status: 204 })
}

export async function POST(request: NextRequest) {
  const userAgent = request.headers.get('user-agent') ?? ''

  // Do Not Track is honoured. It costs a handful of counted visits and it is
  // the one privacy signal a browser sends that we are in a position to obey.
  if (request.headers.get('dnt') === '1') return done()
  if (isBot(userAgent)) return done()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return done()
  }
  if (!body || typeof body !== 'object') return done()

  const { path: rawPath, ref } = body as { path?: unknown; ref?: unknown }
  const path = normalisePath(rawPath)
  if (!path) return done()

  const visitor = visitorDigest(request, userAgent)
  if (!withinBurst(visitor, Date.now())) return done()

  /**
   * Who it was, when they are signed in.
   *
   * Best-effort and never blocking: a signed-out visitor is the common case and
   * the column is nullable. It is what lets the panel say how much of the
   * traffic is customers using the product rather than strangers reading the
   * landing page.
   */
  let userId: string | null = null
  try {
    userId = (await currentUser())?.id ?? null
  } catch {
    userId = null
  }

  try {
    await supabaseAdmin().from('page_views').insert({
      path,
      referrer_host: referrerHost(ref, request.nextUrl.hostname),
      visitor,
      user_id: userId,
      country: countryCode(request.headers.get('x-vercel-ip-country')),
      device: deviceFor(userAgent),
    })
  } catch {
    // A traffic counter must never be the reason a page reports an error.
  }

  return done()
}
