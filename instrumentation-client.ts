/**
 * Sentry, in the browser (§04, `LAUNCH-GAP.md` B7).
 *
 * Named `instrumentation-client.ts` rather than `sentry.client.config.ts`
 * because Next 15.3 made this the client entry point the framework loads
 * itself; the old filename is still honoured but is on its way out.
 *
 * Off until it is keyed, exactly like PostHog: no DSN means `init` is never
 * called and this file costs a conditional. That keeps development, CI and any
 * unkeyed deployment silent, and it means installing the package changed
 * nobody's network traffic until somebody turned it on deliberately.
 *
 * ── REPLAY IS NOT INSTALLED HERE AT ALL ──────────────────────────────────
 *
 * §04 says "session replay disabled on the live-session route for privacy".
 * PostHog already carries a per-route replay rule (`sessionReplayAllowed`), and
 * running a *second* recorder with a *second* set of route conditions is two
 * places to get the same privacy rule wrong. So Sentry records errors and not
 * pictures: no `replayIntegration`, nothing to switch off per route, and no
 * chance of a replay of a live rep reaching a second vendor because somebody
 * renamed a path.
 */

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

/**
 * Imported dynamically, inside the key check, for the same reason PostHog is
 * (`components/analytics.tsx`): a static import puts the SDK in the first-load
 * bundle of every page whether or not a DSN exists. Unkeyed, this fetches
 * nothing. Keyed, it costs the first moments after hydration — errors thrown
 * before then are missed, which is the accepted trade for not taxing the
 * landing page with an error reporter it will never use.
 */
if (dsn) {
  void import('@sentry/nextjs').then((Sentry) => Sentry.init({
    dsn,
    // A rep is three minutes of dense WebRTC activity. Full tracing on every
    // one of them buys detail nobody reads and a quota that runs out in a week.
    tracesSampleRate: 0.1,
    // Breadcrumbs carry whatever text the UI put on screen, and on the live
    // route that is a transcript. Off, for the same reason replay is.
    maxBreadcrumbs: 20,
    beforeBreadcrumb: (crumb) => (crumb.category === 'console' || crumb.category === 'ui.input' ? null : crumb),
    ignoreErrors: [
      // The user walked out of range or closed the laptop mid-rep. Not a bug,
      // and `ConnectionLostModal` is already the product's answer to it.
      'AbortError',
      'NetworkError when attempting to fetch resource',
      'The play() request was interrupted',
    ],
  }))
}
