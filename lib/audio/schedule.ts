/**
 * One-shot scheduling.
 *
 * Pure, because the property that matters — that the events never form a
 * pattern — is a property of the numbers, not of the audio graph.
 *
 * Anything distinctive must be scheduled, never looped. A page turn inside a
 * looping bed is recognisable the second time it comes round and stops being
 * scenery, which is worse for immersion than having no page turn at all.
 */

import type { OneShot } from './types'

export function nextIntervalSeconds(
  range: readonly [number, number],
  rng: () => number = Math.random,
): number {
  const [min, max] = range
  const low = Math.min(min, max)
  const high = Math.max(min, max)
  return low + rng() * (high - low)
}

export function pickOneShot(
  shots: readonly OneShot[],
  rng: () => number = Math.random,
): OneShot | null {
  if (shots.length === 0) return null
  const total = shots.reduce((sum, shot) => sum + Math.max(0, shot.weight), 0)
  if (total <= 0) return null

  let roll = rng() * total
  for (const shot of shots) {
    roll -= Math.max(0, shot.weight)
    if (roll <= 0) return shot
  }
  return shots[shots.length - 1] ?? null
}
