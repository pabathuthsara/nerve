'use client'

import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui'

/**
 * The route-level error screen.
 *
 * Two things it deliberately does not do.
 *
 * It does not print `error.message`. A server component's error reaches the
 * client already redacted to a digest, but the live rep is a client component
 * and anything thrown inside one arrives with its real text intact — provider
 * names, route paths, SDK phrasing — and this page is public. The digest is
 * shown instead when there is one: it is opaque, it is the handle support
 * needs to find the trace, and it is the only part of an error a visitor can
 * usefully carry.
 *
 * And `Go home` points at `/` rather than `/train`, for the reason spelled out
 * in `app/not-found.tsx`.
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="error-page">
      <AlertTriangle size={36} strokeWidth={1.5} className="amber" />
      <h1 className="display-lg">Something broke</h1>
      <p>That is on us, not on you. Try again — and if it keeps happening, send us the reference below.</p>
      {error.digest ? <p className="data">{error.digest}</p> : null}
      <div className="error-actions">
        <Button onClick={reset}>Try again</Button>
        <Link className="arena-button arena-button--ghost" href="/">Go home</Link>
      </div>
    </main>
  )
}
