'use client'

import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui'

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="error-page"><AlertTriangle size={36} strokeWidth={1.5} className="amber" /><h1 className="display-lg">Something broke</h1><p className="data">{error.message || error.digest || 'Unknown error'}</p><div className="error-actions"><Button onClick={reset}>Try again</Button><Link className="arena-button arena-button--ghost" href="/train">Go home</Link></div></main>
}

