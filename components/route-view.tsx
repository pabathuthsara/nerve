import { TrainScreen } from './screens/train-screen'
import { AuthScreen, type AuthRoute } from './screens/auth-screens'
import { OnboardingScreen, type OnboardingContext, type OnboardingRoute } from './screens/onboarding-screens'
import { FieldScreen, PersonaDetailScreen, RosterScreen } from './screens/core-screens'
import { LibraryCardScreen, LibraryScreen } from './screens/library-screens'
import { ProgressScreen, WeeklyReviewScreen } from './screens/progress-screens'
import { BaselineScreen } from './screens/baseline-screen'
import { ProfileScreen, type ProfileRoute } from './screens/profile-screens'
import { SessionScreen, type SessionView } from './screens/session-screens'
import { InterviewScreen, type InterviewRoute } from './screens/interview-screens'
import NotFound from '@/app/not-found'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'

const authRoutes = new Set<AuthRoute>(['/login', '/signup', '/verify-email', '/forgot-password', '/reset-password'])
const onboardingRoutes = new Set<OnboardingRoute>(['/onboarding/age', '/onboarding/track', '/onboarding/focus', '/onboarding/name', '/onboarding/mic', '/onboarding/ready'])
const sessionViews = new Set<SessionView>(['result', 'scorecard', 'transcript'])

/**
 * The shape a signed-out render gets. The guard redirects before this can be
 * reached in practice; it exists so the route table stays synchronous and
 * never has to reason about a missing prop.
 */
const EMPTY_ONBOARDING: OnboardingContext = { track: null, focusArea: null, displayName: null, roster: [], currentLevel: 1, resumeRoute: '/onboarding/track' }

/**
 * The two things an auth screen cannot answer for itself.
 *
 * `recoverySession` — a reset link is exchanged for a session by /auth/confirm
 * before /reset-password renders, so on that screen a session IS the token and
 * "expired" means there is no session.
 * `devLoginEmail` — an environment question, checked here to draw the control
 * and again inside `devSignIn` to allow it.
 */
export interface AuthContext {
  recoverySession: boolean
  devLoginEmail: string | null
}

export function isAuthRoute(path: string): boolean {
  return authRoutes.has(path as AuthRoute)
}

/**
 * Onboarding needs what only the server can answer, the same way an auth
 * screen does: the answers already on file, so a revisited question opens
 * answered, and the character the first rep is against, so the last screen
 * before that rep does not open on a skeleton.
 */
export function isOnboardingRoute(path: string): boolean {
  return onboardingRoutes.has(path as OnboardingRoute)
}

/**
 * The route table. A plain switch, deliberately synchronous: everything it
 * needs that only the server can answer arrives as a prop from the page, so
 * this file never awaits and never grows a data dependency of its own.
 */
export function RouteView({ path, query = {}, auth, onboarding }: { path: string; query?: Record<string, string | undefined>; auth?: AuthContext; onboarding?: OnboardingContext }) {
  if (path === '/train') return <TrainScreen />
  if (path === '/not-found') return <NotFound />
  if (path === '/error') return <main className="error-page"><AlertTriangle size={36} strokeWidth={1.5} className="amber" /><h1 className="display-lg">Something broke</h1><p className="data">DEMO_ERROR · The request could not be completed.</p><div className="error-actions"><Link className="arena-button arena-button--primary" href="/error">Try again</Link><Link className="arena-button arena-button--ghost" href="/train">Go home</Link></div></main>
  if (path === '/roster') return <RosterScreen />
  if (path.startsWith('/roster/')) return <PersonaDetailScreen personaId={path.split('/')[2] ?? ''} />
  if (path === '/field') return <FieldScreen />
  if (path === '/library') return <LibraryScreen />
  if (path.startsWith('/library/')) return <LibraryCardScreen slug={path.split('/')[2] ?? ''} />
  if (path === '/progress/baseline') return <BaselineScreen />
  if (path === '/progress') return <ProgressScreen />
  if (path.startsWith('/progress/week/')) return <WeeklyReviewScreen weekStart={path.split('/')[3] ?? ''} />
  if (path === '/profile' || path === '/profile/history' || path === '/profile/settings' || path === '/profile/subscription') return <ProfileScreen route={path as ProfileRoute} />
  if (path.startsWith('/session/')) {
    const [, , sessionId = '', view = 'result'] = path.split('/')
    if (!sessionViews.has(view as SessionView)) return <NotFound />
    return <SessionScreen sessionId={sessionId} view={view as SessionView} />
  }
  if (path === '/interview' || path === '/interview/setup/role' || path === '/interview/setup/cv' || path === '/interview/setup/questions' || path === '/interview/interviewers') return <InterviewScreen route={path as InterviewRoute} />
  if (authRoutes.has(path as AuthRoute)) {
    return <AuthScreen route={path as AuthRoute} query={query} recoverySession={auth?.recoverySession ?? false} devLoginEmail={auth?.devLoginEmail ?? null} />
  }
  if (onboardingRoutes.has(path as OnboardingRoute)) {
    return <OnboardingScreen route={path as OnboardingRoute} context={onboarding ?? EMPTY_ONBOARDING} />
  }
  return <NotFound />
}
