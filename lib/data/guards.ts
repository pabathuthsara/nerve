import 'server-only'

import { redirect } from 'next/navigation'
import { currentUser, supabaseServer } from '@/lib/db/server'

const protectedPrefixes = ['/train', '/roster', '/field', '/profile', '/rep', '/session', '/interview', '/onboarding']

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
    .select('onboarding_complete')
    .eq('id', user.id)
    .maybeSingle()

  const onboardingRoute = path === '/onboarding' || path.startsWith('/onboarding/')

  // A missing profile row means the sign-up trigger has not landed yet. Send
  // them through onboarding rather than into a rep against nothing.
  if (!profile?.onboarding_complete && !onboardingRoute) redirect('/onboarding/track')
  if (profile?.onboarding_complete && onboardingRoute) redirect('/train')
}
