import { describe, expect, it } from 'vitest'
import { LIBRARY_GROUPS, groupLibrary, type GroupableCard } from './grouping'
import { TECHNIQUES } from './library'

/** The authored library, in the shape the screen reads it. */
const CARDS: GroupableCard[] = TECHNIQUES.map((card) => ({
  slug: card.slug,
  kind: card.kind,
  title: card.title,
  targets: [...card.targets],
}))

describe('groupLibrary', () => {
  /**
   * The complaint this answers: "four cards repeat across two sections each,
   * which makes a small library feel padded."
   */
  it('draws every card exactly once', () => {
    const drawn = groupLibrary(CARDS).flatMap((group) => group.cards.map((card) => card.slug))
    expect(drawn).toHaveLength(CARDS.length)
    expect(new Set(drawn).size).toBe(CARDS.length)
  })

  it('loses nothing — every authored card is somewhere', () => {
    const drawn = new Set(groupLibrary(CARDS).flatMap((group) => group.cards.map((card) => card.slug)))
    for (const card of CARDS) expect(drawn.has(card.slug), card.slug).toBe(true)
  })

  it('puts a card under its first target', () => {
    for (const group of groupLibrary(CARDS)) {
      for (const card of group.cards) expect(card.targets[0], card.slug).toBe(group.key)
    }
  })

  it('leads each section with the technique, not the material hanging off it', () => {
    for (const group of groupLibrary(CARDS)) {
      const first = group.cards[0]
      const hasTechnique = group.cards.some((card) => card.kind === 'technique')
      if (hasTechnique) expect(first?.kind, group.key).toBe('technique')
    }
  })

  it('drops a section with nothing in it rather than drawing an empty heading', () => {
    const groups = groupLibrary([{ slug: 'a', kind: 'technique', title: 'A', targets: ['opening'] }])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.key).toBe('opening')
  })

  it('keeps a card whose target is not one of the six, rather than hiding it', () => {
    const groups = groupLibrary([{ slug: 'x', kind: 'technique', title: 'X', targets: ['charisma'] }])
    expect(groups.flatMap((group) => group.cards.map((card) => card.slug))).toEqual(['x'])
  })

  it('keeps a card with no targets at all', () => {
    const groups = groupLibrary([{ slug: 'x', kind: 'technique', title: 'X', targets: [] }])
    expect(groups.flatMap((group) => group.cards.map((card) => card.slug))).toEqual(['x'])
  })

  it('renders the six sections in §07 order', () => {
    const keys = groupLibrary(CARDS).map((group) => group.key)
    const expected = LIBRARY_GROUPS.map((group) => group.key).filter((key) => keys.includes(key))
    expect(keys).toEqual(expected)
  })

  it('is empty for an unseeded library rather than six empty headings', () => {
    expect(groupLibrary([])).toEqual([])
  })
})
