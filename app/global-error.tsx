'use client'

import './globals.css'
import { displayFont, monoFont, sansFont } from '@/lib/fonts'

/**
 * The last screen the product has.
 *
 * `global-error` replaces the root layout outright — its own `<html>`, its own
 * `<body>` — which is why the stylesheet is imported here a second time.
 * `globals.css` was reachable from `app/layout.tsx` and nowhere else, so this
 * file asked for `.error-page` and `.arena-button` and got neither: a white
 * page in the browser's default serif, on a product that has no light mode.
 * The Arena ground and the font variables are the whole point of repeating the
 * import.
 *
 * The link is a plain anchor rather than `next/link`. Whatever failed to reach
 * this file may well be the router itself, and a full document load is the one
 * navigation that cannot depend on it.
 */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en" className={`${displayFont.variable} ${sansFont.variable} ${monoFont.variable}`}>
      <body>
        <main className="error-page">
          <span className="wordmark">NERVE</span>
          <h1 className="display-lg">Something broke</h1>
          <p>The page could not be drawn at all. Reloading usually clears it.</p>
          <div className="error-actions">
            <button className="arena-button arena-button--primary" onClick={reset}>Try again</button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages --
                deliberate, and the one place in the app where it is. `next/link`
                is a client-side navigation, and this boundary catches the case
                where the client-side app is the thing that failed. A full
                document load is the only way out that does not depend on what
                just broke. */}
            <a className="arena-button arena-button--ghost" href="/">Go home</a>
          </div>
        </main>
      </body>
    </html>
  )
}
