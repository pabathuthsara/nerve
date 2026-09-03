'use client'

/**
 * The library (§10 D, §11 `/library`).
 *
 * Fourteen hand-written cards have been sitting in the `techniques` table with
 * nothing to read them since M3's content pass. This is the surface, and the
 * two links §07 promises: the scorecard names your weakest sub-scores, and each
 * one has to lead somewhere.
 *
 * Four things this screen used not to do, all of them the same complaint —
 * the library was a dead end that never sent anybody back to the gym:
 *
 *   one card, one place   a card targeting two sub-scores was drawn in both
 *                         sections, which made fourteen cards feel like
 *                         eighteen and a small library feel padded
 *   read state            so a second visit is a shorter list than the first
 *   next / previous       inside the section, so reading two is one tap
 *   run a rep on this     the single most natural conversion in the product
 *
 * The grouping and the reading order are in `lib/techniques/grouping.ts`, so
 * they are content decisions with tests rather than layout in a component.
 */

import Link from 'next/link'
import { useEffect, useMemo, useRef } from 'react'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { useLibrary, useLibraryCard, useLibraryReads, usePersonas, useUserState } from '@/lib/data'
import type { LibraryCard, Persona } from '@/lib/data/types'
import { markUiFlag } from '@/app/profile/actions'
import { libraryReadFlag } from '@/lib/data/ui-flags'
import { personaForCard } from '@/lib/techniques/scenario'
import { groupLibrary } from '@/lib/techniques/grouping'
import { AppShell } from '@/components/app-shell'
import { Card, Chip, EmptyState, Skeleton } from '@/components/ui'
import { SUB_SCORE_LABELS } from '@/lib/data/scorecard'
import { capture } from '@/components/analytics'
import { Mark, dimensionMark, libraryKindMark } from '@/components/marks'

/**
 * Where this card was opened from, for B7's `technique_opened`.
 *
 * The referrer rather than a query parameter, because the links into here are
 * spread across the scorecard, the library index and the train screen, and a
 * parameter on each is four places to forget one. A same-origin referrer is
 * enough to tell the three apart and nothing else is read off it.
 */
function cameFrom(): 'library' | 'scorecard' | 'train' {
  try {
    const referrer = document.referrer
    if (!referrer || new URL(referrer).origin !== window.location.origin) return 'library'
    const path = new URL(referrer).pathname
    if (path.startsWith('/session/')) return 'scorecard'
    if (path.startsWith('/train')) return 'train'
    return 'library'
  } catch {
    return 'library'
  }
}

export function LibraryScreen() {
  const { data: cards, loading } = useLibrary()
  const { data: read } = useLibraryReads()
  const groups = useMemo(() => groupLibrary(cards), [cards])
  const unread = cards.length - cards.filter((card) => read.includes(card.slug)).length

  if (loading) {
    return <AppShell title="Library"><div className="library-grid">{[1, 2, 3, 4].map((n) => <Skeleton key={n} height={132} />)}</div></AppShell>
  }

  // Seeded content, so an empty list means `npm run db:content` has not run
  // rather than that the user has nothing yet. Say the true thing.
  if (cards.length === 0) {
    return <AppShell title="Library"><EmptyState mark="state-library" title="The library is empty" description="Technique cards are authored in the repo and seeded. None have reached this database yet." /></AppShell>
  }

  return (
    <AppShell title="Library">
      <div className="screen-heading">
        <span className="label">Technique</span>
        <h1 className="display-lg">Library</h1>
        <p>Grouped by the score it moves. Start with whatever the last scorecard told you.</p>
        {/* A count rather than a badge on every tile: fourteen cards is a
            reading list, and knowing how much of it is left is the only thing
            worth saying about progress through it. */}
        <span className="label mute">{unread === 0 ? 'You have read all of them.' : `${unread} of ${cards.length} still unread`}</span>
      </div>
      <div className="library-stack">
        {groups.map((group) => (
          <section key={group.key} className="library-group">
            {/* V28. The same six marks the scorecard uses, so a card
                recommended off a weak sub-score is visibly the same thing
                when the user arrives here. */}
            <div className="library-group__head">
              <Mark name={dimensionMark(group.key) ?? 'kind-technique'} size={20} />
              <div>
                <h2 className="display-md">{group.title}</h2>
                <p>{group.blurb}</p>
              </div>
            </div>
            <div className="library-grid">
              {group.cards.map((card) => <CardTile key={card.slug} card={card} read={read.includes(card.slug)} />)}
            </div>
          </section>
        ))}
      </div>
    </AppShell>
  )
}

