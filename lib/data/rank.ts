/**
 * Ranks — the slow-moving standing on the home screen (§08).
 *
 * §08 asks for four ranks "spanning the eight levels … shown as a rail on the
 * home screen rather than as a badge shelf". The roster ships four rungs, so
 * four-over-eight still does not divide, and the obvious fix — drop a rank —
 * throws away the one that means anything.
 *
 * **The fourth rank is earned at the top rather than above it.** Three of them
 * mark a tier being cleared; Closer marks the TOP tier being cleared — two reps
 * at 70+ against Robin, which nothing else in the product unlocks and which is
 * therefore the only thing left to be good at. That keeps §08's four names, and
 * it keeps a rank from being a second word for the level a user is already
 * looking at.
 *
 * **Tier 1 is the on-ramp and mints no rank.** Tess was authored to be won by
 * somebody who has not yet decided whether this product is for them
 * (`lib/personas/tess.ts`), so a rank for clearing her would be a participation
 * badge — precisely the badge shelf §08 rules out. The three earned ranks stay
 * anchored to the three characters they were written about, which is also why
 * the renumber moved nobody: an account that had cleared Nadia was a Regular
 * when Nadia was tier 1 and is a Regular now that she is tier 2, and the blurbs
 * below still describe the character actually being cleared.
 *
 * Derived, never stored as the source of truth, for the same reason unlocks are
 * (`progression.ts`): a rank is a fact about the reps you have run, and a
 * counter that drifts from that history is a user who is either stuck or
 * promoted for a rep they never did. `syncLevel` mirrors it onto
 * `profiles.rank` so cohorts are queryable — that copy is an index, not an
 * authority.
 */

import { TOP_TIER, UNLOCK_REPS, UNLOCK_SCORE } from './progression'
import type { Level } from './types'

export type Rank = 'rookie' | 'regular' | 'contender' | 'closer'

export const RANKS: readonly Rank[] = ['rookie', 'regular', 'contender', 'closer']

export const RANK_NAMES: Record<Rank, string> = {
  rookie: 'Rookie',
  regular: 'Regular',
  contender: 'Contender',
  closer: 'Closer',
}

/**
 * What each rank actually means, in the user's own terms.
 *
 * Hand-authored per §02 rule 12. A rank with no explanation is a badge, and
 * §08 is explicit that this is a rail rather than a badge shelf — the
 * difference is whether it tells you where you are or just decorates.
 */
export const RANK_BLURBS: Record<Rank, string> = {
  rookie: 'You have started. That is the part most people never do.',
  regular: 'You can hold a conversation with someone who is pleased to see you.',
  contender: 'You can keep one going with someone who is not helping you.',
  closer: 'You read a person who gave you nothing to read, twice over.',
}

/** What opens the next one, in the same words the roster uses. */
export function nextRankRequirement(rank: Rank): string | null {
  if (rank === 'rookie') return `Score ${UNLOCK_SCORE}+ in ${UNLOCK_REPS} reps at Level 2`
  if (rank === 'regular') return `Score ${UNLOCK_SCORE}+ in ${UNLOCK_REPS} reps at Level 3`
  if (rank === 'contender') return `Score ${UNLOCK_SCORE}+ in ${UNLOCK_REPS} reps at Level ${TOP_TIER}`
  return null
}

/**
 * The rank those reps have earned.
 *
 * Takes the same per-tier count of qualifying reps that drives unlocks, so the
 * roster's locked state and the rail on the home screen cannot disagree about
 * how far somebody has got.
 */
export function rankFor(qualifyingByLevel: Record<number, number>): Rank {
  // Tiers CLEARED, not tiers open. Tiers 1 and 2 are open from the start — a
  // first session that has to be earned is a first session nobody has — so
  // keying a rank off what is unlocked would hand every new account a rank it
  // had not done anything for.
  const cleared = (tier: Level) => (qualifyingByLevel[tier] ?? 0) >= UNLOCK_REPS

  if (cleared(TOP_TIER)) return 'closer'
  if (cleared(3)) return 'contender'
  if (cleared(2)) return 'regular'
  return 'rookie'
}

/** Position on the rail, 0-based, for rendering. */
export function rankIndex(rank: Rank): number {
  const index = RANKS.indexOf(rank)
  return index < 0 ? 0 : index
}

/**
 * `1 day`, not `1 days`.
 *
 * Four screens printed a streak as `${n} days` and every one of them said
 * "1 days" on somebody's first day — which is the day the streak matters most
 * and the first thing a new account sees on Train. One helper, because the
 * bug was four copies of the same missing conditional.
 */
export function dayCount(days: number): string {
  return `${days} ${days === 1 ? 'day' : 'days'}`
}
