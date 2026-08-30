import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { currentUser, supabaseServer } from '@/lib/db/server'
import { ONBOARDING_DEFERRED_FLAG, onboardingResumePath } from '@/lib/data/guards'
import { SitePage } from '@/components/site/site-chrome'
import { Landing } from '@/components/site/landing'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'NERVE — Practice the conversations you avoid',
  description:
    'A conversation gym. Timed voice reps against AI characters who can lose interest and say no, scored on how you talked rather than on whether it worked — then one small thing to do in the real world.',
  alternates: { canonical: '/' },
}

/**
 * The door, and the router behind it.
 *
 * Signed in, this is still the single place that decides where you land: every
 * auth action redirects to `/` rather than guessing for itself, so "finished
 * onboarding?" is answered once, from the profile row.
 *
 * Signed out, it used to redirect to `/login`, which meant nobody could find
 * out what this was without an account — and meant a merchant-of-record
 * reviewer opening the production URL was bounced to a password field with
 * nothing to read (§14, `LAUNCH-GAP.md` B1). It renders the landing page now.
 */
export default async function Home() {
  const user = await currentUser()
  if (!user) {
    return <SitePage className="site--landing"><Landing /></SitePage>
  }

  const supabase = await supabaseServer()
  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_complete, focus_area, ui_flags, age_confirmed_at')
    .eq('id', user.id)
    .maybeSingle()

  // Resumed, not restarted. This is the entry point every auth action lands on,
  // so sending an unfinished account to step one here undid the whole point of
  // writing each answer as it is given.
  //
  // A deferred run is not resumed from here. Somebody who took *Look around
  // first* asked to be let into the product; landing them back on the mic step
  // every time they sign in would be the trapdoor again, pointing the other
  // way. `/train` carries the row that offers the step back.
  const flags = profile?.ui_flags && typeof profile.ui_flags === 'object' && !Array.isArray(profile.ui_flags)
    ? (profile.ui_flags as Record<string, unknown>)
    : {}
  // §16.4 first, exactly as the route guard orders it. Without this, an account
  // with no date on file was sent to its resume step and bounced from there to
  // the gate — two redirects and a screen nobody was allowed to see, on every
  // sign-in until the date was given.
  if (!profile?.age_confirmed_at) redirect('/onboarding/age')

  const settled = profile.onboarding_complete || !!flags[ONBOARDING_DEFERRED_FLAG]
  redirect(settled ? '/train' : onboardingResumePath(profile))
}
