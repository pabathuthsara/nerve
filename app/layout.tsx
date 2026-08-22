import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Nerve — M0 spike',
  description: 'Voice loop only. Latency and character stability.',
}

/**
 * Deliberately unstyled. M0 is "no UI worth the name" (§17) — the Arena design
 * system lands at M3 and building it now would only have to be rebuilt around
 * whichever provider wins the blind A/B.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'ui-monospace, monospace', margin: 0, padding: 24, lineHeight: 1.5 }}>
        {children}
      </body>
    </html>
  )
}
