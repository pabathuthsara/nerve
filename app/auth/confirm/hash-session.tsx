'use client'

/**
 * The third shape a sign-in link can arrive in, and the only one the server
 * cannot see.
 *
 * Supabase's default Magic Link template points at its own `/auth/v1/verify`
 * endpoint, which verifies the token and then redirects here with the session
 * in the URL **fragment**:
 *
 *   /auth/confirm#access_token=…&refresh_token=…&type=magiclink
 *
 * A fragment is never sent to the server. So a route handler looking for
 * `code` or `token_hash` sees an empty query string and can only conclude the
 * link was bad — which is exactly the wrong answer, and was reported as
 * "expired or already used" when nothing had expired.
 *
 * Setting the session on the browser client writes it to cookies, so the
 * server picks it up on the very next request.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/db/client'

export function HashSession({ next }: { next: string }) {
  const router = useRouter()
  const [failure, setFailure] = useState<string | null>(null)

  useEffect(() => {
    const raw = window.location.hash.slice(1)
    if (!raw) {
      setFailure('This link carried no sign-in details. Ask for a new one.')
      return
    }

    const params = new URLSearchParams(raw)
    const described = params.get('error_description')
    if (described) {
      setFailure(described)
      return
    }

    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    if (!accessToken || !refreshToken) {
      setFailure('This link carried no sign-in details. Ask for a new one.')
      return
    }

    let cancelled = false
    void supabaseBrowser()
      .auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        if (cancelled) return
        if (error) {
          setFailure(error.message)
          return
        }
        // Get the tokens out of the address bar before navigating: otherwise
        // they sit in browser history and in anything the user pastes.
        window.history.replaceState(null, '', window.location.pathname)
        router.replace(next)
        router.refresh()
      })

    return () => {
      cancelled = true
    }
  }, [next, router])

  if (failure) {
    return (
      <div style={{ maxWidth: 380 }}>
        <h1 style={{ marginTop: 0 }}>That did not work</h1>
        <p style={{ color: '#a33' }}>{failure}</p>
        <p>
          <a href="/auth">Ask for a new link</a>
        </p>
      </div>
    )
  }

  // One honest line while the cookie is written.
  return (
    <div style={{ maxWidth: 380 }}>
      <h1 style={{ marginTop: 0 }}>Signing you in</h1>
      <p style={{ color: '#555' }}>One moment.</p>
    </div>
  )
}
