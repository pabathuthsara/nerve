'use client'

/**
 * *Continue with Google*, on all three doors.
 *
 * One component rather than three copies, for the reason `PRESENTATION.name`
 * exists: `/login`, `/signup` and `/start`'s last screen are three places the
 * same sentence would drift apart, and two of them are the first screen a
 * stranger from paid social ever sees.
 *
 * ── WHY IT IS NEVER THE PRIMARY BUTTON ───────────────────────────────────
 *
 * Volt appears once per screen and *Log in* already has it. A volt Google
 * button would break that rule on the two highest-traffic screens in the
 * product, and it would also be a lie about the hierarchy: email and password
 * is the door that collects a date of birth before the account exists (§16.4),
 * so it is the one the page should be recommending.
 *
 * ── AND WHY THE MARK IS WHITE RATHER THAN FOUR-COLOUR ────────────────────
 *
 * Google's identity guidelines allow the white "G" on a dark button, and Arena
 * allows nothing else: red, amber and blue are semantic here, and a
 * four-colour logo would put three of them on one control that means none of
 * those things. Same four paths as the official mark, one `currentColor`.
 *
 * It is not in `components/marks/`. That registry is the thirty things a user
 * is meant to recognise as OURS, walked by a test against the real unions; a
 * third party's trademark is not one of them and must not become a `MarkName`
 * anybody can reach for.
 */

import { useActionState } from 'react'
import { Button } from '@/components/ui'
import { signInWithGoogle, type AuthResult } from '@/app/auth/actions'
import { START_FIELD } from '@/lib/data/start-funnel'

const EMPTY: AuthResult = { ok: false, message: null }

function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" width="16" height="16" aria-hidden="true" focusable="false">
      <g fill="currentColor">
        <path d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z" />
        <path d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.859-3.0477.859-2.344 0-4.3282-1.5831-5.036-3.7104H.9574v2.3318C2.4382 15.9832 5.4818 18 9 18z" />
        <path d="M3.964 10.71c-.18-.54-.2822-1.1168-.2822-1.71s.1022-1.17.2822-1.71V4.9582H.9573A8.9965 8.9965 0 0 0 0 9c0 1.4523.3477 2.8268.9573 4.0418L3.964 10.71z" />
        <path d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.426 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.964 7.29C4.6718 5.1627 6.6559 3.5795 9 3.5795z" />
      </g>
    </svg>
  )
}

/**
 * `answers` is the `/start` run's state, encoded. Absent on `/login` and
 * `/signup`, where there is no run behind the button — the action reads the
 * field as optional and writes no cookie when it is empty, so a plain sign-in
 * carries nothing at all.
 */
export function GoogleButton({ answers = null, label = 'Continue with Google', first = false }: {
  answers?: string | null
  label?: string
  /**
   * Whether this is the FIRST door on the screen rather than the second.
   *
   * It moves the divider below the button and renames it, because "or" above
   * a fallback and "or" above the recommended path are two different
   * sentences. `/start`'s account screen passes it: the birth year has
   * already been given there, so Google genuinely is the shortest route and
   * the email form genuinely is the alternative. `/login` and `/signup` do
   * not — on those screens the email door is the one that collects a date,
   * so promoting Google would be recommending the longer walk.
   */
  first?: boolean
}) {
  const [state, action, busy] = useActionState(
    async (_prev: AuthResult, form: FormData) => signInWithGoogle(form),
    EMPTY,
  )
  const divider = <div className="auth-or" aria-hidden="true"><span>{first ? 'or use an email address' : 'or'}</span></div>
  return (
    <div className={first ? 'auth-oauth auth-oauth--first' : 'auth-oauth'}>
      {first ? null : divider}
      <form action={action}>
        {answers ? <input type="hidden" name={START_FIELD} value={answers} readOnly /> : null}
        <Button type="submit" variant="secondary" size="lg" fullWidth loading={busy}>
          <span className="auth-oauth__label"><GoogleMark />{label}</span>
        </Button>
      </form>
      {/* The action only ever returns to say it could not start. A successful
          press redirects and never comes back to render this. */}
      {state.message ? <p className="auth-fine" role="alert">{state.message}</p> : null}
      {first ? divider : null}
    </div>
  )
}
