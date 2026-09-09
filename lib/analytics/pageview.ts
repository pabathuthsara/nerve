/**
 * What a page view is allowed to become before it is stored.
 *
 * Pure functions, no database, no request object — so the rules that decide
 * what gets written can be argued with in a test rather than in production.
 * `app/api/pageview/route.ts` is the only caller and does nothing these do not
 * say it may.
 *
 * ── THE ONE RULE THAT MATTERS ────────────────────────────────────────────
 *
 * **A stored path is a route shape, never a URL somebody visited.** Share
 * links are capability URLs — `/share/<token>` is readable by anyone holding
 * the token, which is the whole design (`lib/db/share.ts`) — so a traffic
 * table that kept the raw path would be a list of live share links sitting in
 * an admin screen and in every database backup. §14 calls a leaked public
 * artefact a payment account waiting to be closed, and this is the cheapest
 * way to leak one.
 *
 * The defence is two layers, deliberately, because the second one is the one
 * that survives a route being added by somebody who never read this file:
 *
 *   1. `SHAPES` names the dynamic routes we know about, so `/roster/nadia`
 *      is stored as `/roster/[persona]` and stays legible.
 *   2. `scrubSegment` replaces anything that merely *looks* like an
 *      identifier — a UUID, a long mixed-case token, anything over 32
 *      characters — with `[id]`, whether or not a shape matched. A new
 *      `/invite/<token>` route nobody told this file about is scrubbed by
 *      length before it is stored.
 *
 * Layer 2 alone would be enough for safety and useless for reading; layer 1
 * alone would be readable and would leak the first route somebody forgot.
 */

/** The database CHECK. Repeated here so a refusal happens before the insert. */
export const MAX_PATH = 128

/** How deep a stored path goes. Below anything this product routes. */
const MAX_SEGMENTS = 6

/**
 * Agents that are not people.
 *
 * Deliberately generous — an over-eager match costs one uncounted human and an
 * under-eager one puts a headless browser in the visitor count, which is the
 * number an operator uses to decide whether the marketing block is working
 * (`MARKETING-PLAN.md`). A traffic figure that is quietly 30% preview-scrapers
 * is worse than no traffic figure.
 */
const BOTS = /bot|crawl|spider|slurp|search|fetch|monitor|scan|check|preview|render|headless|lighthouse|pagespeed|curl|wget|python-|axios|okhttp|node-fetch|postman|insomnia|scrapy|facebookexternalhit|whatsapp|telegram|discord|slack|linkedin|embedly/i

/** Phones and tablets, for the one split worth having on the overview. */
const MOBILE = /iphone|ipod|android|ipad|mobile|silk|kindle|opera mini|windows phone/i

export type Device = 'mobile' | 'desktop' | 'other'

/**
 * The dynamic routes, longest first.
 *
 * `*` matches exactly one segment and is replaced by the label beside it.
 * Anything not listed falls through to `scrubSegment` alone.
 */
const SHAPES: ReadonlyArray<{ match: readonly string[]; as: readonly string[] }> = [
  { match: ['interview', 'rep', '*', '*'], as: ['interview', 'rep', '[interviewer]', '$3'] },
  { match: ['rep', '*', '*'], as: ['rep', '[persona]', '$2'] },
  { match: ['progress', 'week', '*'], as: ['progress', 'week', '[week]'] },
  { match: ['share', '*'], as: ['share', '[token]'] },
  { match: ['roster', '*'], as: ['roster', '[persona]'] },
  { match: ['library', '*'], as: ['library', '[card]'] },
  { match: ['session', '*'], as: ['session', '[id]'] },
  { match: ['text', '*'], as: ['text', '[persona]'] },
]

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * One segment, made safe to store.
 *
 * The length-and-mixture test is the backstop described above. Sixteen
 * characters carrying both a letter and a digit is not a route name anybody
 * writes by hand; it is a token. `brief`, `live`, `subscription`,
 * `deep-technical` and every persona slug pass it untouched.
 */
