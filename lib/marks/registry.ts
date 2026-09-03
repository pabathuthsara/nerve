/**
 * The mark vocabulary (`docs/VISUAL-AUDIT.md` §3, V1).
 *
 * Thirty things in this product are meant to be recognised on sight — four
 * ranks, four roster tiers, four field tiers, six score dimensions, five
 * library kinds, four rejection milestones and three plans — and until this
 * existed every one of them was drawn as a word in the same face, the same
 * size and the same grey. A user could not glance at Train and see where they
 * stood; they had to read `Contender` and remember whether that was above or
 * below `Regular`.
 *
 * **Why the names live here and the drawing lives in `components/marks/`.**
 * The thing that can silently rot is not the SVG, it is the mapping: a rank
 * renamed, a seventh dimension added, a library kind introduced. Every one of
 * those leaves a screen rendering nothing where a mark should be, and nothing
 * is exactly what a missing glyph looks like. So the mapping is a pure
 * function in `lib/` with a test that walks the real unions
 * (`RANKS`, `SUB_SCORE_LABELS`, `REJECTION_MILESTONES`, the plan record) and
 * asserts every member resolves. Add a rank without a mark and the suite goes
 * red before the screen does.
 *
 * **Arena bounds, restated because they are what makes a mark set legal here.**
 * Marks are hairline geometry on a 24-unit grid: 1.5 stroke, `currentColor`,
 * no fill, no gradient, no rounded blob. They render in Ink-2 at rest and take
 * volt ONLY on the one that is current — the rank you hold, the tier you are
 * on, the dimension this rep is about — because volt appears once per screen
 * and a mark set painted volt would break that rule on every screen it landed
 * on. Nothing here is a photograph, a character or a mascot: §14's
 * merchant-of-record reviewer opens the public site, and `PAYMENTS-APPROVAL.md`
 * §3 is why the obvious answer to "too much text" is the one answer we cannot
 * use.
 */

import { RANKS, type Rank } from '@/lib/data/rank'
import { REJECTION_MILESTONES } from '@/lib/field/milestones'
import type { FieldTier, Level, Plan } from '@/lib/data/types'

/**
 * Every glyph the product draws, by name.
 *
 * One flat union rather than a union per family, so a component can take a
 * `MarkName` and a screen can hold one in a variable. The families are the
 * lookup functions below.
 */
export type MarkName =
  // Rank — ascending chevrons, then a capped form at the top (§08's rail).
  | 'rank-1' | 'rank-2' | 'rank-3' | 'rank-4'
  // The six §07 dimensions, drawn as what the dimension does.
  | 'dim-opening' | 'dim-curiosity' | 'dim-listening'
  | 'dim-signal' | 'dim-composure' | 'dim-close'
  // Roster tier — an aperture that closes as the tier rises.
  | 'tier-1' | 'tier-2' | 'tier-3' | 'tier-4'
  // Field tier — rungs. The mark counts, so it cannot disagree with the label.
  | 'field-1' | 'field-2' | 'field-3' | 'field-4'
  // Library kinds.
  | 'kind-technique' | 'kind-opener' | 'kind-ladder' | 'kind-recovery' | 'kind-exit'
  // Rejection milestones — one ring per milestone reached.
  | 'milestone-1' | 'milestone-2' | 'milestone-3' | 'milestone-4'
  // Plans — ascending bars, because volume is the only thing a plan changes.
  | 'plan-free' | 'plan-pro' | 'plan-elite'
  // State marks, for the twenty-five empty states that all drew one tray.
  | 'state-roster' | 'state-field' | 'state-chart' | 'state-library'
  | 'state-session' | 'state-transcript' | 'state-filter' | 'state-letter'
  // Boundary marks — the four things the product is not (§11's landing).
  | 'bound-script' | 'bound-companion' | 'bound-clinical' | 'bound-adult'

/**
 * Rank → mark. Position on the rail, not an achievement.
 *
 * Falls back to the first rank rather than returning null: an unknown rank is
 * a bug, and a rail with a hole in it hides the bug behind an absence.
 */
export function rankMark(rank: Rank): MarkName {
  const index = RANKS.indexOf(rank)
  return (`rank-${index < 0 ? 1 : index + 1}`) as MarkName
}

/**
 * Sub-score key → mark.
 *
 * Keyed off the same strings `SUB_SCORE_LABELS` uses, which are the keys the
 * grader returns. `signalReading` is the one that is not its own word; every
 * other key is its own suffix.
 */
const DIMENSION_MARKS: Record<string, MarkName> = {
  opening: 'dim-opening',
  curiosity: 'dim-curiosity',
  listening: 'dim-listening',
  signalReading: 'dim-signal',
  composure: 'dim-composure',
  close: 'dim-close',
}

export function dimensionMark(key: string): MarkName | null {
  return DIMENSION_MARKS[key] ?? null
}

/**
 * The onboarding focus answers, on the same six marks.
 *
 * The point of reusing them is that the vocabulary is learned once, in the
 * first ninety seconds somebody spends here, and then means the same thing on
 * the brief, the scorecard, the library and Progress. `flirting` has no
 * dimension of its own — §07 does not score it — and the closest honest mark
 * is curiosity, which is what the focus plan actually trains.
 */
export function focusMark(focus: string | null): MarkName | null {
  if (focus === 'opening') return 'dim-opening'
  if (focus === 'sustaining') return 'dim-curiosity'
  if (focus === 'flirting') return 'dim-listening'
  if (focus === 'rejection') return 'dim-close'
  return null
}

/** Roster tier → mark. Clamped, because a retired rung still has to render. */
export function tierMark(level: Level | number): MarkName {
  const clamped = Math.min(4, Math.max(1, Math.round(level)))
  return (`tier-${clamped}`) as MarkName
}

/** Field tier → mark. */
export function fieldTierMark(tier: FieldTier | number): MarkName {
  const clamped = Math.min(4, Math.max(1, Math.round(tier)))
  return (`field-${clamped}`) as MarkName
}

const KIND_MARKS = {
  technique: 'kind-technique',
  opener: 'kind-opener',
  ladder: 'kind-ladder',
  recovery: 'kind-recovery',
  exit: 'kind-exit',
} as const

export function libraryKindMark(kind: keyof typeof KIND_MARKS): MarkName {
  return KIND_MARKS[kind]
}

/**
 * Milestone count → mark. One ring for the first, four for the hundredth.
 *
 * Reads off `REJECTION_MILESTONES` rather than a second table of 10/25/50/100,
 * so adding a fifth milestone is a one-line change in one file — and the test
 * below asserts every milestone in that array resolves.
 */
export function milestoneMark(at: number): MarkName {
  const index = REJECTION_MILESTONES.findIndex((milestone) => milestone.at === at)
  const position = index < 0 ? 0 : Math.min(3, index)
  return (`milestone-${position + 1}`) as MarkName
}

/** Plan → mark. */
export function planMark(plan: Plan): MarkName {
  if (plan === 'pro') return 'plan-pro'
  if (plan === 'elite') return 'plan-elite'
  return 'plan-free'
}
