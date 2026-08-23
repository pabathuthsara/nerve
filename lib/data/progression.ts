/**
 * Where the engine's numbers become the numbers a user sees.
 *
 * Two translations live here and nowhere else, because both of them are places
 * a second opinion would silently corrupt a progression record:
 *
 *   levels   the ladder is eight rungs (§06); the frontend shows four tiers.
 *   bands    the engine has six bands, HOSTILE included; the UI has five.
 *
 * Neither translation touches calibration. The engine keeps scoring on 1-8 and
 * on HOSTILE..INVESTED exactly as it was tuned to; this is presentation.
 */

import { ARM_THRESHOLD, KEEP_THRESHOLD } from './rep-rules'
import type { Band, Level } from './types'

/** The four tiers, in the frontend's own words. */
export const LEVEL_NAMES: Record<Level, string> = {
  1: 'Receptive',
  2: 'Neutral',
  3: 'Resistant',
  4: 'Hostile',
}

/**
 * Engine level 1-8 → UI tier 1-4, two rungs per tier.
 *
 * Nadia (1) is tier 1 and Alex (8) is tier 4, which is what the ladder already
 * means: the two ends, with the middle unwritten.
 */
export function uiLevel(engineLevel: number): Level {
  const tier = Math.ceil(engineLevel / 2)
  return Math.min(4, Math.max(1, tier)) as Level
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
 * What each tier costs to open.
 *
 * Derived from history rather than stored: an unlock is a fact about the reps
 * you have already run, and a stored copy of a derived fact is a stored copy
 * that can disagree with it. Tiers 1 and 2 are open from the start — a first
 * session that has to be earned is a first session nobody has.
 */
export const UNLOCK_RULES: Record<Level, { level: Level; wins: number } | null> = {
  1: null,
  2: null,
  3: { level: 2, wins: 2 },
  4: { level: 3, wins: 3 },
}

export function unlockRequirement(level: Level): string | null {
  const rule = UNLOCK_RULES[level]
  return rule ? `Win ${rule.wins} rep${rule.wins === 1 ? '' : 's'} at Level ${rule.level}` : null
}

/** Which tiers are open, given wins per tier. */
export function unlockedLevels(winsByLevel: Record<number, number>): Set<Level> {
  const open = new Set<Level>()
  for (const level of [1, 2, 3, 4] as Level[]) {
    const rule = UNLOCK_RULES[level]
    if (!rule || (winsByLevel[rule.level] ?? 0) >= rule.wins) open.add(level)
  }
  return open
}

/**
 * A rep is a win when she was receptive. Outcome is recorded and worth zero
 * points (§07) — it decides the story the result screen tells, never the score.
 *
 * Kept for rows written before `sessions.won` existed, which have an outcome
 * and nothing else to go on.
 */
export function wonFromOutcome(outcome: string | null | undefined): boolean {
  return outcome === 'receptive'
}

/**
 * Whether the rep is told as a win, reconstructed from a stored row.
 *
 * The live rep decides this itself and passes the answer down, because it is
 * the only thing that knows what she was told at the wind-down. This is the
 * fallback for everything else: a row written before that existed, and the
 * refinement `saveScore` applies when the grader's outcome lands.
 *
 * It reads the same rule off the two numbers the session row keeps. `peak`
 * answers "was she ever willing" — arming — and `final` answers "was she still
 * willing when it ended". Using final alone would call a rep that touched 80
 * and finished at 60 a loss, which it is not.
 *
 * None of this touches the score. A clean rep that ends in rejection still
 * scores what it scored (§07).
 */
export function wonFromRep(input: {
  finalWarmth: number | null
  peakWarmth?: number | null
  outcome?: string | null
}): boolean {
  if (input.outcome === 'receptive') return true
  if (input.outcome === 'rejecting') return false
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
 */
export function chooseTodayPersona<T extends { id: string; level: Level; locked: boolean }>(
  personas: T[],
  progress: { personaId: string; attempts: number; lastAttemptAt: string | null }[],
  currentLevel: Level,
): T | null {
  const available = personas.filter((persona) => !persona.locked && persona.level <= currentLevel)
  const pool = available.length > 0 ? available : personas.filter((persona) => !persona.locked)
  if (pool.length === 0) return null

  const topLevel = Math.max(...pool.map((persona) => persona.level))
  const contenders = pool.filter((persona) => persona.level === topLevel)

  const attemptsFor = (id: string) => progress.find((entry) => entry.personaId === id)?.attempts ?? 0
  const lastFor = (id: string) => progress.find((entry) => entry.personaId === id)?.lastAttemptAt ?? ''

  return [...contenders].sort((a, b) => attemptsFor(a.id) - attemptsFor(b.id) || lastFor(a.id).localeCompare(lastFor(b.id)))[0] ?? null
}

/** The band tone a level card wears. Cosmetic, and consistent everywhere. */
export function levelTone(level: Level): Band {
  return level >= 4 ? 'CLOSED' : level === 3 ? 'GUARDED' : level === 2 ? 'OPEN' : 'ENGAGED'
}
