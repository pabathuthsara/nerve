'use server'

/**
 * Email OTP (§04). Google is deliberately not wired yet — it needs OAuth
 * credentials created in the Google Cloud console, and /auth/callback already
 * handles the code exchange, so adding it is configuration rather than code.
 *
 * Both halves of the email work without touching the Supabase template:
 * /auth/confirm accepts the default `{{ .ConfirmationURL }}` link and an
 * edited `token_hash` link alike. The six-digit code needs `{{ .Token }}` in
 * the Magic Link template, which a hosted project only unlocks once custom
 * SMTP is configured — so the code field is the nicer path, not the only one.
 *
 * Every action returns a plain result object instead of throwing. A thrown
 * error in a Server Action reaches the client as a generic digest string,
 * which would leave the form with nothing honest to say.
 */

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { supabaseServer } from '@/lib/db/server'

export interface AuthResult {
  ok: boolean
  message: string | null
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

async function siteOrigin(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL
  const list = await headers()
  const host = list.get('x-forwarded-host') ?? list.get('host') ?? 'localhost:3000'
  const proto = list.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

export async function sendCode(_prev: AuthResult, form: FormData): Promise<AuthResult> {
  const email = String(form.get('email') ?? '').trim().toLowerCase()
  if (!looksLikeEmail(email)) {
    return { ok: false, message: 'That does not look like an email address.' }
  }

  const supabase = await supabaseServer()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${await siteOrigin()}/auth/confirm` },
  })

  if (error) {
    return { ok: false, message: error.message }
  }
  return { ok: true, message: `Code sent to ${email}. It expires in an hour.` }
}

export async function verifyCode(_prev: AuthResult, form: FormData): Promise<AuthResult> {
  const email = String(form.get('email') ?? '').trim().toLowerCase()
  const token = String(form.get('token') ?? '').trim()

  if (token.length < 6) {
    return { ok: false, message: 'The code is six digits.' }
  }

  const supabase = await supabaseServer()
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })

  if (error) {
    return { ok: false, message: 'That code did not work. Ask for another one.' }
  }
  redirect('/')
}

/**
 * Development-only sign-in, so building the thing does not burn the two
 * emails an hour the built-in sender allows.
 *
 * Three gates, all checked HERE rather than in the component that renders the
 * button — a hidden control is not a security boundary:
 *
 *   1. NODE_ENV is not production
 *   2. DEV_LOGIN_EMAIL is set
 *   3. DEV_LOGIN_PASSWORD is set
 *
 * Neither variable is NEXT_PUBLIC_, so neither reaches the browser, and a
 * production build has no path to this branch at all.
 */
export async function devSignIn(): Promise<AuthResult> {
  const email = process.env.DEV_LOGIN_EMAIL
  const password = process.env.DEV_LOGIN_PASSWORD

  if (process.env.NODE_ENV === 'production' || !email || !password) {
    return { ok: false, message: 'Development sign-in is not available here.' }
  }

  const supabase = await supabaseServer()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return {
      ok: false,
      message: `${error.message} — re-run \`npm run db:user -- ${email}\` and restart the dev server.`,
    }
  }
  redirect('/')
}

export async function signOut(): Promise<void> {
  const supabase = await supabaseServer()
  await supabase.auth.signOut()
  redirect('/login')
}

/* ------------------------------------------------------------------ *
 * Password auth — the Arena screens (/login, /signup, /reset-password)
 * ------------------------------------------------------------------ *
 *
 * The OTP flow above stays. It is the door that works on an untouched
 * Supabase project and it is what /auth uses. These are the second door: the
 * frontend brief asks for an address and a password, and a returning user on
 * a phone should not have to go and find an inbox every single time.
 *
 * Both doors reach the same account. A user who signed up by OTP has no
 * password until they set one through /forgot-password, which is why that
 * screen says "reset" rather than "forgot" once you read it closely.
 */

/** Supabase's floor is six. The UI has always asked for eight; agree with it. */
const MIN_PASSWORD = 8

/**
 * A timezone the browser reported. Day boundaries — the daily rep quota, the
 * streak — are local, and a Colombo user whose reps reset at 05:30 has been
 * handed someone else's midnight.
 */
async function rememberTimezone(zone: string): Promise<void> {
  if (!/^[A-Za-z]+\/[A-Za-z0-9_+\-/]+$/.test(zone)) return
  const supabase = await supabaseServer()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return
  await supabase.from('profiles').update({ timezone: zone }).eq('id', data.user.id)
}

