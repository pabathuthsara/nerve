'use client'

/**
 * Two steps in one component, because they share the email and re-typing it
 * on the second screen is the kind of small friction this product cannot
 * afford — the audience is people who are already reluctant to be here.
 *
 * The button states what it is doing in words.
 */

import { useActionState, useState } from 'react'
import { sendCode, verifyCode, type AuthResult } from './actions'

const EMPTY: AuthResult = { ok: false, message: null }

export function AuthForm({ linkError }: { linkError: boolean }) {
  const [email, setEmail] = useState('')
  const [sendState, send, sending] = useActionState(sendCode, EMPTY)
  const [verifyState, verify, verifying] = useActionState(verifyCode, EMPTY)

  const sent = sendState.ok

  return (
    <div style={{ maxWidth: 380 }}>
      <h1 style={{ marginTop: 0 }}>Sign in</h1>
      <p style={{ color: '#555' }}>
        No password. We email you a sign-in link, and a code if your inbox
        prefers typing.
      </p>

      {linkError && (
        <p style={{ color: '#a33' }}>
          That link has expired or was already used. Ask for a new code.
        </p>
      )}

      <form action={send} style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          style={input}
        />
        <button type="submit" disabled={sending} style={button}>
          {sending ? 'Sending…' : sent ? 'Send another code' : 'Send code'}
        </button>
      </form>

      {sendState.message && (
        <p style={{ color: sendState.ok ? '#276' : '#a33' }}>{sendState.message}</p>
      )}

      {sent && (
        <form action={verify} style={{ display: 'grid', gap: 8 }}>
          <input type="hidden" name="email" value={email} />
          <p style={{ color: '#555', margin: '4px 0 0' }}>
            Click the link in the email to sign in. If it carries a six-digit
            code instead, type it here.
          </p>
          <label htmlFor="token">Six-digit code</label>
          <input
            id="token"
            name="token"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            style={{ ...input, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.3em' }}
          />
          <button type="submit" disabled={verifying} style={button}>
            {verifying ? 'Checking…' : 'Sign in'}
          </button>
          {verifyState.message && <p style={{ color: '#a33' }}>{verifyState.message}</p>}
        </form>
      )}
    </div>
  )
}

const input: React.CSSProperties = {
  font: 'inherit',
  padding: '8px 10px',
  border: '1px solid #ccc',
  borderRadius: 2,
}

const button: React.CSSProperties = {
  font: 'inherit',
  padding: '8px 10px',
  border: '1px solid #333',
  borderRadius: 2,
  background: '#111',
  color: '#fff',
  cursor: 'pointer',
}
