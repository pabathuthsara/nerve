import 'server-only'

/**
 * Who may open the admin surfaces.
 *
 * An allowlist of email addresses in the environment, not a second password
 * and not a column. Three reasons, in order of how much they matter:
 *
 *   1. **A second password is a second thing to steal.** These people already
 *      authenticate — the session cookie says who they are. Minting a separate
 *      admin credential adds an attack surface and buys nothing that the
 *      session did not already prove.
 *   2. **It needs no database.** Same argument `NERVE_SPEND_HALT` makes for
 *      itself: revoking admin access has to work when the database is the
 *      thing that has gone wrong, and it has to be a dashboard toggle rather
 *      than a migration.
 *   3. **A column would be a user-writable admin flag** unless it were locked
 *      behind the service role, and rule 9 already says anything worth
 *      escalating to has no user write path. An env var has no write path at
 *      all.
 *
 * Checked on the server, every request. Never shipped to the browser — there
 * is no `NEXT_PUBLIC_` here on purpose, because an allowlist in the bundle is
 * a list of the accounts worth phishing.
 */

import { currentUser } from './server'

function allowlist(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
}

/** Whether this address is on the list. Exported for the tests. */
export function isAdminEmail(email: string | null | undefined, list: string[]): boolean {
  if (!email) return false
  // An empty allowlist grants nobody. The failure mode of the other reading —
  // "unset means everyone" — is an open admin panel on a fresh deploy.
  if (list.length === 0) return false
  return list.includes(email.trim().toLowerCase())
}

/**
 * The signed-in user, if they are an admin, and null otherwise.
 *
 * Callers turn null into `notFound()` rather than into a 403. A 403 confirms
 * the route exists and that the person asking is merely not on the list, which
 * is a free answer to anybody probing for the admin surface.
 *
 * What that buys, precisely: the response to `/admin/personas` from a
 * non-admin is byte-identical to the response from a URL nobody ever routed.
 * Verified by hand against a made-up path. It is NOT a 404 status — this app
 * streams its RSC pages, so headers are committed before `notFound()` is
 * reached and every not-found page answers 200. That is true app-wide rather
 * than here, so it distinguishes nothing; the concealment is the identical
 * body, not the code.
 */
export async function adminUser() {
  const user = await currentUser()
  if (!user) return null
  return isAdminEmail(user.email, allowlist()) ? user : null
}