export async function signUpWithPassword(_prev: AuthResult, form: FormData): Promise<AuthResult> {
  const email = String(form.get('email') ?? '').trim().toLowerCase()
  const password = String(form.get('password') ?? '')
  const zone = String(form.get('timezone') ?? '')

  if (!looksLikeEmail(email)) return { ok: false, message: 'That does not look like an email address.' }
  if (password.length < MIN_PASSWORD) {
    return { ok: false, message: `A password needs at least ${MIN_PASSWORD} characters.` }
  }

  const supabase = await supabaseServer()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${await siteOrigin()}/auth/confirm?next=/` },
  })

  if (error) return { ok: false, message: error.message }

  // Confirmation off (or already confirmed): there is a session, so go
  // straight in. `/` decides between onboarding and training.
  if (data.session) {
    if (zone) await rememberTimezone(zone)
    redirect('/')
  }

  // Confirmation on. Supabase deliberately returns the same shape whether or
  // not the address already has an account, and this does not undo that —
  // an account existing is not something a signup form should confirm.
  return { ok: true, message: null }
}

export async function signInWithPassword(_prev: AuthResult, form: FormData): Promise<AuthResult> {
  const email = String(form.get('email') ?? '').trim().toLowerCase()
  const password = String(form.get('password') ?? '')
  const zone = String(form.get('timezone') ?? '')

  if (!looksLikeEmail(email)) return { ok: false, message: 'That does not look like an email address.' }
  if (!password) return { ok: false, message: 'Enter your password.' }

  const supabase = await supabaseServer()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    // One message for a wrong address and a wrong password, on purpose: two
    // messages tell an attacker which addresses have accounts.
    return {
      ok: false,
      message:
        error.message === 'Email not confirmed'
          ? 'Confirm your email first — the link is in your inbox.'
          : 'That email and password do not match an account.',
    }
  }

  if (zone) await rememberTimezone(zone)
  redirect('/')
}

/**
 * Sends the reset link. Always reports success: "no account with that address"
 * is account enumeration wearing a helpful face.
 */
export async function sendPasswordReset(_prev: AuthResult, form: FormData): Promise<AuthResult> {
  const email = String(form.get('email') ?? '').trim().toLowerCase()
  if (!looksLikeEmail(email)) return { ok: false, message: 'That does not look like an email address.' }

  const supabase = await supabaseServer()
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await siteOrigin()}/auth/confirm?next=/reset-password`,
  })

  return { ok: true, message: null }
}

/**
 * Sets the new password. The recovery link has already been exchanged by
 * /auth/confirm, so this runs with a real session — which is also why
 * /reset-password is not in the "signed in? go to /train" list in the guard.
 */
export async function setPassword(_prev: AuthResult, form: FormData): Promise<AuthResult> {
  const password = String(form.get('password') ?? '')
  const confirm = String(form.get('confirm') ?? '')

  if (password.length < MIN_PASSWORD) {
    return { ok: false, message: `A password needs at least ${MIN_PASSWORD} characters.` }
  }
  if (password !== confirm) return { ok: false, message: 'Those two do not match.' }

  const supabase = await supabaseServer()
  const { data } = await supabase.auth.getUser()
  if (!data.user) {
    return { ok: false, message: 'This reset link has expired. Ask for a fresh one.' }
  }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { ok: false, message: error.message }
  return { ok: true, message: null }
}

/**
 * Google. The exchange already lived at /auth/callback; this is the button
 * that points at it. Everything else is configuration in the Google console
 * and the Supabase dashboard, and an unconfigured provider says so here
 * rather than failing silently at the redirect.
 */
export async function signInWithGoogle(): Promise<AuthResult> {
  const supabase = await supabaseServer()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${await siteOrigin()}/auth/callback?next=/` },
  })

  if (error || !data.url) {
    return { ok: false, message: error?.message ?? 'Google sign-in is not available right now.' }
  }
  redirect(data.url)
}

/** Another confirmation email, for the "check your inbox" screen. */
export async function resendConfirmation(_prev: AuthResult, form: FormData): Promise<AuthResult> {
  const email = String(form.get('email') ?? '').trim().toLowerCase()
  if (!looksLikeEmail(email)) return { ok: false, message: 'That does not look like an email address.' }

  const supabase = await supabaseServer()
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: `${await siteOrigin()}/auth/confirm?next=/` },
  })

  // The built-in sender allows a couple an hour, and being told to wait is
  // more use than a button that silently does nothing.
  if (error) return { ok: false, message: error.message }
  return { ok: true, message: null }
}
