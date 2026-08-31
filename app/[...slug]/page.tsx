import { isAuthRoute, isBillingRoute, isOnboardingRoute, RouteView, type AuthContext } from '@/components/route-view'
import type { OnboardingContext } from '@/components/screens/onboarding-screens'
import { enforceFrontendGuard, ONBOARDING_TRACK_FLAG, onboardingResumePath, type GuardedProfile } from '@/lib/data/guards'
import { fetchFirstRepCandidates } from '@/lib/data/first-rep'
import { uiLevel } from '@/lib/data/progression'
import { currentUser } from '@/lib/db/server'
import { checkoutConfigured } from '@/lib/billing/plans'
import type { FocusArea } from '@/lib/data/focus'
import type { Track } from '@/lib/data/types'

async function authContext(path: string): Promise<AuthContext> {
  return {
    recoverySession: path === '/reset-password' ? !!(await currentUser()) : false,
    devLoginEmail:
      process.env.NODE_ENV !== 'production' && process.env.DEV_LOGIN_EMAIL && process.env.DEV_LOGIN_PASSWORD
        ? process.env.DEV_LOGIN_EMAIL
        : null,
  }
}

const TRACKS: readonly Track[] = ['dating', 'interview']
const FOCUS_AREAS: readonly FocusArea[] = ['opening', 'sustaining', 'flirting', 'rejection']

/**
 * Everything the onboarding run needs that only the server can answer.
 *
 * Built from the row the guard has already read, not from a second select:
 * the guard is the one read on this path that is not optional, so it carries
 * the answer rather than being asked the same question twice.
 *
 * The roster is the one extra query, and it is unconditional. The run is a
 * single client component, so the mic step and the ready step are reached
 * without another request — fetching it only on the routes that draw it would
 * mean it was missing for everybody who started at the first question, which
 * is everybody.
 *
 * The age gate never renders any of this. It is a gate rather than a step, it
 * is reached by accounts that finished the run months ago, and the guard has
 * already sent them here before a roster could be relevant.
 */
async function onboardingContext(path: string, profile: GuardedProfile | null): Promise<OnboardingContext> {
  const currentLevel = uiLevel(profile?.current_level ?? 1)
  /**
   * `active_track` is only an answer once the step that writes it says so.
   * The column carries a database default, so reading it directly opened the
   * first question with "Talking to people I'm attracted to" already selected
   * for somebody who had chosen nothing — the same trap `onboardingResumePath`
   * has a flag to avoid, sprung one screen further along.
   */
  const flags = profile?.ui_flags && typeof profile.ui_flags === 'object' && !Array.isArray(profile.ui_flags)
    ? (profile.ui_flags as Record<string, unknown>)
    : {}
  const answeredTrack = !!flags[ONBOARDING_TRACK_FLAG]
  return {
    track: answeredTrack ? TRACKS.find((value) => value === profile?.active_track) ?? null : null,
    focusArea: FOCUS_AREAS.find((value) => value === profile?.focus_area) ?? null,
    displayName: profile?.display_name?.trim() || null,
    currentLevel,
    resumeRoute: onboardingResumePath(profile) as OnboardingContext['resumeRoute'],
    roster: path === '/onboarding/age' ? [] : await fetchFirstRepCandidates(currentLevel),
  }
}

export default async function FrontendRoute({ params, searchParams }: { params: Promise<{ slug: string[] }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params
  const path = `/${slug.join('/')}`
  const profile = await enforceFrontendGuard(path)
  const raw = await searchParams
  const query = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]))
  return (
    <RouteView
      path={path}
      query={query}
      auth={isAuthRoute(path) ? await authContext(path) : undefined}
      onboarding={isOnboardingRoute(path) ? await onboardingContext(path, profile) : undefined}
      billing={isBillingRoute(path) ? { checkoutOpen: checkoutConfigured() } : undefined}
    />
  )
}