function CardTile({ card, read }: { card: LibraryCard; read: boolean }) {
  return (
    <Link href={`/library/${card.slug}`} className={`library-tile${read ? ' library-tile--read' : ''}`}>
      <Card>
        <span className="library-tile__kind"><Mark name={libraryKindMark(card.kind)} size={16} muted={read} /><span className="label">{KIND_LABELS[card.kind]}{card.setting ? ` · ${card.setting}` : ''}{read ? <> · <Check size={11} strokeWidth={2} /> Read</> : null}</span></span>
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
  const { data: cards } = useLibrary()
  const { data: personas } = usePersonas()
  const { data: user } = useUserState()

  // Marked on arrival rather than on some scroll depth. The flag is a note
  // about what has been shown, and `markUiFlag` is idempotent, so the second
  // visit costs one no-op write and nothing else.
  useEffect(() => {
    if (!card) return
    void markUiFlag(libraryReadFlag(card.slug))
  }, [card])

  /**
   * Funnel step six (B7). The audit's complaint about the library is that its
   * fourteen cards "feel like unrelated links" — this is the measurement that
   * either supports that or refutes it, and `from` is what makes it useful:
   * a card opened off a scorecard is a recommendation working, a card opened
   * off the library index is somebody browsing.
   */
  const opened = useRef<string | null>(null)
  useEffect(() => {
    if (!card || opened.current === card.slug) return
    opened.current = card.slug
    capture('technique_opened', { slug: card.slug, from: cameFrom() })
  }, [card])

  const siblings = useMemo(() => {
    if (!card) return []
    return groupLibrary(cards).find((group) => group.key === card.targets[0])?.cards ?? []
  }, [card, cards])

  const index = card ? siblings.findIndex((entry) => entry.slug === card.slug) : -1
  const previous = index > 0 ? siblings[index - 1] : undefined
  const next = index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : undefined

  if (loading) return <AppShell title="Library"><Skeleton height={420} /></AppShell>
  if (!card) {
    return <AppShell title="Library"><EmptyState mark="state-library" title="No such card" description="This technique is not in the library." action={<Link className="arena-button arena-button--primary" href="/library">Back to the library</Link>} /></AppShell>
  }

  return (
    <AppShell title={card.title}>
      <div className="library-detail">
        <Link href="/library" className="label volt-link library-detail__back"><ArrowLeft size={14} strokeWidth={1.6} /> Library</Link>
        <div className="screen-heading">
          <span className="library-tile__kind"><Mark name={libraryKindMark(card.kind)} size={16} /><span className="label">{KIND_LABELS[card.kind]}{card.setting ? ` · ${card.setting}` : ''}</span></span>
          <h1 className="display-lg">{card.title}</h1>
          <p>{card.summary}</p>
        </div>
        <div className="chip-row">
          {card.targets.map((target) => <span key={target} className="mark-row"><Mark name={dimensionMark(target) ?? 'kind-technique'} size={15} /><Chip>{SUB_SCORE_LABELS[target] ?? target}</Chip></span>)}
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
            {/* V29. A card body, its examples and its drill were three
                paragraphs in one texture. The drill is the only part that is
                an instruction, so it is the only part that carries a mark. */}
            <Card className="try-next"><Mark name={libraryKindMark(card.kind)} size={20} current /><p>{card.drill}</p></Card>
          </section>
        ) : null}
        <PractiseThis card={card} personas={personas} repsLeft={user?.repsRemainingToday ?? null} />
        <CardPager previous={previous} next={next} />
      </div>
    </AppShell>
  )
}

/**
 * Read the technique, immediately try it.
 *
 * The card used to end with a drill and no way to run it. Which character it
 * sends you to is authored (`lib/techniques/scenario.ts`): the room the card
 * names when the roster has one, and otherwise the character who genuinely
 * trains that sub-score.
 *
 * When the day's voice reps are gone, this is where text mode earns its
 * keep — it is the same character and the same technique, without the meter
 * and without the microphone, and it is the answer to a home screen whose
 * only verb was "wait".
 */
function PractiseThis({ card, personas, repsLeft }: { card: LibraryCard; personas: Persona[]; repsLeft: number | null }) {
  const unlocked = personas.filter((persona) => !persona.locked).map((persona) => persona.id)
  const slug = personaForCard(card, unlocked)
  if (!slug) return null
  const persona = personas.find((entry) => entry.id === slug)
  const spent = repsLeft !== null && repsLeft <= 0

  return (
    <section className="library-practise">
      <span className="label">Try it now</span>
      {/* The drill is not repeated here. It has its own section directly
          above when a card has one, and printing it twice in fifty pixels
          reads as a template that ran out of things to say. */}
      <p>{persona ? `${persona.name} — ${persona.settingShort.toLowerCase()}.` : 'Take it into a rep.'} {card.drill ? 'Run that drill against her.' : 'Run the technique in a live conversation.'}</p>
      <div className="library-practise__actions">
        {/* Funnel step seven (B7). This is the product's only "focused rep" —
            a rep entered from a technique, with a sub-score attached to it —
            so it is what the audit's connective-tissue claim is measured on.
            `focus` is the card's first target, which is the same key the
            scorecard used to recommend the card in the first place. */}
        {spent
          ? <Link className="arena-button arena-button--primary" href={`/text/${slug}`} onClick={() => capture('focused_rep_started', { persona_id: slug, focus: card.targets[0] ?? 'none' })}>Run it in text</Link>
          : <Link className="arena-button arena-button--primary" href={`/rep/${slug}/brief`} onClick={() => capture('focused_rep_started', { persona_id: slug, focus: card.targets[0] ?? 'none' })}>Run a rep on this</Link>}
        <Link className="arena-button arena-button--ghost" href={spent ? '/train' : `/text/${slug}`}>{spent ? 'Back to training' : 'Or try it in text'}</Link>
      </div>
    </section>
  )
}

/** Next and previous inside the section. Reading two should be one tap. */
function CardPager({ previous, next }: { previous?: LibraryCard; next?: LibraryCard }) {
  if (!previous && !next) return null
  return (
    <nav className="library-pager" aria-label="More in this section">
      {previous
        ? <Link href={`/library/${previous.slug}`} className="library-pager__link"><span className="label"><ArrowLeft size={13} strokeWidth={1.6} /> Previous</span><strong>{previous.title}</strong></Link>
        : <span />}
      {next
        ? <Link href={`/library/${next.slug}`} className="library-pager__link library-pager__link--next"><span className="label">Next <ArrowRight size={13} strokeWidth={1.6} /></span><strong>{next.title}</strong></Link>
        : <span />}
    </nav>
  )
}
