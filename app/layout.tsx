import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'
import { displayFont, monoFont, sansFont } from '@/lib/fonts'
import { ProductProvider } from '@/components/product-provider'
import { ToastProvider } from '@/components/ui'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${displayFont.variable} ${sansFont.variable} ${monoFont.variable}`}>
      <body><ProductProvider><ToastProvider>{children}</ToastProvider></ProductProvider></body>
    </html>
  )
}
