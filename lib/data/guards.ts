import 'server-only'

import { redirect } from 'next/navigation'
import { currentUser, supabaseServer } from '@/lib/db/server'
import { ONBOARDING_DEFERRED_FLAG, ONBOARDING_NAME_FLAG, ONBOARDING_TRACK_FLAG } from './ui-flags'

// `/text` is text mode (P1). Protected like every other training surface — it
// costs no quota, which is not the same as being open to anybody.
const protectedPrefixes = ['/train', '/roster', '/field', '/library', '/progress', '/profile', '/rep', '/text', '/session', '/interview', '/onboarding']

/**
 * Signed in and these are pointless — except /reset-password, which is only
 * ever reached WITH a session: /auth/confirm exchanges the recovery link
 * before the screen renders, so bouncing a signed-in user away from it would
 * make the reset link impossible to complete.
 */
const authPages = ['/login', '/signup', '/verify-email', '/forgot-password']

/**
 * What the guard already knows by the time it lets a request through.
 *
 * Returned rather than discarded because the onboarding run needs every field
 * on it — the answers on file, so a step that was answered opens answered —
 * and the alternative was a second identical `profiles` select on the page.
 * The guard is the only read on this path that is not optional, so it is the
 * right one to carry the answer.
 */
export interface GuardedProfile {
  display_name: string | null
  active_track: string | null
  focus_area: string | null
  current_level: number | null
  ui_flags: unknown
  onboarding_complete: boolean
  age_confirmed_at: string | null
}

export async function enforceFrontendGuard(path: string): Promise<GuardedProfile | null> {
  const user = await currentUser()

  if (!user) {
    if (protectedPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) redirect('/login')
    return null
  }

  if (authPages.includes(path)) redirect('/train')

  // The onboarding gate reads the profile rather than auth metadata: metadata
  // is user-writable through the auth API, and the answer to "has this person
  // finished onboarding" should not be one of the things they can set.
  const supabase = await supabaseServer()
  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_complete, unlocked_tracks, display_name, active_track, focus_area, current_level, ui_flags, age_confirmed_at')
    .eq('id', user.id)
    .maybeSingle()

  /**
   * §16.4, and ahead of everything else this function does.
   *
   * The sign-up form asks and `signUpWithPassword` writes the answer, so a
   * password account arrives here already stamped and never sees this step.
   * What still does: every account created before the gate shipped. Google
   * used to be the other case — its button had no fields on it — and that door
   * is closed for now, which narrows who lands here without removing the need
   * for it. They are asked once, and nothing in the product opens until they
   * answer, which is the difference between a gate and a form.
   *
   * It also has to keep working if Google is ever turned on (§04): the
   * `/auth/callback` exchange is still in place, and an OAuth account would
   * arrive with no date exactly as it did before.
   *
   * Checked before the onboarding gate rather than folded into it, because a
   * user who finished onboarding months ago is exactly the case that has no
   * date on file, and `onboarding_complete` would let them straight past.
   */
  const ageRoute = path === '/onboarding/age'
  if (!profile?.age_confirmed_at && !ageRoute) redirect('/onboarding/age')
  if (profile?.age_confirmed_at && ageRoute) {
    redirect(profile.onboarding_complete ? '/train' : onboardingResumePath(profile))
  }

  /**
   * Past those two, being on the age route means the date is still missing —
   * and then this screen is the only thing in the product allowed to render.
   * Nothing below may send them anywhere.
   *
   * It used to fall through, and the fall-through was an infinite redirect for
   * exactly the accounts this gate exists for. The rule at the bottom sends an
   * unfinished run to its resume step, and the age route was deliberately
   * excluded from the "is this an onboarding route" test that exempts the
   * others — for a good reason, which was a user who had FINISHED onboarding
   * and had no date on file, and whom that rule would have bounced to /train
   * and back here forever.
   *
   * What it missed is the other shape, which is the common one: a brand-new
   * Google account has no date AND no finished run, so the same rule sent it
   * to `/onboarding/track`, which had no date either and sent it back here.
   * Every Google sign-up landed in that loop, and the screen it never reached
   * is the §16.4 gate. Returning here answers both, because past this point
   * there is only ever one right thing to draw.
   */
  if (ageRoute) return (profile as GuardedProfile | null) ?? null

  /**
   * The interview track's gate, and it is now open (INTERVIEW-PLAN E1).
   *
   * This was written when the track was screens over fixtures and the point was
   * to stop somebody typing the URL into a demo. **The guard itself has not
   * changed and did not need to** — it was the right gate all along, which is
   * what E1 says. What changed is the other side of it: a credit landing adds
   * `interview` to `unlocked_tracks` (the trigger in
   * `20260907041000_interview_track_on_credit.sql`), and every account is
   * granted the free five-minute screener at sign-up, so every account has the
   * second entry.
   *
   * It stays because the column is still the authority and still has to be:
   * `db:interview -- --close` shuts the track on one account, and an account
   * created before the trigger existed would have one entry until a credit
   * arrives.
   */
  if (path === '/interview' || path.startsWith('/interview/')) {
    const tracks = profile?.unlocked_tracks ?? []
    if (!tracks.includes('interview')) redirect('/train')
  }

  /**
   * The step that was cut.
   *
   * `/onboarding/experience` asked how often somebody does this for real and
   * wrote a column nothing ever read. Nothing produces this path any more —
   * the resume does not return it and the run does not navigate — but a tab
   * left open on it would otherwise land on a 404 mid-run, which is a worse
   * ending than the question was. Sent to wherever they actually stopped.
   */
  if (path === '/onboarding/experience') {
    redirect(profile?.onboarding_complete ? '/train' : onboardingResumePath(profile))
  }

  // The age step is deliberately NOT one of these. It is reached by people who
  // have already finished onboarding, and the rule below would bounce them
  // straight back to /train — into the redirect that sent them here, forever.
  const onboardingRoute = (path === '/onboarding' || path.startsWith('/onboarding/')) && !ageRoute

  /**
   * Deferred, which is not the same as finished.
   *
   * The mic step's *Look around first* used to call `finishOnboarding`,
   * because the alternative at the time was a skip button that did not skip:
   * with onboarding incomplete this branch bounced every protected route
   * straight back. That made the escape hatch a trapdoor. Somebody whose
   * browser would not grant a microphone in that moment permanently skipped
   * the mic check, the brief and the "How a rep works" sheet, with no route
   * back to any of them and nothing in the product that would ever offer one
   * again.
   *
   * The flag is what separates the two. It lets them past exactly as a
   * finished run does, and it leaves `onboarding_complete` false — so the
   * resume path still resolves, `/onboarding/*` still renders rather than
   * bouncing to /train, and `/train` can carry one quiet row back to the step
   * they stopped on.
   */
  const deferred = !!readFlags(profile?.ui_flags)[ONBOARDING_DEFERRED_FLAG]

  // A missing profile row means the sign-up trigger has not landed yet. Send
  // them through onboarding rather than into a rep against nothing.
  //
  // Sent to where they stopped, not back to the beginning. Every answer is
  // written the moment it is given, so restarting at step one asked people to
  // re-answer questions we already had — and made a refresh feel like losing
  // work when nothing had actually been lost.
  if (!profile?.onboarding_complete && !deferred && !onboardingRoute) redirect(onboardingResumePath(profile))
  if (profile?.onboarding_complete && onboardingRoute) redirect('/train')

  return (profile as GuardedProfile | null) ?? null
}