export function scrubSegment(segment: string): string {
  if (segment.length === 0) return segment
  if (segment.length > 32) return '[id]'
  if (UUID.test(segment)) return '[id]'
  const mixed = /[a-z]/i.test(segment) && /[0-9]/.test(segment)
  if (segment.length >= 16 && mixed) return '[id]'
  return segment
}

/**
 * A path from the browser, turned into the shape that is stored.
 *
 * Returns null when there is nothing worth storing — which is a refusal, not a
 * fallback bucket. A path this cannot read is a path somebody is probing with,
 * and counting it would put whatever they sent into the admin table.
 */
export function normalisePath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  // A full URL is accepted and reduced; the client sends a path, but a beacon
  // endpoint takes what it is given rather than what it was promised.
  let value = raw.trim()
  if (value.length === 0 || value.length > 2048) return null
  const cut = value.search(/[?#]/)
  if (cut >= 0) value = value.slice(0, cut)
  if (!value.startsWith('/')) return null
  value = value.toLowerCase()
  if (value !== '/' && value.endsWith('/')) value = value.replace(/\/+$/, '')
  if (value === '') value = '/'
  if (value === '/') return '/'

  const segments = value.split('/').slice(1)
  if (segments.some((segment) => segment.length === 0)) return null
  // Path traversal, encoded bytes, anything that is not a route name. Refused
  // rather than repaired: the repaired version is not a page anybody loaded.
  if (segments.some((segment) => !/^[a-z0-9._~-]+$/.test(segment))) return null
  // `.` and `..` pass the character class above and are traversal, not routes.
  if (segments.some((segment) => segment.startsWith('.'))) return null

  const scrubbed = segments.slice(0, MAX_SEGMENTS).map(scrubSegment)

  for (const shape of SHAPES) {
    if (shape.match.length !== scrubbed.length) continue
    const hit = shape.match.every((part, index) => part === '*' || part === scrubbed[index])
    if (!hit) continue
    const out = shape.as.map((part) =>
      part.startsWith('$') ? scrubbed[Number(part.slice(1))] ?? '[id]' : part,
    )
    return truncate(`/${out.join('/')}`)
  }

  return truncate(`/${scrubbed.join('/')}`)
}

function truncate(path: string): string {
  return path.length <= MAX_PATH ? path : path.slice(0, MAX_PATH)
}

/**
 * Where they came from — the host, and only the host.
 *
 * A full referrer carries the search query somebody typed and, from another
 * site, a path that may itself be private. The host answers the only question
 * the panel asks ("is the Reddit post working?") and carries none of that.
 *
 * Our own host is dropped rather than stored as a referrer: an internal
 * navigation is not an arrival, and counting it would make `direct` look like
 * a rounding error next to `hellonerve.com`.
 */
export function referrerHost(raw: unknown, selfHost?: string | null): string | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return null
  let host: string
  try {
    host = new URL(raw).hostname.toLowerCase()
  } catch {
    return null
  }
  if (!host || host.length > 128) return null
  const self = (selfHost ?? '').toLowerCase().replace(/^www\./, '')
  if (self && host.replace(/^www\./, '') === self) return null
  return host
}

export function deviceFor(userAgent: string | null | undefined): Device {
  if (!userAgent) return 'other'
  if (MOBILE.test(userAgent)) return 'mobile'
  // Anything claiming a real engine and not claiming a phone. A UA string with
  // neither is 'other' rather than 'desktop', because guessing desktop is how
  // an unidentified script becomes a person in the split.
  if (/mozilla|webkit|gecko|trident/i.test(userAgent)) return 'desktop'
  return 'other'
}

export function isBot(userAgent: string | null | undefined): boolean {
  if (!userAgent || userAgent.length < 8) return true
  return BOTS.test(userAgent)
}

/**
 * A two-letter country code, or null.
 *
 * Vercel puts one on every request. `XX` is what it sends when it does not
 * know, and storing that as a country would put a fake nation on the panel.
 */
export function countryCode(raw: string | null | undefined): string | null {
  if (!raw) return null
  const code = raw.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(code) || code === 'XX') return null
  return code
}
