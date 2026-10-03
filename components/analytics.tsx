'use client'

/**
 * The only file in the app that imports `posthog-js`.
 *
 * Same shape as the rule in `lib/voice/provider.ts`, and for the same reason:
 * a vendor gets one seam, so swapping it or turning it off is one edit rather
 * than a search. Everything else calls `capture()`, which is typed against
 * `lib/analytics/events.ts`.
 *
 * ── IT IS OFF UNTIL IT IS KEYED, AND IT IS NOT IN THE CRITICAL PATH ──────
 *
 * The import is dynamic, inside the key check. Two consequences, both wanted:
 *
 *   unkeyed   nothing is fetched at all. That is development, CI, and any
 *             deployment where `NEXT_PUBLIC_POSTHOG_KEY` is blank — so
 *             installing the package changed nobody's network traffic.
 *   keyed     the SDK arrives in its own chunk after hydration rather than in
 *             the first-load bundle. A static import put ~70 kB in front of
 *             every page including the landing page, which §14 has a
 *             merchant-of-record reviewer opening and which has no use for an
 *             analytics SDK before it paints.
 *
 * Events raised before the SDK lands are queued, not dropped — `brief_viewed`
 * fires within a few hundred milliseconds of a cold load and it is the top of
 * the funnel, so losing it would bend the one measurement this exists for.
 *
 * ── NOTHING HERE MAY BREAK A REP ─────────────────────────────────────────
 *
 * §05 does not allow a vendor to end a live conversation, and the same
 * reasoning that makes moderation fail open makes instrumentation fail silent.
 * Every call into the SDK is wrapped. An analytics outage, a blocked request,
 * an ad blocker eating the script — none of them reach the user.
 */

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import type { PostHog } from 'posthog-js'
import { safeProps, sessionReplayAllowed, type EventProps, type FunnelEvent, type PersonTraits } from '@/lib/analytics/events'

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com'

let client: PostHog | null = null
let loading = false

/**
 * What was raised before the SDK finished loading.
 *
 * Bounded, because an unbounded queue on a page whose analytics never arrive
 * is a memory leak that grows for as long as somebody stays. Twenty is far
 * more than the handful of events a cold load can produce.
 */
const pending: Array<(posthog: PostHog) => void> = []

function enqueue(work: (posthog: PostHog) => void): void {
  if (client) {
    try {
      work(client)
    } catch {
      // Deliberately empty. An analytics failure is not a user-facing event.
    }
    return
  }
  if (!KEY) return
  if (pending.length < 20) pending.push(work)
}

async function load(): Promise<void> {
  if (!KEY || client || loading) return
  loading = true
  try {
    const { default: posthog } = await import('posthog-js')
    posthog.init(KEY, {
      api_host: HOST,
      // Pageviews are sent by the effect below instead. The App Router does
      // not do a document load between screens, so the automatic one fires
      // once and then never again.
      capture_pageview: false,
      capture_pageleave: true,
      // Replay is started per-route below, never on init — the default is off
      // so that a route this file has not considered gets the safe answer
      // rather than the convenient one.
      disable_session_recording: true,
      persistence: 'localStorage+cookie',
    })
    client = posthog
    for (const work of pending.splice(0)) {
      try {
        work(posthog)
      } catch {
        // As above.
      }
    }
  } catch {
    // The chunk failed to load, or an extension blocked it. Nothing is owed.
    pending.length = 0
  }
}

/**
 * Record one funnel step.
 *
 * Typed against the catalogue, so a call site cannot invent an event name or
 * forget a property, and routed through `safeProps`, so it cannot smuggle a
 * transcript turn out with one.
 */
export function capture<E extends FunnelEvent>(event: E, props: EventProps[E]): void {
  // Redacted at the call site rather than on flush: `safeProps` throws in
  // development, and it has to throw where the stack still names the component
  // that passed the offending property.
  const safe = safeProps(props as Record<string, unknown>)
  enqueue((posthog) => posthog.capture(event, safe))
}

/**
 * Tie the events to a person, which is the only reason cohorts work.
 *
 * D7 and W4 are computed by PostHog from an identified person plus any
 * activity. M5's gate — *week-4 retention above 25% among users who did three
 * or more reps* — gets its second half from the event stream rather than from
 * a trait here; see the note on `PersonTraits`.
 */
export function identifyPerson(userId: string, traits: PersonTraits): void {
  const safe = safeProps(traits as unknown as Record<string, unknown>)
  enqueue((posthog) => posthog.identify(userId, safe))
}

/** On sign-out, so the next person on a shared device is not the last one. */
export function resetPerson(): void {
  enqueue((posthog) => posthog.reset())
}

