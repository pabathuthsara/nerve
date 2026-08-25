import { redirect } from 'next/navigation'
import { currentUser, supabaseServer } from '@/lib/db/server'
import { onboardingResumePath } from '@/lib/data/guards'

export const dynamic = 'force-dynamic'

/**
 * The single place that decides where a signed-in person lands. Every auth
 * action redirects to `/` rather than guessing for itself, so "finished
 * onboarding?" is answered once, from the profile row, and not four times
 * from four different assumptions.
 */
export default async function Home() {
  const user = await currentUser()
  if (!user) redirect('/login')

  const supabase = await supabaseServer()
  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_complete, focus_area, experience, ui_flags')
    .eq('id', user.id)
    .maybeSingle()

  // Resumed, not restarted. This is the entry point every auth action lands on,
  // so sending an unfinished account to step one here undid the whole point of
  // writing each answer as it is given.
  redirect(profile?.onboarding_complete ? '/train' : onboardingResumePath(profile))
}
