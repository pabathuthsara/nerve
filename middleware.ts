/**
 * Refreshes the auth cookie on every request.
 *
 * Server Components cannot write cookies, so without this the access token
 * expires and every RSC read starts returning null for a user who is, as far
 * as they are concerned, still signed in.
 *
 * The response object here is load-bearing: `supabase.auth.getUser()` may set
 * refreshed cookies on it, so it must be the response that is returned. A new
 * NextResponse constructed after this call drops the refresh on the floor.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { ROUTE_AUTH_PATHS } from '@/lib/db/auth-paths'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })
  // Exact routes only. Their requireUser() performs the same live getUser()
  // verification and cookie refresh; doing both adds a remote auth round trip.
  if (ROUTE_AUTH_PATHS.has(request.nextUrl.pathname)) return response

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return response

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of list) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  await supabase.auth.getUser()
  return response
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image optimisation. The live-session
     * routes under /api/voice are deliberately included — a rep that outlives
     * its access token should fail at connect, not halfway through.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)',
  ],
}
