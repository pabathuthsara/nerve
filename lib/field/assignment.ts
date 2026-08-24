/**
 * Which challenge you get today, decided without a database.
 *
 * Two rules, both of which have to be pure or they cannot be trusted:
 *
 * **The tier gate.** Graded exposure, in order (§09). Going too hard too early
 * sensitises rather than habituates — a user handed "ask for a number" in week
 * one quits feeling worse than when they arrived.
 *
 * The thresholds used to be sim levels 4, 6 and 7, which read the eight-rung
 * ladder. The roster ships three rungs — 1, 2 and 4 — so those numbers gated
 * two of the four field tiers behind a sim level nobody can reach. T2 and T3
 * are re-anchored to the rungs that exist; T4 is no longer a gym gate at all
 * and is earned in the field, which is where a real-world tier belongs.
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

/** What the field itself knows about somebody, for the tier-4 gate. */
export interface FieldHistory {
  /**
   * Distinct DAYS on which a tier-3 ask was actually made.
   *
   * Days rather than asks, because habituation is repetition spread over time —
   * five asks in one brave afternoon is one exposure, not five, and it is the
   * afternoon somebody rides on and then stalls. Asks MADE rather than accepted,
   * because §09 is explicit that nothing in the field is ever gated on the other
   * person saying yes; a declined ask is the rep working.
   */
  tier3AskDays: number
}

/**
 * How many such days T4 costs.
 *
 * Five is a judgement call and is meant to be tuned once the beta has numbers.
 * The reasoning: T3 is complimenting a stranger and walking on, T4 is asking a
 * real person for their name or their number, and that is the largest single
 * step on the ladder. Fewer than a working week of T3 days and the step is
 * being taken on the back of one good day.
 */
export const T4_ASK_DAYS = 5

/**
 * The highest tier this person may be given (§09).
 *
 * **The gym opens T1 to T3; only the field opens T4.** Three sim rungs cannot
 * earn four field tiers, and rather than compress the ladder or hand over two
 * tiers at one moment, T4 asks for something the sim cannot provide: evidence
 * that this person has actually been going outside and asking.
 *
 * That coupling is better than the one it replaces, not merely a workaround for
 * the roster change. A field tier is real-world exposure, and gating the
 * hardest real-world ask on gym performance always said that being good at
 * talking to a synthetic character earns you the right to approach a person.
 * It does not. Doing the smaller thing, repeatedly, is what earns it.
 *
 * `history` is optional and its absence gates T4 SHUT. Every caller that cannot
 * see the field log therefore fails in the conservative direction — a user is
 * handed less exposure than they have earned, never more.
 */
export function unlockedTier(engineLevel: number, history?: FieldHistory): Tier {
  if (engineLevel < 2) return 1
  if (engineLevel < 4) return 2
  return (history?.tier3AskDays ?? 0) >= T4_ASK_DAYS ? 4 : 3
}

/** What it costs to open the next one, in the user's own words. */
export function nextTierRequirement(tier: Tier): string | null {
  if (tier === 1) return 'Reach Level 2 in the gym for Tier 2'
  if (tier === 2) return 'Reach Level 4 in the gym for Tier 3'
  // T4 is the one tier the gym cannot open, so its requirement names the field.
  if (tier === 3) return `Ask on ${T4_ASK_DAYS} different days for Tier 4`
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
