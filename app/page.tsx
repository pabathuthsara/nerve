import { redirect } from 'next/navigation'
import { currentUser, supabaseServer } from '@/lib/db/server'

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
    .select('onboarding_complete')
    .eq('id', user.id)
    .maybeSingle()

  redirect(profile?.onboarding_complete ? '/train' : '/onboarding/track')
}
