'use client'

/**
 * Asking for a share card (§08, §18).
 *
 * **Opt-in, per card, every time.** Nothing in the product mints one on its
 * own — this button is the only path, so an artefact only exists because
 * somebody pressed something. That is the difference between a share feature
 * and publishing on a user's behalf.
 *
 * The card is made server-side and the link is handed back. Copying it to the
 * clipboard is a convenience; the link is shown either way, because a
 * clipboard write that silently fails would leave the user thinking they had
 * something they do not.
 */

import { useState } from 'react'
import { Share2 } from 'lucide-react'
import { shareCard } from '@/app/share/actions'
import type { ShareCardKind } from '@/lib/share/cards'
import { Button, useToast } from '@/components/ui'

export function ShareButton({
  kind,
  sessionId,
  label = 'Make a card',
  size = 'sm',
}: {
  kind: ShareCardKind
  sessionId?: string
  label?: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [href, setHref] = useState<string | null>(null)

  const make = () => {
    setBusy(true)
    void shareCard({ kind, ...(sessionId ? { sessionId } : {}) })
      .then((result) => {
        if (!result.ok || !result.href) {
          toast.push(result.message ?? 'That card could not be made.', 'red')
          return
        }
        setHref(result.href)
        const url = `${window.location.origin}${result.href}`
        // Best-effort. The link is rendered regardless.
        void navigator.clipboard?.writeText(url).catch(() => undefined)
        toast.push('Card made. Link copied.', 'volt')
      })
      .catch(() => toast.push('That card could not be made.', 'red'))
      .finally(() => setBusy(false))
  }

  if (href) {
    return <a className="share-link label" href={href} target="_blank" rel="noreferrer">Your card · open it</a>
  }

  return <Button size={size} variant="secondary" disabled={busy} onClick={make}><Share2 size={15} strokeWidth={1.5} /> {label}</Button>
}
