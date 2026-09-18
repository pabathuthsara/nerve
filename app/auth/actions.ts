'use server'

/**
 * Email, password and Google (§04).
 *
 * Google was deliberately not offered for months, on the grounds that it was
 * configuration rather than code. Turning it on found the other half: the
 * exchange really was one dashboard change, and everything AROUND the exchange
 * — where the funnel's answers go, which host the session lands on, what
 * §16.4 can still promise — was not. See `lib/db/start-crossing.ts` and
 * `app/auth/callback/route.ts`.
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
import { cookies, headers } from 'next/headers'
import { supabaseServer } from '@/lib/db/server'
import { checkAge } from '@/lib/safety/age'
import { stampNewAccount } from '@/lib/db/start-crossing'
import {
  START_COOKIE,
  START_COOKIE_MAX_AGE,
  START_FIELD,
  birthDateFromYear,
  decodeStartAnswers,
} from '@/lib/data/start-funnel'

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
  const dateOfBirth = String(form.get('date_of_birth') ?? '')

  if (!looksLikeEmail(email)) return { ok: false, message: 'That does not look like an email address.' }
  if (password.length < MIN_PASSWORD) {
    return { ok: false, message: `A password needs at least ${MIN_PASSWORD} characters.` }
  }

  // §16.4, and BEFORE the account exists. An age gate that runs after sign-up
  // has already created the thing it was supposed to prevent, and leaves us
  // deleting a minor's account rather than never having opened one. The date
  // attribute on the field is a courtesy to the browser's picker; this is the
  // check.
  const age = checkAge(dateOfBirth, new Date())
  if (!age.ok) return { ok: false, message: age.message }

  const supabase = await supabaseServer()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${await siteOrigin()}/auth/confirm?next=/` },
  })

  if (error) return { ok: false, message: error.message }

  if (data.user && isNewAccount(data.user)) {
    await stampNewAccount(data.user.id, age.dob, decodeStartAnswers(String(form.get(START_FIELD) ?? '')))
  }

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

/**
 * Whether `signUp` actually created something.
 *
 * Supabase deliberately does not tell a sign-up form that an address already
 * has an account. With email confirmation ON it answers a *fabricated* user
 * rather than an error, and the tell is an empty `identities` array. Nothing
 * downstream of here may write a profile row on the strength of that id: the
 * write below sets a display name, a track and a focus area, and doing it for
 * an id somebody else owns would let a stranger with an email address edit
 * another account by posting this form.
 *
 * In practice the fabricated id does not match a real row and the update
 * affects nothing — which is an accident of how Supabase obfuscates, not a
 * guarantee. Checked explicitly, and narrowly: only an array that is present
 * and empty means "already registered". Anything else is treated as a real
 * account, so the failure mode is an unstamped profile and one extra pass
 * through `/onboarding/age`, never a silent write to somebody else's row.
 */
function isNewAccount(user: { identities?: unknown }): boolean {
  const identities = user.identities
  return !(Array.isArray(identities) && identities.length === 0)
}

/* ------------------------------------------------------------------ *
 * Google (§04)
 * ------------------------------------------------------------------ */

/**
 * Hands the browser to Google, and puts the funnel's answers somewhere they
 * will survive the trip.
 *
 * ── WHY THE ANSWERS NEED A COOKIE ────────────────────────────────────────
 *
 * `signUpWithPassword` reads them out of its own `FormData`, because the form
 * that collected them is the form that submits. This flow leaves the site: the
 * browser goes to Google, then to Supabase, and comes back to a route handler
 * that has never seen the form. A query parameter would work and is the wrong
 * tool — it would ride through two third-party redirects, land in their access
 * logs, and be editable by the person it describes on the way back.
 *
 * `sameSite: 'lax'` is load-bearing and is the thing to not "tidy up" later.
 * `'strict'` is not sent on a cross-site navigation, and the return leg from
 * Google is exactly that, so the answers would be silently dropped on every
 * single sign-up while every test that did not leave the origin still passed.
 *
 * Ten minutes, because it describes one crossing and not a preference. It is
 * deleted by the callback the moment it is read.
 *
 * ── AND WHY THIS IS A SERVER ACTION AND NOT A LINK ───────────────────────
 *
 * `signInWithOAuth` does not redirect; it returns a URL and, on the way,
 * writes the PKCE code verifier as a cookie. That cookie has to be set on a
 * response the browser keeps, which is what a Server Action gives us and what
 * an `<a href>` to Google would not.
 */
export async function signInWithGoogle(form: FormData): Promise<AuthResult> {
  const raw = String(form.get(START_FIELD) ?? '')

  /**
   * §16.4, BEFORE the account exists — on the one OAuth entrance that can.
   *
   * `/start` asks for a birth year on screen two now, so by the time this
   * button is pressed there the answer is already in hand and the gate can
   * run where the rule wants it: ahead of anything being created. Refusing
   * here means no Google account is ever made for an under-age answer given
   * on this run, which is the same guarantee `signUpWithPassword` gives.
   *
   * `/login` and `/signup` post no answers, so there is nothing to check and
   * nothing is claimed — those accounts meet the gate at `/onboarding/age`
   * on their first render instead. Only a year that is present and FAILS
   * stops the redirect; an absent one is not a refusal.
   */
  const answers = raw ? decodeStartAnswers(raw) : null
  if (answers?.birthYear) {
    const verdict = checkAge(birthDateFromYear(answers.birthYear), new Date())
    if (!verdict.ok) return { ok: false, message: verdict.message }
  }

  const supabase = await supabaseServer()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${await siteOrigin()}/auth/callback?next=/` },
  })

  if (error || !data?.url) {
    return { ok: false, message: 'Google sign-in is unavailable right now. Use your email address.' }
  }

  if (raw) {
    const store = await cookies()
    store.set(START_COOKIE, raw, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: START_COOKIE_MAX_AGE,
    })
  }

  redirect(data.url)
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
