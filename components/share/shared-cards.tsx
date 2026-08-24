'use client'

/**
 * Everything this account has published, and the way to un-publish it (§08).
 *
 * A share feature without a revoke list is a share feature that takes things
 * away from people. A revoked card stops resolving and stays in this list
 * marked as revoked, because "I revoked that" is information the user is
 * entitled to keep — deleting the row would leave them wondering whether it
 * ever worked.
 */

import { useCallback, useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { listShareCards, revokeCard } from '@/app/share/actions'
import type { StoredCard } from '@/lib/db/share'
import { Button, useToast } from '@/components/ui'

const KIND_LABEL: Record<string, string> = {
  rejections: 'Rejections collected',
  weekly: 'Weekly review',
  streak: 'Streak',
  baseline: 'Then and now',
  rep_win: 'Level cleared',
}

export function SharedCards() {
  const toast = useToast()
  const [cards, setCards] = useState<StoredCard[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(() => {
    void listShareCards().then(setCards).catch(() => setCards([]))
  }, [])

  useEffect(load, [load])

  if (cards === null) return <p className="muted" style={{ margin: 0 }}>Loading what you have shared…</p>
  if (cards.length === 0) {
    return <p className="muted" style={{ margin: 0 }}>Nothing shared yet. Cards are made one at a time, only when you ask for one.</p>
  }

  const revoke = (token: string) => {
    setBusy(token)
    // Optimistic (§02 rule 8), and the honest direction to be optimistic in:
    // showing it revoked before the write lands cannot leave a live card
    // looking dead, only a dead one looking dead a moment early.
    setCards((current) => (current ?? []).map((card) =>
      card.token === token ? { ...card, revokedAt: new Date().toISOString() } : card))
    void revokeCard(token)
      .then((result) => {
        if (!result.ok) { toast.push('That card could not be revoked.', 'red'); load() }
        else toast.push('Revoked. The link is dead.', 'volt')
      })
      .catch(() => { toast.push('That card could not be revoked.', 'red'); load() })
      .finally(() => setBusy(null))
  }

  return <div className="shared-cards">{cards.map((card) => <div key={card.token} className="shared-card-row"><span><strong>{KIND_LABEL[card.kind] ?? card.kind}</strong><small>{card.card?.headline ?? ''} · {new Date(card.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</small></span>{card.revokedAt ? <span className="label mute">Revoked</span> : <span className="shared-card-row__actions"><a className="label volt-link" href={`/share/${card.token}`} target="_blank" rel="noreferrer">Open <ExternalLink size={12} strokeWidth={1.5} /></a><Button size="sm" variant="ghost" disabled={busy === card.token} onClick={() => revoke(card.token)}>Revoke</Button></span>}</div>)}</div>
}
