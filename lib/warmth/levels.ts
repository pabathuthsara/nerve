/**
 * Trajectory helpers.
 *
 * Round 10 moved the per-level numbers onto the persona itself, as LAYER 1 of
 * the schema — "how warmth MOVES" is what a level IS, so keeping a parallel
 * table keyed by level number meant two places to change one difficulty curve.
 * What survives here is the arithmetic that reads a trajectory, plus a fallback
 * for a level nobody has authored yet.
 *
 * Warmth is asymmetric everywhere: it rises slowly and falls fast. That is not
 * a difficulty knob, it is how strangers actually work, and it is what makes
 * the meter teach anything. A user who can undo a bad turn by saying two nice
 * things has learned nothing.
 */

import type { Trajectory } from '@/lib/voice/types'
import { PERSONAS } from '@/lib/personas'

/** The clamp that actually applies inside a session. */
export function effectiveCeiling(trajectory: Trajectory): number {
  return Math.min(trajectory.hardCeiling, trajectory.sessionCeiling)
}

/**
 * Read from the roster rather than kept as a second table.
 *
 * All eight levels are authored now, and a level's difficulty curve IS the
 * trajectory of the character who holds that rung — a parallel copy here would
 * be a second answer to the same question.
 */
const AUTHORED: Record<number, Trajectory> = Object.fromEntries(
  Object.values(PERSONAS)
    .filter((persona) => persona.track === 'dating')
    .map((persona) => [persona.level, persona.trajectory]),
)

/**
 * The trajectory for a level.
 *
 * The fallback survives for a level nobody has authored — an interview or
 * language rung, say. Interpolating would invent a difficulty curve nobody
 * designed, so the nearest authored level is used instead.
 */
export function levelTrajectory(level: number): Trajectory {
  const exact = AUTHORED[level]
  if (exact) return exact
  const authored = Object.keys(AUTHORED).map(Number).sort((a, b) => a - b)
  const nearest = authored.reduce(
    (best, candidate) => (Math.abs(candidate - level) < Math.abs(best - level) ? candidate : best),
    authored[0] ?? 1,
  )
  return AUTHORED[nearest] ?? PERSONAS['nadia']!.trajectory
}

export type { Trajectory }
