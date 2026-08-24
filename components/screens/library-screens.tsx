'use client'

/**
 * The library (§10 D, §11 `/library`).
 *
 * Fourteen hand-written cards have been sitting in the `techniques` table with
 * nothing to read them since M3's content pass. This is the surface, and the
 * two links §07 promises: the scorecard names your weakest sub-scores, and each
 * one has to lead somewhere.
 *
 * Grouped by the sub-score it improves rather than by kind, because that is the
 * question somebody arrives with. Nobody opens this wanting "an opener"; they
 * open it having just scored 42 on signal reading.
 */

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { useLibrary, useLibraryCard } from '@/lib/data'
import type { LibraryCard } from '@/lib/data/types'
import { AppShell } from '@/components/app-shell'
import { Card, Chip, EmptyState, Skeleton } from '@/components/ui'
import { SUB_SCORE_LABELS } from '@/lib/data/scorecard'

/** The six, in §07's own order, so the library reads like the scorecard does. */
const GROUPS: { key: string; title: string; blurb: string }[] = [
  { key: 'opening', title: 'Opening', blurb: 'Getting a conversation started at all.' },
  { key: 'curiosity', title: 'Curiosity', blurb: 'Asking about her, and going past the first answer.' },
  { key: 'listening', title: 'Listening', blurb: 'Using what she actually gave you.' },
  { key: 'signalReading', title: 'Signal reading', blurb: 'Reading her interest correctly, and adjusting.' },
  { key: 'composure', title: 'Composure', blurb: 'Staying steady. Recovering counts for more than never wobbling.' },
  { key: 'close', title: 'Close', blurb: 'How it ends — including when the answer is no.' },
]

export function LibraryScreen() {
  const { data: cards, loading } = useLibrary()

  if (loading) {
    return <AppShell title="Library"><div className="library-grid">{[1, 2, 3, 4].map((n) => <Skeleton key={n} height={132} />)}</div></AppShell>
  }

  // Seeded content, so an empty list means `npm run db:content` has not run
  // rather than that the user has nothing yet. Say the true thing.
  if (cards.length === 0) {
    return <AppShell title="Library"><EmptyState title="The library is empty" description="Technique cards are authored in the repo and seeded. None have reached this database yet." /></AppShell>
  }

  return (
    <AppShell title="Library">
      <div className="screen-heading">
        <span className="label">Technique</span>
        <h1 className="display-lg">Library</h1>
        <p>Grouped by the score it moves. Start with whatever the last scorecard told you.</p>
      </div>
      <div className="library-stack">
        {GROUPS.map((group) => {
          const matching = cards.filter((card) => card.targets.includes(group.key))
          if (matching.length === 0) return null
          return (
            <section key={group.key} className="library-group">
              <div className="library-group__head">
                <h2 className="display-md">{group.title}</h2>
                <p>{group.blurb}</p>
              </div>
              <div className="library-grid">
                {matching.map((card) => <CardTile key={card.slug} card={card} />)}
              </div>
            </section>
          )
        })}
      </div>
    </AppShell>
  )
}

function CardTile({ card }: { card: LibraryCard }) {
  return (
    <Link href={`/library/${card.slug}`} className="library-tile">
      <Card>
        <span className="label">{KIND_LABELS[card.kind]}{card.setting ? ` · ${card.setting}` : ''}</span>
        <strong className="display-sm">{card.title}</strong>
        <p>{card.summary}</p>
      </Card>
    </Link>
  )
}

const KIND_LABELS: Record<LibraryCard['kind'], string> = {
  technique: 'Technique',
  opener: 'Openers',
  ladder: 'Ladder',
  recovery: 'Recovery',
  exit: 'Exit',
}

export function LibraryCardScreen({ slug }: { slug: string }) {
  const { data: card, loading } = useLibraryCard(slug)

  if (loading) return <AppShell title="Library"><Skeleton height={420} /></AppShell>
  if (!card) {
    return <AppShell title="Library"><EmptyState title="No such card" description="This technique is not in the library." action={<Link className="arena-button arena-button--primary" href="/library">Back to the library</Link>} /></AppShell>
  }

  return (
    <AppShell title={card.title}>
      <div className="library-detail">
        <Link href="/library" className="label volt-link library-detail__back"><ArrowLeft size={14} strokeWidth={1.6} /> Library</Link>
        <div className="screen-heading">
          <span className="label">{KIND_LABELS[card.kind]}{card.setting ? ` · ${card.setting}` : ''}</span>
          <h1 className="display-lg">{card.title}</h1>
          <p>{card.summary}</p>
        </div>
        <div className="chip-row">
          {card.targets.map((target) => <Chip key={target}>{SUB_SCORE_LABELS[target] ?? target}</Chip>)}
        </div>
        {/* Authored as paragraphs separated by a blank line, so that is what is
            rendered. No markdown parser for two paragraphs of hand-written prose. */}
        <div className="library-body">
          {card.body.split('\n\n').map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        </div>
        {card.examples.length > 0 ? (
          <section className="library-examples">
            <h2 className="display-md">Examples</h2>
            {/* Examples, never scripts to memorise — which is why they are set
                as quotes rather than as a numbered list to work through. */}
            <ul>{card.examples.map((example, index) => <li key={index}>{example}</li>)}</ul>
          </section>
        ) : null}
        {card.drill ? (
          <section>
            <h2 className="display-md">The drill</h2>
            <Card className="try-next"><p>{card.drill}</p></Card>
            <Link className="arena-button arena-button--primary" href="/train" style={{ marginTop: 12 }}>Run a rep</Link>
          </section>
        ) : null}
      </div>
    </AppShell>
  )
}
