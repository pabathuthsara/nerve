/**
 * Which routes wear the app chrome, and which are bare.
 *
 * ── WHY THIS IS ITS OWN MODULE ───────────────────────────────────────────
 *
 * The route table lives in `components/route-view.tsx`, which is a SERVER
 * component that imports every screen in the product. `ShellFrame` is a client
 * component and needs the same answer, and importing it from there would drag
 * the entire screen graph into the client bundle.
 *
 * So the three predicates live here, in a module with no imports at all, and
 * `route-view.tsx` re-exports the two it already published. One source of truth
 * for what a path is, reachable from both sides of the boundary.
 */

export type AuthRoute =
  | '/login'
  | '/signup'
  | '/verify-email'
  | '/forgot-password'
  | '/reset-password'

export type OnboardingRoute =
  | '/onboarding/age'
  | '/onboarding/track'
  | '/onboarding/focus'
  | '/onboarding/name'
  | '/onboarding/mic'
  | '/onboarding/ready'

const AUTH_ROUTES = new Set<string>([
  '/login', '/signup', '/verify-email', '/forgot-password', '/reset-password',
])

const ONBOARDING_ROUTES = new Set<string>([
  '/onboarding/age', '/onboarding/track', '/onboarding/focus',
  '/onboarding/name', '/onboarding/mic', '/onboarding/ready',
])

export function isAuthRoute(path: string): boolean {
  return AUTH_ROUTES.has(path)
}

export function isOnboardingRoute(path: string): boolean {
  return ONBOARDING_ROUTES.has(path)
}

/**
 * The sections that render inside the rail, the tab bar and the track switcher.
 *
 * A PREFIX LIST rather than an exhaustive route table, because the chrome is a
 * property of the SECTION and every child of a section wears it — `/roster/maya`
 * and `/progress/week/2026-09-07` are as shelled as their parents.
 *
 * `/rep` and `/interview/rep` are deliberately absent. A live rep is full
 * screen: §05 allows a timer, a waveform and the mission and nothing else, and
 * a navigation rail down the side of it is exactly the "nothing else".
 */
const SHELLED_PREFIXES: readonly string[] = [
  '/train',
  '/roster',
  '/field',
  '/library',
  '/progress',
  '/profile',
  '/session',
  '/interview',
  '/texting',
]

export function isShelledRoute(path: string): boolean {
  if (isAuthRoute(path) || isOnboardingRoute(path)) return false
  // A live rep is the one place inside a section that takes the chrome off.
  if (path.startsWith('/rep/') || path.startsWith('/interview/rep/')) return false
  return SHELLED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

/**
 * The mobile top bar's label, for the moment before the user loads.
 *
 * Only ever shown while `useUserState` is still resolving — once there is a
 * user the bar carries the track switcher instead. It used to be a prop each
 * screen passed to its own `AppShell`; with the chrome hoisted into a layout
 * there is no screen to ask, so it is derived from the path.
 */
const TITLES: readonly [string, string][] = [
  ['/train', 'Train'],
  ['/roster', 'Roster'],
  ['/field', 'Field'],
  ['/library', 'Library'],
  ['/progress/baseline', 'Then and now'],
  ['/progress/week', 'Weekly review'],
  ['/progress', 'Progress'],
  ['/profile/history', 'History'],
  ['/profile/settings', 'Settings'],
  ['/profile/subscription', 'Subscription'],
  ['/profile', 'Profile'],
  ['/session', 'Session'],
  ['/interview/credits', 'Interview credits'],
  ['/interview/setup', 'Interview setup'],
  ['/interview/interviewers', 'Interviewers'],
  ['/interview', 'Interview'],
  ['/texting', 'Texting'],
]

export function shellTitleFor(path: string): string {
  for (const [prefix, title] of TITLES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return title
  }
  return 'Nerve'
}
