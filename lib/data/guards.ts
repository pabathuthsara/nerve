import 'server-only'

import { redirect } from 'next/navigation'
import { currentUser, supabaseServer } from '@/lib/db/server'

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

export async function enforceFrontendGuard(path: string) {
  const user = await currentUser()

  if (!user) {
    if (protectedPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) redirect('/login')
    return
  }

  if (authPages.includes(path)) redirect('/train')

  // The onboarding gate reads the profile rather than auth metadata: metadata
  // is user-writable through the auth API, and the answer to "has this person
  // finished onboarding" should not be one of the things they can set.
  const supabase = await supabaseServer()
  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_complete, unlocked_tracks, focus_area, experience, ui_flags')
    .eq('id', user.id)
    .maybeSingle()

  // The interview track is screens and fixtures: no interviewer characters, no
  // CV bucket, nothing writing `interview_setups`. Finishing it is M4-and-after
  // by §17's own ordering, and until then the nav already hides it — the track
  // switcher needs two unlocked tracks and every profile has one.
  //
  // What the nav could not do is stop somebody typing the URL, which opened a
  // door onto fixtures. `unlocked_tracks` was already the right gate; this is
  // what makes it real rather than cosmetic, and it is what will let the track
  // ship to a subset of accounts later without any of this changing.
  if (path === '/interview' || path.startsWith('/interview/')) {
    const tracks = profile?.unlocked_tracks ?? []
    if (!tracks.includes('interview')) redirect('/train')
  }

  const onboardingRoute = path === '/onboarding' || path.startsWith('/onboarding/')

  // A missing profile row means the sign-up trigger has not landed yet. Send
  // them through onboarding rather than into a rep against nothing.
  //
  // Sent to where they stopped, not back to the beginning. Every answer is
  // written the moment it is given, so restarting at step one asked people to
  // re-answer questions we already had — and made a refresh feel like losing
  // work when nothing had actually been lost.
  if (!profile?.onboarding_complete && !onboardingRoute) redirect(onboardingResumePath(profile))
  if (profile?.onboarding_complete && onboardingRoute) redirect('/train')
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
export function onboardingResumePath(profile: { focus_area: string | null; experience: string | null; ui_flags: unknown } | null): string {
  if (!profile) return '/onboarding/track'
  const flags = profile.ui_flags && typeof profile.ui_flags === 'object' && !Array.isArray(profile.ui_flags)
    ? (profile.ui_flags as Record<string, unknown>)
    : {}
  if (!flags[ONBOARDING_TRACK_FLAG]) return '/onboarding/track'
  if (!profile.focus_area) return '/onboarding/focus'
  if (!profile.experience) return '/onboarding/experience'
  // Same problem as step one, for the opposite reason: `display_name` can be
  // legitimately empty, because the name step is skippable. A flag is what
  // separates "not asked yet" from "asked, and they would rather not say".
  if (!flags[ONBOARDING_NAME_FLAG]) return '/onboarding/name'
  return '/onboarding/mic'
}

/** Stamped by the track step, read by the resume above. */
export const ONBOARDING_TRACK_FLAG = 'onboarding:track'

/** Stamped by the name step whether it was answered or skipped. */
export const ONBOARDING_NAME_FLAG = 'onboarding:name'
