/**
 * Where the engine's numbers become the numbers a user sees.
 *
 * Two translations live here and nowhere else, because both of them are places
 * a second opinion would silently corrupt a progression record:
 *
 *   levels   the ladder is four rungs (§06 authors eight; the roster ships
 *            four — see `lib/personas/index.ts`), and the frontend shows one
 *            tier per rung.
 *   bands    the engine has six bands, HOSTILE included; the UI has five.
 *
 * Neither translation touches calibration. The engine still scores on the 1-8
 * scale it was tuned on — the shipped rungs are 1 to 4 of that scale, with
 * their authored curves intact — and on HOSTILE..INVESTED as before. This is
 * presentation.
 *
 * **Since the roster went contiguous the level translation is the identity for
 * every shipped rung**, and that is worth saying out loud rather than deleting
 * the two tables below. They earn their keep in two places: the retired rungs
 * 5-8 still have to render on an old session row, and the pair has to stay
 * exact inverses of one another or a stored ladder position round-trips to a
 * tier nobody earned. An identity written as a table is also the honest shape
 * for something that has been re-derived twice already.
 */

import { ARM_THRESHOLD, KEEP_THRESHOLD } from './rep-rules'
import { personaRankFor, type FocusArea } from './focus'
import type { Band, Level } from './types'

/**
 * The four tiers, in the frontend's own words.
 *
 * The top tier was "Hostile" when it held Alex and "Resistant" when it held
 * Erin and Sam. It holds Robin, who is neither: she is unfailingly polite and
 * the whole difficulty is that she gives nothing away in either direction.
 * Naming the tier after a hostility she does not have would tell the user to
 * brace for the wrong thing, which is the one mistake this tier cannot afford
 * — the skill is reading her accurately.
 *
 * Every name shifted up one rung when Tess took the bottom, because the names
 * describe the character standing there and the characters moved. Tess is
 * "Open" rather than a fourth synonym for receptive: she is not merely willing
 * to be talked to, she is actively glad of it, and that is the difference
 * between rung 1 and rung 2.
 */
export const LEVEL_NAMES: Record<Level, string> = {
  1: 'Open',
  2: 'Receptive',
  3: 'Neutral',
  4: 'Ambiguous',
}

/**
 * The last tier on the ladder.
 *
 * Named rather than written out at each call site, because the number moves
 * every time the roster does — it has been 4, then 3, and is 4 again now that
 * Tess holds rung 1 — and a literal scattered across the UI is how the roster
 * screen and the training-wheels warning come to disagree about where the top
 * is. Nothing but this constant changed at those call sites either time.
 */
export const TOP_TIER: Level = 4

/**
 * Engine level → UI tier, one tier per shipped rung.
 *
 * This was `ceil(level / 2)` while eight rungs shared four tiers, then a table
 * with a hole in it while the roster was 1, 2 and 4. The roster is contiguous
 * now, so rungs 1-4 map straight through.
 *
 * The retired rungs still map, because a session row from before the roster
 * changed names a level and must still render. Each falls to the tier of the
 * nearest shipped rung at or below it, so an old Erin rep (5) reads as the top
 * tier rather than vanishing.
 */
const TIER_BY_RUNG: Record<number, Level> = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 4, 6: 4, 7: 4, 8: 4 }

export function uiLevel(engineLevel: number): Level {
  return TIER_BY_RUNG[Math.round(engineLevel)] ?? (engineLevel < 1 ? 1 : TOP_TIER)
}

/**
 * UI tier → the engine rung the roster offers at that tier. The inverse of
 * `uiLevel`, and it has to stay the inverse.
 *
 * This was `tier * 2` while eight rungs shared four tiers, and `{1:1, 2:2,
 * 3:4}` while rung 3 stood empty. A stored `profiles.current_level` is written
 * through here and read back through `uiLevel` — so if these two ever stop
 * agreeing, a user's ladder position round-trips to a different tier than the
 * one they earned. That is also why the renumber cost nobody their position:
 * an account sitting on rung 4 because it had cleared Maya still sits on rung
 * 4, and rung 4 is still Robin.
 */
