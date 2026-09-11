'use server'

/**
 * Email and password (§04). Google is deliberately not offered — it needs OAuth
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
import { supabaseAdmin } from '@/lib/db/admin'
import { checkAge } from '@/lib/safety/age'
import type { TablesUpdate } from '@/lib/db/types'
import { START_FIELD, decodeStartAnswers, startProfileWrite, type StartAnswers } from '@/lib/data/start-funnel'

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

/**
 * Everything a brand-new account knows about itself, in one write.
 *
 * ── WHY ONE WRITE AND NOT TWO ────────────────────────────────────────────
 *
 * This was `rememberAge`, and it wrote the date of birth alone. `/start` now
 * arrives with three answers besides — the track, the focus area and a first
 * name, collected before the account existed — and the obvious shape was a
 * second update beside the first. It is one, because the thing being raced is
 * the profile row itself: `handle_new_user` inserts it from a trigger on
 * `auth.users`, and two updates would be two chances to lose the same race for
 * two different halves of the same screenful of answers.
 *
 * ── AND WHY IT RETRIES, WHICH `rememberAge` DID NOT ──────────────────────
 *
 * Losing the race used to cost nothing: `/onboarding/age` asks for the date
 * again, and that is the same gate. It is not nothing any more. Somebody who
 * has just answered three questions and would then be asked all three again is
 * the exact failure `/start` exists to prevent, so a write that affected no
 * row is tried once more before giving up. Still best-effort at the end of it —
 * `onboardingResumePath` remains the backstop and a sign-up must never fail
 * because a preference did not stick.
 *
 * With the service role, because there may be no session: with confirmation on
 * `signUp` hands back a user with no cookie attached to it, and waiting for the
 * link to be clicked would mean the §16.4 gate we just ran had nowhere to write
 * its answer. Nothing here is an entitlement (rule 11) — a track, a focus and a
 * first name are all changeable from `/profile/settings` by their owner.
 */
async function stampNewAccount(userId: string, dateOfBirth: string, answers: StartAnswers): Promise<void> {
  const stamp = new Date().toISOString()
  /**
   * The mapping itself is `startProfileWrite`, and it is pure so that it can
   * be tested: get one flag wrong and `onboardingResumePath` asks all three
   * questions again of somebody who has just answered them, with every screen
   * still working. See `lib/data/start-funnel.test.ts`.
   */
  const { patch: answered, flags } = startProfileWrite(answers)
  const patch: TablesUpdate<'profiles'> = {
    date_of_birth: dateOfBirth,
    age_confirmed_at: stamp,
    ...answered,
  }

  // Set rather than merged: this row is seconds old and `handle_new_user`
  // inserts it with the column default. There is nothing here to merge with,
  // and reading it back first would add a round trip to the one write that is
  // racing a trigger.
  if (flags.length > 0) {
    patch.ui_flags = flags.reduce<Record<string, string>>((carry, flag) => ({ ...carry, [flag]: stamp }), {})
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { count } = await supabaseAdmin()
        .from('profiles')
        .update(patch, { count: 'exact' })
        .eq('id', userId)
      if (count !== 0) return
    } catch {
      // Fall through to the retry, then to the backstop.
    }
    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 150))
  }
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
