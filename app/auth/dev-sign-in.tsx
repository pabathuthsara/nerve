'use client'

/**
 * The no-email door. Rendered only in development, and only when both
 * DEV_LOGIN_ variables are set — `devSignIn` enforces the same conditions
 * itself, because a control you did not draw is not a control that cannot be
 * called.
 */

import { useActionState } from 'react'
import { devSignIn, type AuthResult } from './actions'

const EMPTY: AuthResult = { ok: false, message: null }

export function DevSignIn({ email }: { email: string }) {
  const [state, action, pending] = useActionState(async () => devSignIn(), EMPTY)

  return (
    <div style={{ maxWidth: 380, marginTop: 32, paddingTop: 16, borderTop: '1px solid #ddd' }}>
      <p style={{ color: '#777', fontSize: 13, margin: '0 0 8px' }}>
        Development only — skips the email, which is rate limited to a couple an
        hour.
      </p>
      <form action={action}>
        <button type="submit" disabled={pending} style={button}>
          {pending ? 'Signing in…' : `Sign in as ${email}`}
        </button>
      </form>
      {state.message && <p style={{ color: '#a33', fontSize: 13 }}>{state.message}</p>}
    </div>
  )
}

const button: React.CSSProperties = {
  font: 'inherit',
  padding: '8px 10px',
  border: '1px solid #333',
  borderRadius: 2,
  background: '#fff',
  color: '#111',
  cursor: 'pointer',
}
