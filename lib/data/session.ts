'use client'

/**
 * Who is signed in, asked once instead of once per read.
 *
 * `supabase.auth.getUser()` is a network round-trip. It is not a local token
 * decode — it posts the access token to `/auth/v1/user` so the server can say
 * whether it is still valid, which is exactly what you want before trusting an
 * id, and exactly what you do not want six times on one screen.
 *
 * That is what it was doing. Every read in `queries.ts` opened with its own
 * `getUser()`, so a single screen fired four of them concurrently and every
 * navigation repeated the set. The reads themselves are cheap; the identity
 * lookup in front of each one was not.
 *
 * The promise is memoised per browser client, so concurrent callers share one
 * request and later callers get the resolved value. It is dropped whenever the
 * identity actually changes — sign-in, sign-out, a user update — so this is a
 * cache of "who", never a cache of "still allowed": the access token itself is
 * re-validated by PostgREST on every query, and RLS is what authorises the row.
 */

import type { User } from '@supabase/supabase-js'
import { supabaseBrowser } from '@/lib/db/client'

/**
 * What the last lookup actually established.
 *
 * `signed-out` means the auth server answered and there is no session.
 * `unavailable` means we could not ask — offline, DNS, a 500. The difference
 * matters to the caller: one of them should send somebody to the login screen
 * and the other absolutely should not.
 */
export type SessionStatus = 'unknown' | 'signed-in' | 'signed-out' | 'unavailable'

let pending: Promise<User | null> | null = null
let status: SessionStatus = 'unknown'
let watching = false

/** Drop the memo when the identity changes, and only then. */
function watch(): void {
  if (watching) return
  watching = true
  supabaseBrowser().auth.onAuthStateChange((event) => {
    // INITIAL_SESSION fires on subscribe and describes the state we are already
    // reading; clearing on it would throw away the in-flight lookup that just
    // started. TOKEN_REFRESHED keeps the same user, so it is not an identity
    // change either — and re-asking on every refresh would put the round-trip
    // back on a timer.
    if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') return
    pending = null
    status = 'unknown'
  })
}

/**
 * The signed-in user, or null.
 *
 * Never throws: a read that cannot establish who is asking returns null and
 * records why in `sessionStatus()`. Callers already treat null as "no rows for
 * me", and the ones that need to tell the two cases apart can ask.
 */
export function currentUser(): Promise<User | null> {
  watch()
  if (!pending) {
    pending = supabaseBrowser()
      .auth.getUser()
      .then(({ data, error }) => {
        // An error here is the auth server answering "that is not a session" —
        // a missing, expired or revoked token. That is signed out, not broken.
        if (error) {
          status = 'signed-out'
          return null
        }
        status = data.user ? 'signed-in' : 'signed-out'
        return data.user ?? null
      })
      .catch(() => {
        // We never reached it. Do not remember this: the next read should try
        // again rather than inherit a verdict we were not able to reach.
        status = 'unavailable'
        pending = null
        return null
      })
  }
  return pending
}

/** What the most recent lookup established. See `SessionStatus`. */
export function sessionStatus(): SessionStatus {
  return status
}

/** Testing seam, and the sign-out path. */
export function forgetCurrentUser(): void {
  pending = null
  status = 'unknown'
}
