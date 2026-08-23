'use client'

/**
 * The Arena doors. Password and Google, against Supabase.
 *
 * Every form here posts to a Server Action rather than to a client-side
 * Supabase call, for one reason that matters and one that follows from it:
 * the session cookie is written by the server on the same response, so the
 * very next RSC render already knows who you are — no round trip where the
 * page is signed in and the server is not. It also keeps the browser bundle
 * free of any auth logic worth reading.
 *
 * The actions return `{ ok, message }` instead of throwing. A thrown error in
 * a Server Action arrives as an opaque digest string, which would leave these
 * forms with nothing honest to put on the screen.
 */

import Link from 'next/link'
import { Eye, EyeOff, MailCheck, ShieldAlert } from 'lucide-react'
import { useActionState, useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Hairline, Input } from '@/components/ui'
import {
  devSignIn,
  resendConfirmation,
  sendPasswordReset,
  setPassword,
  signInWithGoogle,
  signInWithPassword,
  signUpWithPassword,
  type AuthResult,
} from '@/app/auth/actions'

export type AuthRoute = '/login' | '/signup' | '/verify-email' | '/forgot-password' | '/reset-password'

const EMPTY: AuthResult = { ok: false, message: null }

export interface AuthScreenProps {
  route: AuthRoute
  query: Record<string, string | undefined>
  /** Whether a session is present — a recovery link has been exchanged. */
  recoverySession?: boolean
  /** The development door, gated in the action as well as here. */
  devLoginEmail?: string | null
}

export function AuthScreen({ route, query, recoverySession = false, devLoginEmail = null }: AuthScreenProps) {
  return <main className="auth-page"><div className="auth-panel"><Link href="/" className="wordmark auth-wordmark">NERVE</Link>{route === '/login' ? <LoginForm devLoginEmail={devLoginEmail} /> : null}{route === '/signup' ? <SignupForm /> : null}{route === '/verify-email' ? <VerifyEmail email={query.email ?? ''} /> : null}{route === '/forgot-password' ? <ForgotPassword /> : null}{route === '/reset-password' ? <ResetPassword ready={recoverySession} /> : null}</div></main>
}

/**
 * The browser's own timezone, carried in a hidden field.
 *
 * The daily rep quota and the streak are both day-boundary questions, and the
 * only place the answer exists is the client. Read once, on the way in.
 */
function TimezoneField() {
  const [zone, setZone] = useState('')
  useEffect(() => {
    try { setZone(Intl.DateTimeFormat().resolvedOptions().timeZone ?? '') } catch { setZone('') }
  }, [])
  return <input type="hidden" name="timezone" value={zone} readOnly />
}

function LoginForm({ devLoginEmail }: { devLoginEmail: string | null }) {
  const [state, action, busy] = useActionState(signInWithPassword, EMPTY)
  const [google, googleAction, googleBusy] = useActionState(async () => signInWithGoogle(), EMPTY)
  const [show, setShow] = useState(false)
  const error = state.message ?? google.message
  return <><AuthHeading title="Log in" /><form action={googleAction}><button className="oauth-button" type="submit" disabled={googleBusy}><span className="google-mark">G</span> {googleBusy ? 'Opening Google…' : 'Continue with Google'}</button></form><Or /><form className="auth-form" action={action}>{error ? <FormError>{error}</FormError> : null}<TimezoneField /><Input label="Email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required /><PasswordField label="Password" name="password" show={show} onToggle={() => setShow((value) => !value)} /><div className="auth-inline"><span /><Link href="/forgot-password" className="volt-link">Forgot?</Link></div><Button type="submit" size="lg" fullWidth loading={busy}>Log in</Button></form><AuthFoot>New here? <Link href="/signup" className="volt-link">Start training</Link></AuthFoot>{devLoginEmail ? <DevDoor email={devLoginEmail} /> : null}</>
}

/**
 * Development only, and gated inside `devSignIn` as well as here — the
 * built-in email sender allows a couple an hour, which debugging exhausts
 * before it finds anything.
 */
function DevDoor({ email }: { email: string }) {
  const [state, action, busy] = useActionState(async () => devSignIn(), EMPTY)
  return <div className="auth-dev"><Hairline /><form action={action}><Button type="submit" variant="ghost" size="sm" fullWidth loading={busy}>Dev sign-in as {email}</Button></form>{state.message ? <p className="auth-fine">{state.message}</p> : null}</div>
}

function SignupForm() {
  const router = useRouter()
  const [state, action, busy] = useActionState(signUpWithPassword, EMPTY)
  const [google, googleAction, googleBusy] = useActionState(async () => signInWithGoogle(), EMPTY)
  const [show, setShow] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPasswordValue] = useState('')
  // Confirmation is on: the account exists and the inbox is the next step.
  useEffect(() => { if (state.ok) router.push(`/verify-email?email=${encodeURIComponent(email)}`) }, [email, router, state.ok])
  const strength = password.length === 0 ? 'Use at least 8 characters.' : password.length < 8 ? 'Keep going — 8 characters minimum.' : password.length < 12 ? 'Good enough. Longer is stronger.' : 'Strong.'
  const error = state.message ?? google.message
  return <><AuthHeading title="Start training" /><form action={googleAction}><button className="oauth-button" type="submit" disabled={googleBusy}><span className="google-mark">G</span> {googleBusy ? 'Opening Google…' : 'Continue with Google'}</button></form><Or /><form className="auth-form" action={action}>{error ? <FormError>{error}</FormError> : null}<TimezoneField /><Input label="Email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required value={email} onChange={(event) => setEmail(event.target.value)} /><PasswordField label="Password" name="password" show={show} onToggle={() => setShow((value) => !value)} value={password} onChange={setPasswordValue} hint={strength} autoComplete="new-password" /><Button type="submit" size="lg" fullWidth loading={busy} disabled={password.length < 8}>Create account</Button></form><AuthFoot>Already training? <Link href="/login" className="volt-link">Log in</Link></AuthFoot><p className="auth-fine">By continuing, you agree to the <Link href="/terms">terms</Link> and <Link href="/privacy">privacy policy</Link>.</p></>
}

