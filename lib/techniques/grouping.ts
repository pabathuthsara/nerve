/**
 * How the library is laid out, and in what order it is read.
 *
 * Grouped by the sub-score a card moves rather than by kind, because that is
 * the question somebody arrives with: nobody opens the library wanting "an
 * opener", they open it having just scored 42 on signal reading.
 *
 * Two rules live here rather than in the screen, and both of them are content
 * decisions rather than layout ones — which is why they are testable:
 *
 *   **One card, one section.** A card's FIRST target is its home and the rest
 *   are shown on it as chips. Cards carrying two targets used to be drawn in
 *   both sections, which made fourteen cards read as eighteen and a small
 *   library read as padded rather than as edited.
 *
 *   **The technique first.** Rows arrive from the database ordered by `kind`,
 *   which is alphabetical, and therefore put five openers ahead of the one
 *   card explaining what an opener is for. Next and previous walk this order,
 *   so it is the reading order and not a display detail.
 */

/** What the grouping needs off a card. The screen passes its full row. */
export interface GroupableCard {
  slug: string
  kind: 'technique' | 'opener' | 'ladder' | 'recovery' | 'exit'
  title: string
  targets: string[]
}

export interface LibraryGroup<T extends GroupableCard> {
  key: string
  title: string
  blurb: string
  cards: T[]
}

/** The six, in §07's own order, so the library reads like the scorecard does. */
export const LIBRARY_GROUPS: { key: string; title: string; blurb: string }[] = [
  { key: 'opening', title: 'Opening', blurb: 'Getting a conversation started at all.' },
  { key: 'curiosity', title: 'Curiosity', blurb: 'Asking about her, and going past the first answer.' },
  { key: 'listening', title: 'Listening', blurb: 'Using what she actually gave you.' },
  { key: 'signalReading', title: 'Signal reading', blurb: 'Reading her interest correctly, and adjusting.' },
  { key: 'composure', title: 'Composure', blurb: 'Staying steady. Recovering counts for more than never wobbling.' },
  { key: 'close', title: 'Close', blurb: 'How it ends — including when the answer is no.' },
]

const KIND_ORDER: Record<GroupableCard['kind'], number> = {
  technique: 0, ladder: 1, opener: 2, recovery: 3, exit: 4,
}

function byKind(a: GroupableCard, b: GroupableCard): number {
  return KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.title.localeCompare(b.title)
}

export function groupLibrary<T extends GroupableCard>(cards: T[]): LibraryGroup<T>[] {
  const known = new Set(LIBRARY_GROUPS.map((group) => group.key))
  const grouped = LIBRARY_GROUPS.map((group) => ({
    ...group,
    cards: cards.filter((card) => card.targets[0] === group.key).sort(byKind),
  })).filter((group) => group.cards.length > 0)

  // A card whose primary target is not one of the six would otherwise be
  // filtered off the screen entirely, and a seeded card nobody can see is
  // worse than one in the wrong section. There are none today; this is here so
  // that adding a sub-score cannot silently hide content.
  const orphans = cards.filter((card) => !known.has(card.targets[0] ?? ''))
  if (orphans.length === 0) return grouped
  return [
    ...grouped,
    { key: 'other', title: 'Everything else', blurb: 'Cards that do not sit under one score.', cards: orphans },
  ]
}
