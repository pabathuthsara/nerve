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

export function Analytics() {
  const pathname = usePathname()

  useEffect(() => {
    void load()
  }, [])

  useEffect(() => {
    if (!pathname) return
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
