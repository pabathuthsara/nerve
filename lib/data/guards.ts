import 'server-only'

import { redirect } from 'next/navigation'
import { currentUser, supabaseServer } from '@/lib/db/server'

const protectedPrefixes = ['/train', '/roster', '/field', '/library', '/progress', '/profile', '/rep', '/session', '/interview', '/onboarding']

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
    .select('onboarding_complete, unlocked_tracks')
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
  if (!profile?.onboarding_complete && !onboardingRoute) redirect('/onboarding/track')
  if (profile?.onboarding_complete && onboardingRoute) redirect('/train')
}
