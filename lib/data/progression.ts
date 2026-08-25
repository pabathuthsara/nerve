/**
 * Where the engine's numbers become the numbers a user sees.
 *
 * Two translations live here and nowhere else, because both of them are places
 * a second opinion would silently corrupt a progression record:
 *
 *   levels   the ladder is three rungs (§06 authors eight; the roster ships
 *            three — see `lib/personas/index.ts`), and the frontend shows one
 *            tier per rung.
 *   bands    the engine has six bands, HOSTILE included; the UI has five.
 *
 * Neither translation touches calibration. The engine still scores on the 1-8
 * scale it was tuned on — the shipped rungs are 1, 2 and 4 of that scale, with
 * their authored curves intact — and on HOSTILE..INVESTED as before. This is
 * presentation.
 */

import { ARM_THRESHOLD, KEEP_THRESHOLD } from './rep-rules'
import { personaRankFor, type FocusArea } from './focus'
import type { Band, Level } from './types'

/**
 * The three tiers, in the frontend's own words.
 *
 * Tier 3 was "Hostile" when it held Alex and "Resistant" when it held Erin and
 * Sam. It holds Robin, who is neither: she is unfailingly polite and the whole
 * difficulty is that she gives nothing away in either direction. Naming the
 * tier after a hostility she does not have would tell the user to brace for the
 * wrong thing, which is the one mistake this tier cannot afford — the skill is
 * reading her accurately.
 */
export const LEVEL_NAMES: Record<Level, string> = {
  1: 'Receptive',
  2: 'Neutral',
  3: 'Ambiguous',
}

/**
 * The last tier on the ladder.
 *
 * Named rather than written as `3` at each call site, because the number is
 * going to move again the moment a fourth character is authored, and a literal
 * scattered across the UI is how the roster screen and the training-wheels
 * warning come to disagree about where the top is.
 */
export const TOP_TIER: Level = 3

/**
 * Engine level → UI tier, one tier per shipped rung.
 *
 * This was `ceil(level / 2)` while eight rungs shared four tiers. It cannot
 * stay arithmetic now: the shipped rungs are 1, 2 and 4, and halving them puts
 * Nadia and Maya in the same tier and Robin in the second — a roster screen
 * with an empty top and a doubled bottom.
 *
 * The retired rungs still map, because a session row from before the roster
 * shrank names a level and must still render. Each falls to the tier of the
 * nearest shipped rung at or below it, so an old Erin rep (5) reads as tier 3
 * rather than vanishing.
 */
const TIER_BY_RUNG: Record<number, Level> = { 1: 1, 2: 2, 3: 2, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3 }

export function uiLevel(engineLevel: number): Level {
  return TIER_BY_RUNG[Math.round(engineLevel)] ?? (engineLevel < 1 ? 1 : 3)
}

/**
 * UI tier → the engine rung the roster offers at that tier. The inverse of
 * `uiLevel`, and it has to stay the inverse.
 *
 * This was `tier * 2` while eight rungs shared four tiers, which was the exact
 * inverse of the `ceil(level / 2)` above. Both moved when the roster went to
 * three, and a stored `profiles.current_level` is written through here and read
 * back through `uiLevel` — so if these two ever stop agreeing, a user's ladder
 * position round-trips to a different tier than the one they earned.
 */
const RUNG_BY_TIER: Record<Level, number> = { 1: 1, 2: 2, 3: 4 }

export function engineRung(tier: Level): number {
  return RUNG_BY_TIER[tier]
}

/**
 * Engine band → UI band. HOSTILE folds into CLOSED.
 *
 * The engine needs a band below zero because warmth can go there and the
 * directive at that point is different in kind. The UI does not: the user is
 * being shown how it is going, and "she wants you gone" and "she is closed"
 * are the same instruction to the person holding the microphone.
 */