/**
 * The first-party page count, alongside the vendor one.
 *
 * `/admin` sends nothing: an operator refreshing their own dashboard would
 * otherwise be the largest source of traffic on it, and a number that counts
 * the person reading it is not a number.
 *
 * `sendBeacon` rather than `fetch`, because a landing-page visitor who reads
 * the hero and leaves is exactly the arrival worth counting, and a normal fetch
 * is cancelled when the document goes away. It fails silently and returns
 * false when the queue is full; `keepalive` is the fallback for the browsers
 * that have no beacon. Neither path is awaited and neither can throw into a
 * render — §05's rule about vendors, applied to our own endpoint.
 */
function countPageView(pathname: string, step?: string): void {
  if (pathname.startsWith('/admin')) return
  // A dev server talks to the production project, so a local walk-through
  // would otherwise be counted as a visitor from Sri Lanka on a desktop.
  if (LOCAL_HOST.test(window.location.hostname)) return
  // An automated browser — the ad platforms' review crawlers run JavaScript
  // with ordinary-looking user agents, and about 28 of them were counted as
  // `utm_source=meta` visitors in the three minutes after the ads were
  // created (3 October 2026). No person's browser sets this.
  if (navigator.webdriver) return
  try {
    const { source, content } = campaignTag()
    const body = JSON.stringify({
      path: pathname,
      ref: document.referrer || null,
      ...(step ? { step } : {}),
      ...(source ? { source } : {}),
      ...(content ? { content } : {}),
    })
    if (navigator.sendBeacon?.(POST_PATH, new Blob([body], { type: 'application/json' }))) return
    void fetch(POST_PATH, {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json' },
      keepalive: true,
    }).catch(() => {})
  } catch {
    // As everywhere else in this file: instrumentation never reaches the user.
  }
}

const POST_PATH = '/api/pageview'

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|.*\.local)$/

const TAG_KEY = 'nerve:utm'

/**
 * The link's campaign tag, first touch within the tab (START-AUDIT §1.6).
 *
 * Read off the address bar on the view that carried it and kept in
 * `sessionStorage`, so the four `/start` screens after the first — which never
 * touch the URL — still say which post they came from. Session-scoped for the
 * same reason the run's answers are: privacy clause 07 promises no tracking
 * cookie, and this is not one. It never leaves the tab except inside the
 * beacon, and the server allow-lists it again (`normaliseTag`).
 */
export function campaignTag(): { source: string | null; content: string | null } {
  try {
    const params = new URLSearchParams(window.location.search)
    const source = params.get('utm_source')
    const content = params.get('utm_content')
    if (source) {
      const tag = { source, content }
      window.sessionStorage.setItem(TAG_KEY, JSON.stringify(tag))
      return tag
    }
    const stored = JSON.parse(window.sessionStorage.getItem(TAG_KEY) ?? 'null') as { source?: unknown; content?: unknown } | null
    return {
      source: typeof stored?.source === 'string' ? stored.source : null,
      content: typeof stored?.content === 'string' ? stored.content : null,
    }
  } catch {
    return { source: null, content: null }
  }
}

/**
 * A screen inside `/start`, counted as its own view.
 *
 * The run is eight screens behind one URL — the step lives in React state and
 * the address bar never moves — so the traffic table saw `/start` once and
 * the per-step drop, which is the number D21 exists to get, was invisible to
 * everything except PostHog. PostHog has never been keyed.
 *
 * Exported rather than wired into the pathname effect because nothing outside
 * the run knows a step has changed. It is the same beacon, with one more
 * field, and it fails silent exactly as the rest of this file does.
 */
export function countStartStep(step: string): void {
  countPageView('/start', step)
}

/**
 * A beat in the run AFTER the account exists (3 October 2026): the
 * microphone prompt, the permission, the level, the brief and the Start
 * press — `ONBOARDING_STEP_NAMES` in `lib/analytics/pageview.ts`.
 *
 * Nothing could say where a new account stopped before its first rep; the
 * funnel ended at the form. Same beacon, path `/onboarding`, and the row
 * carries the signed-in user, so the admin funnel can read
 * `signup → mic_intro → … → rep_started` straight after `/start`'s rows.
 */
export function countOnboardingStep(step: 'mic_intro' | 'mic_granted' | 'mic_good' | 'brief' | 'rep_started'): void {
  countPageView('/onboarding', step)
}



export function Analytics() {
  const pathname = usePathname()

  useEffect(() => {
    void load()
  }, [])

  useEffect(() => {
    if (!pathname) return
    countPageView(pathname)
    enqueue((posthog) => {
      posthog.capture('$pageview', { $current_url: window.location.origin + pathname })
      // The §04 rule, applied on every navigation rather than once at startup:
      // a client-side route change into a live rep has to stop a recording that
      // was legitimately running on the screen before it.
      if (sessionReplayAllowed(pathname)) posthog.startSessionRecording()
      else posthog.stopSessionRecording()
    })
  }, [pathname])

  return null
}
