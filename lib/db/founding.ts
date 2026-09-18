import 'server-only'

/**
 * How many accounts exist, for the founding allocation (S3).
 *
 * ── WHY THIS FILE EXISTS AT ALL ──────────────────────────────────────────
 *
 * `CHECKOUT_NOTE` promised founding members a price and asked nobody to act on
 * it. Giving it a cap — the first `FOUNDING_ACCOUNTS` accounts keep $19, and
 * Pro is $29 after them — is the one urgency device this product can run
 * honestly, and the audit is blunt about the condition attached: a "3 places
 * left" that nobody counts is a compliance risk on the page a merchant-of-record
 * reviewer opens. So the number on the page is this query, or there is no
 * number on the page.
 *
 * **The service role, and a count with no rows.** `profiles` grants read-own,
 * so a signed-out visitor on `/pricing` can read exactly zero of them — and
 * this must not become a policy that lets anybody enumerate the table to find
 * out. `head: true` returns the count and no data, so nothing about any account
 * leaves this function. The only thing that reaches a browser is one integer we
 * have chosen to publish.
 *
 * **Null is a real answer.** An unreachable database on a public marketing page
 * is not an error worth a 500, and `checkoutNoteFor(null)` falls back to the
 * dateless promise. The page loses a number; it never invents one.
 */

import { supabaseAdmin } from './admin'

/**
 * How long a published count may be stale.
 *
 * The number only ever grows, so a minute-old figure is never an over-promise —
 * it can say a place is left that has just gone, which is the direction that
 * costs nothing (the founding price is honoured either way) rather than the one
 * that oversells. A module-level memo rather than a Next cache tag because
 * this is read by a page render and by a preflight script, and neither should
 * have to know about the other's caching.
 */
const TTL_MS = 60_000

let cached: { at: number; accounts: number } | null = null

export async function foundingAccountsTaken(): Promise<number | null> {
  const now = Date.now()
  if (cached && now - cached.at < TTL_MS) return cached.accounts

  try {
    const { count, error } = await supabaseAdmin()
      .from('profiles')
      .select('id', { count: 'exact', head: true })
    if (error || typeof count !== 'number') return null
    cached = { at: now, accounts: count }
    return count
  } catch {
    return null
  }
}

/**
 * What the product has actually done, for the landing page (SIGNUP-FIXES §4.4a).
 *
 * The largest missing category on `/` is social proof, and the only kind this
 * product may ship is the counted kind. **Everything above about the founding
 * number applies verbatim**: the service role because `sessions` and
 * `profiles` are both read-own, `head: true` so nothing about any account
 * leaves this function, and null as a real answer that removes the line
 * rather than inventing one.
 *
 * Small numbers are not a problem to hide. At this stage honesty about being
 * early is an asset, and the alternative — a testimonial nobody gave, a
 * round number nobody counted — is rule 12 and terms clause 08 on the one
 * page §14's reviewer opens. An invented review costs more than every signup
 * it could buy.
 *
 * Both counts or neither: a "reps run" with no "people training" beside it
 * invites the reader to divide, and a half-rendered pair reads as a number
 * that failed rather than a page that is early.
 */
export interface UsageProof { reps: number; people: number }

let usage: { at: number; proof: UsageProof } | null = null

export async function usageProof(): Promise<UsageProof | null> {
  const now = Date.now()
  if (usage && now - usage.at < TTL_MS) return usage.proof

  try {
    const admin = supabaseAdmin()
    const [sessions, people] = await Promise.all([
      admin.from('sessions').select('id', { count: 'exact', head: true }),
      admin.from('profiles').select('id', { count: 'exact', head: true }),
    ])
    if (typeof sessions.count !== 'number' || typeof people.count !== 'number') return null
    if (sessions.error || people.error) return null
    const proof = { reps: sessions.count, people: people.count }
    usage = { at: now, proof }
    return proof
  } catch {
    return null
  }
}

/** Drops the memos. For the preflight, which must read the live number. */
export function forgetFoundingCount(): void {
  cached = null
  usage = null
}