/** `ui_flags` is `jsonb`, so anything could be in the column. */
function readFlags(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

/**
 * The first step this person has not answered.
 *
 * `active_track` cannot be the marker for step one — the column carries a
 * default, so it is set for everybody before they have chosen anything. The
 * step stamps a `ui_flags` key instead, which is the pattern the profile
 * already uses for one-time beats: adding the next one is a string rather than
 * a migration.
 */
export function onboardingResumePath(profile: { focus_area: string | null; ui_flags: unknown } | null): string {
  if (!profile) return '/onboarding/track'
  const flags = readFlags(profile.ui_flags)
  if (!flags[ONBOARDING_TRACK_FLAG]) return '/onboarding/track'
  if (!profile.focus_area) return '/onboarding/focus'
  // Same problem as step one, for the opposite reason: `display_name` can be
  // legitimately empty, because the name step is skippable. A flag is what
  // separates "not asked yet" from "asked, and they would rather not say".
  if (!flags[ONBOARDING_NAME_FLAG]) return '/onboarding/name'
  return '/onboarding/mic'
}

/**
 * The three flag names, which now live in `lib/data/ui-flags.ts`.
 *
 * They were declared here and this file is `server-only`, which was fine while
 * the guard and a Server Action were the only readers. `/start` asks the same
 * three questions in the browser before an account exists, and has to know
 * what each answer will become — so the names moved to the registry that
 * exists for exactly this ("a `'use server'` module may only export async
 * functions"), and are re-exported here so every importer is unchanged.
 */
export { ONBOARDING_DEFERRED_FLAG, ONBOARDING_NAME_FLAG, ONBOARDING_TRACK_FLAG } from './ui-flags'