export function uiBand(band: string | null | undefined): Band {
  switch (band) {
    case 'INVESTED': return 'INVESTED'
    case 'ENGAGED': return 'ENGAGED'
    case 'OPEN': return 'OPEN'
    case 'GUARDED': return 'GUARDED'
    default: return 'CLOSED'
  }
}

/**
 * A stable 0-100 presentation value for warmth.
 *
 * Engine warmth runs from -20, and a negative number in a ring that reads as a
 * percentage is a bug the user has to interpret. Clamped, never rescaled: 60
 * on the meter and 60 in the engine have to be the same 60 or the win
 * threshold stops meaning anything.
 */
export function uiWarmth(warmth: number | null | undefined): number {
  if (typeof warmth !== 'number' || !Number.isFinite(warmth)) return 0
  return Math.max(0, Math.min(100, Math.round(warmth)))
}

/**
 * The pair a dating rep is judged on (§07).
 *
 * Defined with the rest of the rep format and re-exported here, because a
 * second copy of either number is a second answer to "did they win".
 */
export { ARM_THRESHOLD, KEEP_THRESHOLD } from './rep-rules'

/**
 * The score a rep has to reach to count toward the next tier (§08).
 *
 * "Unlock on demonstrated skill, not reps served." Two sessions scoring 70+ at
 * a level opens the one above it, and grinding advances nobody.
 */
export const UNLOCK_SCORE = 70

/** How many of them. Two, uniformly — §08 does not scale it by level. */
export const UNLOCK_REPS = 2

/**
 * What each tier costs to open.
 *
 * Derived from history rather than stored: an unlock is a fact about the reps
 * you have already run, and a stored copy of a derived fact is a stored copy
 * that can disagree with it. Tiers 1 and 2 are open from the start — a first
 * session that has to be earned is a first session nobody has.
 *
 * **This gate used to count wins.** A win is whether she gave her number, which
 * §07 is careful to make never the thing that counts — and until the outcome
 * bug was fixed the grader could invent one outright, so the gate was scoring
 * outcome twice over. It counts qualifying SCORES now: process, not result. A
 * clean rep that ends in rejection can score 92 and advance you.
 */
export const UNLOCK_RULES: Record<Level, { level: Level; reps: number } | null> = {
  1: null,
  2: null,
  3: { level: 2, reps: UNLOCK_REPS },
}

export function unlockRequirement(level: Level): string | null {
  const rule = UNLOCK_RULES[level]
  if (!rule) return null
  return `Score ${UNLOCK_SCORE}+ in ${rule.reps} reps at Level ${rule.level}`
}

/**
 * Which tiers are open, given the count of qualifying reps per tier.
 *
 * "Qualifying" is a graded rep at that tier whose composite reached
 * `UNLOCK_SCORE`. Ungraded reps count for nothing, which is correct: the gate
 * is demonstrated skill and an ungraded rep has demonstrated nothing yet.
 */
export function unlockedLevels(qualifyingByLevel: Record<number, number>): Set<Level> {
  const open = new Set<Level>()
  for (const level of [1, 2, 3] as Level[]) {
    const rule = UNLOCK_RULES[level]
    if (!rule || (qualifyingByLevel[rule.level] ?? 0) >= rule.reps) open.add(level)
  }
  return open
}

/**
 * Count reps that clear the bar, by tier.
 *
 * Shared so the roster's locked state and the stored ladder position are
 * computed by the same arithmetic. They read different tables — the browser
 * joins under RLS, the server joins with the service role — and two
 * implementations of one rule is how they come to disagree.
 */
export function qualifyingByLevel(
  reps: readonly { level: Level; composite: number | null }[],
): Record<number, number> {
  const counts: Record<number, number> = {}
  for (const rep of reps) {
    if (rep.composite === null || rep.composite < UNLOCK_SCORE) continue
    counts[rep.level] = (counts[rep.level] ?? 0) + 1
  }
  return counts
}

