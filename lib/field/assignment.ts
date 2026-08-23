/**
 * Which challenge you get today, decided without a database.
 *
 * Two rules, both of which have to be pure or they cannot be trusted:
 *
 * **The tier gate.** Graded exposure, in order (§09). Tier 2 opens at sim
 * level 4, tier 3 at 6, tier 4 at 7. Going too hard too early sensitises
 * rather than habituates — a user handed "ask for a number" in week one quits
 * feeling worse than when they arrived.
 *
 * **The pick.** Deterministic from the user and the local day, so the
 * challenge does not change when the page is refreshed. A challenge you can
 * reroll is a slot machine, and a slot machine is the opposite of an exposure
 * ladder.
 */

export type Tier = 1 | 2 | 3 | 4

export interface AssignableChallenge {
  id: string
  tier: number
}

/** The highest tier this person may be given, from their sim level (§09). */
export function unlockedTier(engineLevel: number): Tier {
  if (engineLevel >= 7) return 4
  if (engineLevel >= 6) return 3
  if (engineLevel >= 4) return 2
  return 1
}

/** What it costs to open the next one, in the user's own words. */
export function nextTierRequirement(tier: Tier): string | null {
  if (tier === 1) return 'Reach Level 4 in the gym for Tier 2'
  if (tier === 2) return 'Reach Level 6 in the gym for Tier 3'
  if (tier === 3) return 'Reach Level 7 in the gym for Tier 4'
  return null
}

export const TIER_NAMES: Record<Tier, string> = {
  1: 'In-app',
  2: 'Low stakes',
  3: 'Social',
  4: 'The real thing',
}

/**
 * FNV-1a. Small, stable, and not cryptographic — which is fine, because the
 * only thing being protected here is "the same answer twice".
 */
function hash(seed: string): number {
  let value = 0x811c9dc5
  for (let index = 0; index < seed.length; index += 1) {
    value ^= seed.charCodeAt(index)
    value = Math.imul(value, 0x01000193)
  }
  return value >>> 0
}

/**
 * Today's challenge.
 *
 * Prefers the top unlocked tier, because that is where the training actually
 * is; falls back down the ladder only when everything up there has been done
 * recently. `recentIds` is the last thirty days — repeating a challenge is
 * allowed eventually, since doing it again in November is a different rep from
 * doing it in August, but not next Tuesday.
 *
 * `attempt` walks the pool on a swap rather than rerolling it, so swapping
 * three times gives three different challenges instead of three coin flips.
 */
export function chooseChallenge(input: {
  challenges: AssignableChallenge[]
  tier: Tier
  recentIds: string[]
  seed: string
  attempt?: number
}): AssignableChallenge | null {
  const allowed = input.challenges.filter((challenge) => challenge.tier <= input.tier)
  if (allowed.length === 0) return null

  const recent = new Set(input.recentIds)
  const fresh = allowed.filter((challenge) => !recent.has(challenge.id))

  // Everything unlocked has been done in the last month. Rather than refuse to
  // assign anything, go round again.
  const pool = fresh.length > 0 ? fresh : allowed

  // The top tier is where the training is. Only drop below it when there is
  // nothing fresh up there.
  const atTop = pool.filter((challenge) => challenge.tier === input.tier)
  const chosen = atTop.length > 0 ? atTop : pool

  // Sorted before indexing: the input order is a database's business and must
  // not decide what somebody is asked to do today.
  const ordered = [...chosen].sort((a, b) => a.id.localeCompare(b.id))
  const index = (hash(input.seed) + (input.attempt ?? 0)) % ordered.length
  return ordered[index] ?? null
}
