import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import './globals.css'
import { displayFont, monoFont, sansFont } from '@/lib/fonts'
import { ProductProvider } from '@/components/product-provider'
import { ShellFrame } from '@/components/app-shell'
import { ToastProvider } from '@/components/ui'
import { Analytics } from '@/components/analytics'
import { MetaPixel } from '@/components/meta-pixel'
import { SITE_ORIGIN } from '@/lib/site/origin'

export const metadata: Metadata = {
  /**
   * Resolves the generated OG image below. It used to fall back to localhost,
   * which published link previews nobody outside this machine could load —
   * see the note in `lib/site/origin.ts`.
   */
  metadataBase: new URL(SITE_ORIGIN),
  title: { default: 'NERVE — Conversation training', template: '%s · NERVE' },
  description: 'Timed voice reps for conversations that matter.',
  /**
   * **No `images` key here, and that is what makes §4.9 work.**
   *
   * `app/opengraph-image.tsx` is a file convention: Next generates the tags
   * from it and applies them to every route that does not declare its own —
   * including `/start`, which the audit notes was inheriting a wordmark. An
   * explicit `images` array at this level OVERRIDES the convention, which is
   * how `/og.png` stayed on every card after the route existed. Adding one
   * back here silently reverts the change.
   */
  openGraph: {
    title: 'NERVE — Conversation training',
    description: 'Practice the conversations you usually avoid.',
    type: 'website',
  },
  twitter: { card: 'summary_large_image', title: 'NERVE — Conversation training', description: 'Practice the conversations you usually avoid.' },
}

/**
 * The phone's own chrome, in the product's colours.
 *
 * Without `themeColor` the browser paints its toolbar in default light chrome
 * directly above a `#0B0C0A` page, and that seam is the loudest "this is a
 * website, not an app" tell there is. The value is Ground from the Arena
 * palette; there is no light mode to give a second one to.
 *
 * `interactiveWidget: 'resizes-content'` makes the software keyboard shrink
 * the viewport rather than sliding it, which is what keeps a centred form from
 * jumping the moment somebody taps a field.
 */
export const viewport: Viewport = {
  themeColor: '#0B0C0A',
  colorScheme: 'dark',
  interactiveWidget: 'resizes-content',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${displayFont.variable} ${sansFont.variable} ${monoFont.variable}`}>
      {/*
        THE APP CHROME IS MOUNTED HERE, AND HERE IS THE ONLY PLACE IT CAN BE.

        It used to be rendered by each screen, and `RouteView` returns a
        different component type per path — so React unmounted the whole shell
        and mounted a fresh one on every navigation. `useAsync` has no
        cross-mount cache, so each new shell refetched the user state and the
        track switcher, the rep pill and the account row all dropped to
        skeletons and came back. Going from Field to Profile read as a full page
        reload because to the eye it was one.

        Moving it into `app/[...slug]/layout.tsx` did NOT fix that, and the
        reason is worth writing down: a layout under a DYNAMIC segment is a
        layout per param value. Changing the slug changes the segment instance,
        so Next remounted it exactly as before — measured at one fresh mount per
        navigation with a counter in the browser.

        The ROOT layout is the one that never remounts, whatever the URL does.
        `ShellFrame` reads the pathname and draws the chrome only on the
        sections that wear it, so `/`, the auth run, the onboarding run and a
        live rep are all still bare.
      */}
      <body><ProductProvider><ToastProvider><ShellFrame>{children}</ShellFrame></ToastProvider><Analytics /><MetaPixel /></ProductProvider></body>
    </html>
  )
}