function PasswordField({ label, name, show, onToggle, value, onChange, hint, autoComplete = 'current-password' }: { label: string; name: string; show: boolean; onToggle: () => void; value?: string; onChange?: (value: string) => void; hint?: string; autoComplete?: 'current-password' | 'new-password' }) {
  return <div className="password-wrap"><Input label={label} name={name} type={show ? 'text' : 'password'} autoComplete={autoComplete} minLength={8} required value={value} onChange={onChange ? (event) => onChange(event.target.value) : undefined} hint={hint} /><button type="button" aria-label={show ? 'Hide password' : 'Show password'} onClick={onToggle}>{show ? <EyeOff size={18} strokeWidth={1.5} /> : <Eye size={18} strokeWidth={1.5} />}</button></div>
}

function VerifyEmail({ email }: { email: string }) {
  const [state, action, busy] = useActionState(resendConfirmation, EMPTY)
  const [seconds, setSeconds] = useState(0)
  useEffect(() => { if (state.ok) setSeconds(60) }, [state.ok])
  useEffect(() => { if (seconds <= 0) return; const timer = window.setTimeout(() => setSeconds((value) => value - 1), 1000); return () => window.clearTimeout(timer) }, [seconds])
  return <div className="auth-state"><MailCheck size={34} strokeWidth={1.5} className="volt" /><AuthHeading title="Check your email" />{email ? <p>We sent a link to <strong>{email}</strong>.</p> : <p>We sent you a sign-in link. Open it in this browser.</p>}{state.message ? <FormError>{state.message}</FormError> : null}<form action={action} style={{ width: '100%' }}><input type="hidden" name="email" value={email} readOnly /><Button type="submit" variant="secondary" fullWidth loading={busy} disabled={seconds > 0 || !email}>{seconds > 0 ? <span className="data">Resend in {seconds}s</span> : 'Resend'}</Button></form><Link className="arena-button arena-button--ghost arena-button--full" href="/signup">Wrong address? Start over</Link></div>
}

function ForgotPassword() {
  const [state, action, busy] = useActionState(sendPasswordReset, EMPTY)
  const [email, setEmail] = useState('')
  // Always the same answer, sent or not: "no account with that address" is
  // account enumeration with a helpful tone of voice.
  if (state.ok) return <div className="auth-state"><MailCheck size={34} strokeWidth={1.5} className="volt" /><AuthHeading title="Check your email" /><p>If <strong>{email}</strong> has an account, a reset link is on its way.</p><Link className="arena-button arena-button--ghost arena-button--full" href="/login">Back to log in</Link></div>
  return <><AuthHeading title="Reset password" /><p className="auth-intro">Enter the address you train with. We&apos;ll send one secure reset link.</p><form className="auth-form" action={action}>{state.message ? <FormError>{state.message}</FormError> : null}<Input label="Email" name="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /><Button type="submit" size="lg" fullWidth loading={busy}>Send reset link</Button></form><AuthFoot><Link href="/login" className="volt-link">Back to log in</Link></AuthFoot></>
}

/**
 * `ready` is whether a session exists on this request. The recovery link is
 * exchanged by /auth/confirm before it lands here, so a session IS the token —
 * which is why an expired link shows up as no session rather than a bad one.
 */
function ResetPassword({ ready }: { ready: boolean }) {
  const [state, action, busy] = useActionState(setPassword, EMPTY)
  if (!ready) return <div className="auth-state"><ShieldAlert size={34} strokeWidth={1.5} className="amber" /><AuthHeading title="Link expired" /><p>This reset link is no longer valid. Request a fresh one.</p><Link className="arena-button arena-button--primary arena-button--full" href="/forgot-password">Get a new link</Link></div>
  if (state.ok) return <div className="auth-state"><MailCheck size={34} strokeWidth={1.5} className="volt" /><AuthHeading title="Password set" /><p>You&apos;re ready to get back to work.</p><Link className="arena-button arena-button--primary arena-button--full" href="/train">Go to training</Link></div>
  return <><AuthHeading title="Set password" /><form className="auth-form" action={action}>{state.message ? <FormError>{state.message}</FormError> : null}<Input label="New password" name="password" type="password" autoComplete="new-password" minLength={8} required /><Input label="Confirm password" name="confirm" type="password" autoComplete="new-password" minLength={8} required /><Button type="submit" size="lg" fullWidth loading={busy}>Set password</Button></form></>
}

function AuthHeading({ title }: { title: string }) { return <h1 className="display-lg auth-title">{title}</h1> }
function AuthFoot({ children }: { children: ReactNode }) { return <p className="auth-foot">{children}</p> }
function FormError({ children }: { children: ReactNode }) { return <div className="form-error" role="alert">{children}</div> }
function Or() { return <div className="auth-or"><Hairline /><span className="label">Or</span><Hairline /></div> }
