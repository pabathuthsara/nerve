import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import './globals.css'
import { displayFont, monoFont, sansFont } from '@/lib/fonts'
import { ProductProvider } from '@/components/product-provider'
import { ToastProvider } from '@/components/ui'
import { Analytics } from '@/components/analytics'
import { SITE_ORIGIN } from '@/lib/site/origin'

export const metadata: Metadata = {
  // Resolves the relative `/og.png` below. It used to fall back to localhost,
  // which published link previews nobody outside this machine could load —
  // see the note in `lib/site/origin.ts`.
  metadataBase: new URL(SITE_ORIGIN),
  title: { default: 'NERVE — Conversation training', template: '%s · NERVE' },
  description: 'Timed voice reps for conversations that matter.',
  openGraph: {
    title: 'NERVE — Conversation training',
    description: 'Practice the conversations you usually avoid.',
    type: 'website',
    images: [{ url: '/og.png', width: 1731, height: 909, alt: 'NERVE — Practice the conversations you usually avoid.' }],
  },
  twitter: { card: 'summary_large_image', title: 'NERVE — Conversation training', description: 'Practice the conversations you usually avoid.', images: ['/og.png'] },
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
      <body><ProductProvider><ToastProvider>{children}</ToastProvider><Analytics /></ProductProvider></body>
    </html>
  )
}
