import 'server-only'

/**
 * What a finished `/start` run becomes on a brand-new account.
 *
 * ── WHY THIS IS NOT IN `app/auth/actions.ts` ─────────────────────────────
 *
 * It was, and it could not stay there once a second door needed it. That file
 * is `'use server'`, where **every export is a Server Action the browser may
 * call with arguments of its choosing**. Exporting a function whose first
 * parameter is a user id would hand anybody a way to stamp a track, a focus
 * area and a display name onto somebody else's profile — the precise write
 * `isNewAccount` exists to refuse. So the crossing lives here, in an ordinary
 * `server-only` module that both doors import and neither publishes.
 *
 * The second door is Google. `signUpWithPassword` posts a form and gets the
 * answers in its `FormData`; the OAuth flow leaves the site entirely and comes
 * back to a route handler, so its answers travel in a short-lived cookie
 * instead. Different carriers, one write, one set of decisions.
 */

import { supabaseAdmin } from './admin'
import { seedInterviewSetup } from './interview'
import { birthDateFromYear, startInterviewSetup, startProfileWrite, type StartAnswers } from '@/lib/data/start-funnel'
import { checkAge } from '@/lib/safety/age'
import type { TablesUpdate } from './types'

/**
 * The same read `enforceFrontendGuard` does of the same column. Repeated
 * rather than imported: `lib/data/guards.ts` is a route guard that redirects,
 * and a database module reaching into it to borrow two lines would put
 * `next/navigation` on a path that has no request to redirect.
 */
function readFlags(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
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
 * ── WHY THE DATE IS NULLABLE ─────────────────────────────────────────────
 *
 * Because Google's button has no fields on it, and one of the two OAuth
 * entrances still has nothing to say about age.
 *
 * `/start` does, since SIGNUP-FIXES §2.2 moved the gate to screen two: the
 * birth year is answered six screens before any door is chosen and rides the
 * cookie with everything else, so `signInWithGoogle` can run `checkAge`
 * **before it redirects** and §16.4 is satisfied before the account exists,
 * exactly as it is on the password door.
 *
 * `/login` and `/signup` do not. There is no run behind those buttons, no
 * scope returns a date of birth, and the only scope that would ask is
 * sensitive. `null` writes neither age column and leaves `age_confirmed_at`
 * unset, which is what sends that account through `/onboarding/age` on its
 * very first render: `app/page.tsx` checks it before anything else, and
 * `enforceFrontendGuard` lets no other screen draw until it is answered.
 *
 * So §16.4 is *gate before the account* on every door but those two, and
 * *gate before the product* on them — and nothing between the two spends
 * money or meets a character. Recorded as `LAUNCH-GAP.md` D25.
 *
 * With the service role, because there may be no session: with confirmation on
 * `signUp` hands back a user with no cookie attached to it, and waiting for the
 * link to be clicked would mean the §16.4 gate we just ran had nowhere to write
 * its answer. Nothing here is an entitlement (rule 11) — a track, a focus and a
 * first name are all changeable from `/profile/settings` by their owner.
 */
export async function stampNewAccount(
  userId: string,
  dateOfBirth: string | null,
  answers: StartAnswers,
): Promise<void> {
  const stamp = new Date().toISOString()
  /**
   * The mapping itself is `startProfileWrite`, and it is pure so that it can
   * be tested: get one flag wrong and `onboardingResumePath` asks all three
   * questions again of somebody who has just answered them, with every screen
   * still working. See `lib/data/start-funnel.test.ts`.
   */
  const { patch: answered, flags } = startProfileWrite(answers)
  const patch: TablesUpdate<'profiles'> = {
    ...(dateOfBirth ? { date_of_birth: dateOfBirth, age_confirmed_at: stamp } : {}),
    ...answered,
  }

  // Set rather than merged: this row is seconds old and `handle_new_user`
  // inserts it with the column default. There is nothing here to merge with,
  // and reading it back first would add a round trip to the one write that is
  // racing a trigger.
  if (flags.length > 0) {
    patch.ui_flags = flags.reduce<Record<string, string>>((carry, flag) => ({ ...carry, [flag]: stamp }), {})
  }

  /**
   * The interview arm's answer goes to a second table, and it is a separate
   * write because it is a separate row in a separate place.
   *
   * The one-write argument above is about `profiles`, which is being raced by
   * `handle_new_user`. Nothing races `interview_setups` — no trigger inserts
   * it — so there is nothing to merge with and nothing to lose. It is also
   * genuinely optional: `startInterviewSetup` answers null for the dating arm
   * and for an interview run that skipped the question, and then nothing is
   * written at all rather than an empty row the user never created.
   *
   * Fired before the retry loop so a slow profile write does not delay it, and
   * awaited at the end so the redirect does not outrun it — the very next
   * screen reads `interview_setups.complete` to decide whether this account
   * lands on its free screener or on a setup wizard.
   */
  const setup = startInterviewSetup(answers)
  const seeded = setup ? seedInterviewSetup(userId, setup) : null

  /**
   * An empty patch is a real case on the OAuth arm and only there: somebody
   * who pressed *Continue with Google* on `/login` has no date and no answers,
   * so there is nothing to say about them. The password arm always carries a
   * date, so this never fires for it. Postgrest treats an empty update as a
   * malformed request rather than a no-op, which would turn "nothing to do"
   * into a logged failure on the most ordinary sign-in there is.
   */
  if (Object.keys(patch).length > 0) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const { count } = await supabaseAdmin()
          .from('profiles')
          .update(patch, { count: 'exact' })
          .eq('id', userId)
        if (count !== 0) break
      } catch {
        // Fall through to the retry, then to the backstop.
      }
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 150))
    }
  }

  await seeded
}

