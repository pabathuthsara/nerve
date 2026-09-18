'use client'

/**
 * The Meta Pixel, and the only file that knows the ad platform exists.
 *
 * Same contract as `components/analytics.tsx` and `instrumentation-client.ts`:
 * **no id, no network traffic.** That keeps development, CI and any unkeyed
 * deployment silent, and it keeps the landing page — which §14 has a
 * merchant-of-record reviewer opening — free of an ad script it has no use
 * for until somebody turns it on deliberately.
 *
 * It is `afterInteractive`, not `beforeInteractive`. The page's own paint is
 * 494ms cold and an ad pixel does not get to be in front of it.
 *
 * ── WHY THIS IS NOT ROUTED THROUGH `capture()` ───────────────────────────
 *
 * `lib/analytics/events.ts` is the product's funnel, typed against a closed
 * union, redacted by `safeProps`, and read by us to decide what to build. This
 * is an advertising optimiser's training signal, read by Meta to decide who to
 * show an ad to. They answer different questions and they must be able to
 * diverge: the day the pixel is switched off, the funnel has to keep counting.
 *
 * One rule they do share, and it is the one that matters: **nothing here may
 * ever reach the user.** §05's reasoning about moderation failing open applies
 * to instrumentation failing silent, so every call into `fbq` is wrapped.
 */

import Script from 'next/script'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

const ID = process.env.NEXT_PUBLIC_META_PIXEL_ID

declare global {
  interface Window { fbq?: (...args: unknown[]) => void }
}

/**
 * Fire a standard event. No-ops when the pixel is not keyed, which is every
 * environment but production until somebody sets the variable.
 *
 * Standard events only, by convention rather than by type: Meta's optimiser
 * has priors on them and a custom event with three conversions a week never
 * leaves the learning phase. A custom one borrows nothing.
 */
export function metaTrack(event: string, props?: Record<string, unknown>): void {
  try {
    window.fbq?.('track', event, props)
  } catch {
    // Never user-facing. An ad blocker eating the script is the common case.
  }
}

export function MetaPixel() {
  const pathname = usePathname()

  /**
   * The App Router does no document load between screens, so the snippet's own
   * `PageView` fires once and never again — the same reason `analytics.tsx`
   * sets `capture_pageview: false` and drives its own.
   *
   * It runs on the first pathname too, which double-counts that one view
   * against the snippet's own call. That is deliberate: Meta deduplicates
   * `PageView` within a short window, and the alternative — skipping the first
   * effect — loses the view entirely whenever the script is slow, which is the
   * case that matters on a cold ad click.
   */
  useEffect(() => {
    if (ID) metaTrack('PageView')
  }, [pathname])

  if (!ID) return null
  return (
    <Script id="meta-pixel" strategy="afterInteractive">{`
      !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
      n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
      document,'script','https://connect.facebook.net/en_US/fbevents.js');
      fbq('init','${ID}');
    `}</Script>
  )
}
