/**
 * The one address this product is served from.
 *
 * Three files used to answer this question and all three answered it
 * differently: `app/layout.tsx` fell back to `http://localhost:3000`,
 * `app/robots.ts` and `app/sitemap.ts` each hardcoded the Vercel domain. The
 * layout's fallback is the expensive one, because `metadataBase` is what
 * resolves the relative `/og.png` in the OpenGraph and Twitter blocks — so a
 * deployment missing `NEXT_PUBLIC_APP_URL` published link previews pointing at
 * `http://localhost:3000/og.png`. Every card on Slack, iMessage, WhatsApp, X
 * and LinkedIn renders blank, the app itself looks completely fine, and the
 * first person to find out is whoever shares the product.
 *
 * So: one function, one order of preference, and localhost only ever in
 * development.
 *
 * 1. `NEXT_PUBLIC_APP_URL` — the explicit answer, and the only one that
 *    survives a custom domain. Set it and nothing below matters.
 * 2. `VERCEL_PROJECT_PRODUCTION_URL` — the project's stable production domain,
 *    which Vercel sets on every deployment including previews. Preferred over
 *    the per-deployment URL because a canonical tag and an OG image should
 *    point at the address that outlives the deploy.
 * 3. `VERCEL_URL` — the per-deployment address. The last resort that is still
 *    a real, reachable origin.
 * 4. Development only: localhost on whatever port is in use.
 * 5. Production with none of the above: the known production domain, never
 *    localhost. A wrong-but-reachable origin degrades to a redirect; localhost
 *    degrades to a broken image on somebody else's screen.
 */

/**
 * The production domain, used only when nothing in the environment answers.
 *
 * Kept here rather than at the call sites so that moving to a custom domain is
 * one edit in one file — and so the value cannot drift between the sitemap and
 * the OpenGraph tags the way it already had.
 *
 * Moved from the Vercel-generated domain to `hellonerve.com` on 2 September,
 * when the site became something to market. The generated domain still
 * resolves, so nothing was broken — but a canonical tag, a sitemap entry and
 * an OpenGraph image URL are all things other people see and cache, and every
 * one of them should name the address the product is actually sold from.
 */
const PRODUCTION_FALLBACK = 'https://hellonerve.com'

/** Strip a trailing slash so callers can concatenate paths without doubling it. */
function normalise(origin: string): string {
  return origin.replace(/\/+$/, '')
}

/** Vercel sets these bare, without a scheme. */
function withScheme(host: string): string {
  return /^https?:\/\//.test(host) ? host : `https://${host}`
}

export function siteOrigin(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.NEXT_PUBLIC_APP_URL?.trim()
  if (explicit) return normalise(withScheme(explicit))

  const production = env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  if (production) return normalise(withScheme(production))

  const deployment = env.VERCEL_URL?.trim()
  if (deployment) return normalise(withScheme(deployment))

  if (env.NODE_ENV !== 'production') return `http://localhost:${env.PORT?.trim() || '3000'}`

  return PRODUCTION_FALLBACK
}

/**
 * The origin, resolved once at module load.
 *
 * Everything that reads it — `metadataBase`, `robots.txt`, `sitemap.xml` — runs
 * on the server, where the whole environment is present. Resolving eagerly
 * means the value is identical across all three rather than depending on when
 * each one happened to ask.
 */
export const SITE_ORIGIN = siteOrigin()

/** An absolute URL for a site-relative path. */
export function siteUrl(path = '/'): string {
  return `${SITE_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`
}