/**
 * Last resort only: a row with no `won` and no meter to read.
 *
 * Kept for sessions written before `sessions.won` and the warmth columns
 * existed, which have an outcome and nothing else to go on. **Every caller must
 * try `row.won` first** — reaching for this on a modern row is how the grader's
 * opinion gets to decide a win, which is the bug `wonFromRep` above documents.
 * `fetchPersonas` did exactly that: it selected `outcome` and never `won`, so
 * the roster's locked and unlocked state was computed from the grade alone.
 */
export function wonFromOutcome(outcome: string | null | undefined): boolean {
  return outcome === 'receptive'
}

/**
 * Whether the rep is told as a win, reconstructed from a stored row.
 *
 * The live rep decides this itself and passes the answer down, because it is
 * the only thing that knows what she was told at the wind-down. This is the
 * fallback for a row that never got one — a rep that crashed before it could
 * report, or one written before `sessions.won` existed.
 *
 * It reads the same rule off the two numbers the session row keeps. `peak`
 * answers "was she ever willing" — arming — and `final` answers "was she still
 * willing when it ended". Using final alone would call a rep that touched 80
 * and finished at 60 a loss, which it is not.
 *
 * **The grader's outcome is not an input, and used to be.** Two lines here read
 * `if (outcome === 'receptive') return true` before the meter was consulted at
 * all, so a rep whose meter peaked at 60.16 — never armed, shown to the user as
 * "She left" — was rewritten as a win the moment the grade landed, because the
 * conversation had gone pleasantly. That is precisely the substitution §07
 * exists to forbid: outcome is recorded and worth zero, and whether she gave
 * her number is a fact about the meter, not a judgement about the chat. It also
 * meant the stored record disagreed with the screen the user had just been
 * shown, which is worse than either answer on its own.
 */
export function wonFromRep(input: {
  finalWarmth: number | null
  peakWarmth?: number | null
}): boolean {
  const peak = input.peakWarmth ?? input.finalWarmth ?? 0
  return peak >= ARM_THRESHOLD && (input.finalWarmth ?? 0) >= KEEP_THRESHOLD
}

/**
 * Today's rep.
 *
 * §01 is one rep a day against one person, chosen for you — a roster you have
 * to pick from every morning is a decision before the hard part, and the hard
 * part is the point. The rule: the hardest tier you have unlocked, and inside
 * it the character you have faced least, oldest first.
 *
 * `focus` is the onboarding answer, and it is deliberately the LAST tie-break
 * rather than the first. On a fresh account nobody has been faced yet, so it
 * decides the first rep — which is the whole complaint it answers. After that
 * the rotation has real numbers in it and this stops mattering, because a
 * questionnaire answer that pinned somebody to one character forever would be
 * a worse bug than the one being fixed.
 */
export function chooseTodayPersona<T extends { id: string; level: Level; locked: boolean }>(
  personas: T[],
  progress: { personaId: string; attempts: number; lastAttemptAt: string | null }[],
  currentLevel: Level,
  focus?: FocusArea | null,
): T | null {
  const available = personas.filter((persona) => !persona.locked && persona.level <= currentLevel)
  const pool = available.length > 0 ? available : personas.filter((persona) => !persona.locked)
  if (pool.length === 0) return null

  const topLevel = Math.max(...pool.map((persona) => persona.level))
  const contenders = pool.filter((persona) => persona.level === topLevel)

  const attemptsFor = (id: string) => progress.find((entry) => entry.personaId === id)?.attempts ?? 0
  const lastFor = (id: string) => progress.find((entry) => entry.personaId === id)?.lastAttemptAt ?? ''

  return [...contenders].sort((a, b) =>
    attemptsFor(a.id) - attemptsFor(b.id)
    || personaRankFor(focus, a.id) - personaRankFor(focus, b.id)
    || lastFor(a.id).localeCompare(lastFor(b.id)),
  )[0] ?? null
}

/** The band tone a level card wears. Cosmetic, and consistent everywhere. */
export function levelTone(level: Level): Band {
  return level >= 3 ? 'GUARDED' : level === 2 ? 'OPEN' : 'ENGAGED'
}
