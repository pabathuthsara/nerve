'use client'

/**
 * The TikTok pixel — `components/meta-pixel.tsx`'s twin, for the platform most
 * of this product's paid and organic traffic actually comes from
 * (START-AUDIT §1.6). TikTok ads were run in September with nothing on the
 * page to tell TikTok's optimiser that anybody had done anything.
 *
 * The same contract, word for word: **no id, no network traffic.** Unkeyed —
 * every environment until somebody sets `NEXT_PUBLIC_TIKTOK_PIXEL_ID` — this
 * renders nothing and every call below is a no-op.
 *
 * **Before setting the id, read the privacy page.** Clause 07 currently says
 * there are no advertising or cross-site trackers on this site, which is true
 * only while both pixels are unkeyed. Keying either one is a change to what we
 * told people, and the page has to change in the same deploy.
 *
 * Standard events only (`ViewContent`, `CompleteRegistration`), for the same
 * reason the Meta file gives: the optimiser has priors on them.
 */

import Script from 'next/script'
import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'

const ID = process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID

interface Ttq {
  track: (event: string, props?: Record<string, unknown>) => void
  page: () => void
}

declare global {
  interface Window { ttq?: Ttq }
}

/** Fire a standard event. Silent when unkeyed or blocked. */
export function tiktokTrack(event: string, props?: Record<string, unknown>): void {
  try {
    window.ttq?.track(event, props)
  } catch {
    // Never user-facing. An ad blocker eating the script is the common case.
  }
}

export function TikTokPixel() {
  const pathname = usePathname()
  const first = useRef<string | null>(pathname)

  /**
   * Client-side navigations do no document load, so the snippet's own
   * `page()` fires once. This fires on every later pathname; the first is
   * the snippet's.
   */
  useEffect(() => {
    if (!ID || pathname === first.current) return
    first.current = null
    try { window.ttq?.page() } catch { /* see tiktokTrack */ }
  }, [pathname])

  if (!ID || !/^[A-Z0-9]{8,32}$/i.test(ID)) return null
  return (
    <Script id="tiktok-pixel" strategy="afterInteractive">{`
      !function (w, d, t) {
        w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=d.createElement("script");n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=d.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};
        ttq.load('${ID}');
        ttq.page();
      }(window, document, 'ttq');
    `}</Script>
  )
}