const RUNG_BY_TIER: Record<Level, number> = { 1: 1, 2: 2, 3: 3, 4: 4 }

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
 * What tier 2 costs, and the one place the ladder is not uniform.
 *
 * One qualifying rep against Tess, rather than two (RETENTION-AUDIT R2). Tier
 * 2 used to be given away, which meant **the first unlock a new account could
 * possibly reach was tier 3**, behind two graded reps at 70+ — so the unlock
 * mechanic did not exist for anybody who had not already decided to stay. The
 * sheet fires on rep one to three now, and the user meets the thing the whole
 * ladder is made of while they are still deciding.
 *
 * One rather than two on purpose. Tess was authored to be winnable by somebody
 * who has not yet decided whether this product is for them
 * (`lib/personas/tess.ts`), which makes her the right gate — and a gate that
 * costs two graded reps on a free account is a gate nobody standing at it can
 * pay, because the free grant is one voice rep ever (§14).
 *
 * `rankFor` is untouched by this and must stay untouched: it keys off tiers
 * CLEARED (`UNLOCK_REPS` of them) rather than tiers open, precisely so that a
 * tier becoming available mints no standing.
 */
export const FIRST_UNLOCK_REPS = 1

/**
 * What each tier costs to open.
 *
 * Derived from history rather than stored: an unlock is a fact about the reps
 * you have already run, and a stored copy of a derived fact is a stored copy
 * that can disagree with it. **Tier 1 is open from the start and nothing else
 * is** — a first session that has to be earned is a first session nobody has,
 * and everything above it is a rung.
 *
 * **This gate used to count wins.** A win is whether she gave her number, which
 * §07 is careful to make never the thing that counts — and until the outcome
 * bug was fixed the grader could invent one outright, so the gate was scoring
 * outcome twice over. It counts qualifying SCORES now: process, not result. A
 * clean rep that ends in rejection can score 92 and advance you.
 *
 * **The shape survived the renumber; every character kept its own gate.** Maya
 * used to be tier 2 and open from the start, and is tier 3 behind two
 * qualifying reps against Nadia. Robin used to be tier 3 behind two qualifying
 * reps against Maya, and is tier 4 behind two qualifying reps against Maya —
 * the same requirement, one row further down. What changed is that Maya is now
 * earned rather than given, which is where she sat in §06's own eight-rung
 * ladder before the roster shrank.
 *
 * **Tier 2 became a rung on 3 September** (RETENTION-AUDIT R2). It was free,
 * which meant no new account could ever reach an unlock: levels 1 and 2 were
 * both given, and the first gate on the ladder was tier 3 behind two graded
 * reps at 70+. Nadia was always there, and nothing was earned by arriving at
 * her. She costs one qualifying rep against Tess now — see `FIRST_UNLOCK_REPS`
 * — and a first session still costs nothing.
 */
export const UNLOCK_RULES: Record<Level, { level: Level; reps: number } | null> = {
  1: null,
  2: { level: 1, reps: FIRST_UNLOCK_REPS },
  3: { level: 2, reps: UNLOCK_REPS },
  4: { level: 3, reps: UNLOCK_REPS },
}

/**
 * A tier, written as the thing it costs.
 *
 * Kept for the two places that have no rep counts to hand — a lock overlay
 * rendered off a `Persona` row before history has been read, and the seed data
 * that describes the ladder in prose. Everywhere a count IS available,
 * `unlockProgressLabel` is the one to use: it is the same sentence with the
 * user's own position in it, and RETENTION-AUDIT R8 is specifically about the
 * static version never changing after the rep that advanced it.
 */
export function unlockRequirement(level: Level): string | null {
  const rule = UNLOCK_RULES[level]
  if (!rule) return null
  return `Score ${UNLOCK_SCORE}+ in ${repWord(rule.reps)} at Level ${rule.level}`
}

/** `1 rep`, not `1 reps`. The same bug `dayCount` exists for. */
function repWord(reps: number): string {
  return `${reps} ${reps === 1 ? 'rep' : 'reps'}`
}

/**
 * Where an account actually stands against a tier it has not opened (R8).
 *
 * `unlockRequirement` returns the same sentence before and after the rep that
 * advanced it, which makes the one screen that could show progress show a
 * constant instead. This returns the numbers, so a bar can move.
 *
 * Null means the tier is already open, or was never gated. `have` is capped at
 * `need` — a user who has run four qualifying reps at a tier they never went
 * back to is not "4 of 2".
 */