/**
 * The OAuth arm's crossing: the same write, behind one question the password
 * arm never has to ask.
 *
 * `signUpWithPassword` knows it has just created an account, because
 * `auth.signUp` told it so (`isNewAccount`). A callback route knows nothing of
 * the kind — the same code path serves a first-ever Google sign-in and the
 * four-hundredth, and they are indistinguishable from the exchange alone.
 *
 * So the profile row is asked instead, and it gives a better answer than
 * `created_at` arithmetic would: a row with **no onboarding flag set and the
 * run unfinished** has never answered any of these questions, whatever its
 * age. Anything else is an account with a history, and a stale cookie must
 * never overwrite the track somebody has since chosen in `/profile/settings`.
 *
 * Best-effort throughout, for the reason `stampNewAccount` is: a sign-in must
 * not fail because a preference did not stick. Losing this write costs three
 * questions, which is exactly what `/start` cost before it existed.
 */
export async function crossOAuthAccount(userId: string, answers: StartAnswers): Promise<void> {
  try {
    const { data: profile } = await supabaseAdmin()
      .from('profiles')
      .select('ui_flags, onboarding_complete')
      .eq('id', userId)
      .maybeSingle()

    // No row yet means the trigger is still in flight, which is the race
    // `stampNewAccount` retries through. Treat it as new and let it try.
    if (profile?.onboarding_complete) return
    if (profile && Object.keys(readFlags(profile.ui_flags)).length > 0) return

    /**
     * The date, re-derived and re-checked here rather than trusted.
     *
     * The cookie is `httpOnly`, so its subject cannot edit it — and that is
     * not the reason this runs. `checkAge` is the only thing in the product
     * allowed to turn a date into a verdict (§16.4), and a second caller that
     * wrote `age_confirmed_at` off a bare integer would be a second age gate
     * with its own arithmetic. `signInWithGoogle` refuses an under-age year
     * before the redirect; this refuses to STAMP one, so the two cannot
     * disagree and the failure mode is an unstamped profile that
     * `/onboarding/age` then asks properly.
     */
    const dated = checkAge(birthDateFromYear(answers.birthYear), new Date())
    await stampNewAccount(userId, dated.ok ? dated.dob : null, answers)
  } catch {
    // The backstop is `onboardingResumePath`, which asks the questions again.
  }
}
