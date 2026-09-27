import 'server-only'

/**
 * Writing one `page_views` row, from either of the two places that may.
 *
 * `app/api/pageview/route.ts` is the browser's beacon and was the only writer
 * until 27 September. `app/start/page.tsx` is the second: it records the
 * RENDER of `/start` as step `served`, because every beacon row is fired after
 * hydration and a visitor who left before the JavaScript arrived was never
 * counted (START-AUDIT §1.6). The two share this module so the visitor digest
 * is computed one way — a `served` row and the `hook` row the same person's
 * browser sends a second later have to land on the same `visitor`, or the
 * funnel cannot join them.
 *
 * Everything here fails silent. A traffic counter must never be the reason a
 * page reports an error.
 */

import { createHash } from 'node:crypto'
import { supabaseAdmin } from '@/lib/db/admin'
import { secretSupabaseKey } from '@/lib/db/env'
import { countryCode, deviceFor, referrerHost } from './pageview'

/** The subset of `Headers` both callers have: a route's request and `next/headers`. */
interface HeaderBag { get(name: string): string | null }

/**
 * The digest's secret. `ANALYTICS_SALT` when it is set, the service key
 * otherwise — never sent anywhere, and rotating it only means today's
 * visitors are counted twice.
 */
function salt(): string {
  return process.env.ANALYTICS_SALT ?? secretSupabaseKey()
}

/**
 * `sha256(salt | UTC day | ip | user agent)`, 32 hex characters. Groups one
 * person's views within one day and is useless across two, because the day
 * is inside the digest (privacy clause 07).
 */
export function visitorDigest(headers: HeaderBag, userAgent: string): string {
  // `x-forwarded-for` is a list; the client is the first entry. Vercel sets
  // `x-real-ip` too, which is already just the client.
  const ip =
    headers.get('x-real-ip')
    ?? headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? 'unknown'
  const day = new Date().toISOString().slice(0, 10)
  return createHash('sha256')
    .update(`${salt()}|${day}|${ip}|${userAgent}`, 'utf8')
    .digest('hex')
    .slice(0, 32)
}

export interface ViewRow {
  path: string
  step: string | null
  ref: unknown
  selfHost: string | null
  source: string | null
  content: string | null
  userId: string | null
}

export async function insertView(headers: HeaderBag, userAgent: string, visitor: string, row: ViewRow): Promise<void> {
  try {
    await supabaseAdmin().from('page_views').insert({
      path: row.path,
      referrer_host: referrerHost(row.ref, row.selfHost),
      visitor,
      user_id: row.userId,
      country: countryCode(headers.get('x-vercel-ip-country')),
      device: deviceFor(userAgent),
      step: row.step,
      source: row.source,
      content: row.content,
    })
  } catch {
    // See the header.
  }
}