export interface UnlockProgress {
  /** The tier that opens. */
  level: Level
  /** The tier the qualifying reps have to be run at. */
  fromLevel: Level
  have: number
  need: number
}

export function unlockProgress(
  level: Level,
  qualifyingByLevel: Record<number, number>,
): UnlockProgress | null {
  const rule = UNLOCK_RULES[level]
  if (!rule) return null
  const have = Math.min(rule.reps, qualifyingByLevel[rule.level] ?? 0)
  if (have >= rule.reps) return null
  return { level, fromLevel: rule.level, have, need: rule.reps }
}

/** `1 of 2 reps at 70+ on Level 02`. The meter's own words (R8). */
export function unlockProgressLabel(progress: UnlockProgress): string {
  return `${progress.have} of ${repWord(progress.need)} at ${UNLOCK_SCORE}+ on Level ${String(progress.fromLevel).padStart(2, '0')}`
}

/**
 * The next tier this account can open, and how far along it is.
 *
 * The result screen shows one meter after every rep, and "the next one" is the
 * lowest tier still shut — climbing the ladder out of order is not a thing the
 * roster allows, so the lowest is always the one being worked towards.
 */
export function nextUnlockProgress(qualifyingByLevel: Record<number, number>): UnlockProgress | null {
  for (const level of [1, 2, 3, 4] as Level[]) {
    const progress = unlockProgress(level, qualifyingByLevel)
    if (progress) return progress
  }
  return null
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
  for (const level of [1, 2, 3, 4] as Level[]) {
    const rule = UNLOCK_RULES[level]
    if (!rule || (qualifyingByLevel[rule.level] ?? 0) >= rule.reps) open.add(level)
  }

  /**
   * Two rules that only ever ADD, and both exist because R2 gated tier 2.
   *
   * §08 is explicit that a tier only ever opens — "a bad week does not take a
   * character away" — and gating a tier that used to be free is the one change
   * that can retroactively shut one. These two make sure it cannot.
   *
   * **A tier you have already run a qualifying rep at is open.** You can only
   * start a rep against somebody the roster let you reach, so a graded 70+ at a
   * tier is proof that tier was open to you — and an account that scored 79
   * against Nadia back when she was free must not find her locked because it
   * never happened to score 70+ against Tess. This is the rule that stops the
   * gate reaching backwards; it takes nothing away from the gate itself,
   * because a new account has no qualifying reps anywhere.
   *
   * **And the ladder cannot have a hole in it.** Each gate names only the tier
   * directly below, so an account with two qualifying reps against Nadia and
   * none against Tess satisfied tier 3 and failed tier 2 — the roster drew
   * **Maya and Robin open with Nadia locked between them**, which is not a
   * ladder. Closed downwards, never upwards: closing upwards would take Maya
   * away from somebody who had earned her.
   */
  for (const level of [1, 2, 3, 4] as Level[]) {
    if ((qualifyingByLevel[level] ?? 0) > 0) open.add(level)
  }

  const top = Math.max(...open)
  for (const level of [1, 2, 3, 4] as Level[]) {
    if (level < top) open.add(level)
  }
  return open
}

/**
 * The tiers whose own gate has actually been met.
 *
 * `unlockedLevels` answers *what may I open*, and since R2 it answers it
 * generously: a tier you have already played is open, and a tier below an open
 * one is open, both so that gating tier 2 could not reach backwards and shut a
 * character somebody already had (§08 — a tier only ever opens).
 *
 * This answers a different question — *what did they earn* — and it is the one
 * `syncLevel` records a moment for. An account grandfathered into tier 2
 * because it once scored 79 against Nadia is not shown "Level 02 unlocked": it
 * did not just unlock anything, and a celebration for something that was
 * already true is exactly the noise the `UNLOCK_RULES[tier] !== null` filter
 * existed to avoid in the first place.
 */
export function earnedLevels(qualifyingByLevel: Record<number, number>): Set<Level> {
  const earned = new Set<Level>()
  for (const level of [1, 2, 3, 4] as Level[]) {
    const rule = UNLOCK_RULES[level]
    if (rule && (qualifyingByLevel[rule.level] ?? 0) >= rule.reps) earned.add(level)
  }
  return earned
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
  return level >= 4 ? 'GUARDED' : level === 3 ? 'OPEN' : 'ENGAGED'
}
