/**
 * Adaptive difficulty, and the rule that it is silent going down (§08, §12).
 *
 * "Two strong scores bumps the dials up within the level; two weak ones eases
 * them back. **Never announce a downward adjustment.** Telling a struggling
 * user you've made it easier lands as humiliation and is the fastest way to
 * lose them."
 *
 * That last rule is why this module returns a *direction* rather than a
 * message, and why the direction is a three-way value with `announce` on it
 * rather than a boolean the caller has to remember to check. The downward path
 * cannot emit anything, so it does not get given anything to emit.
 *
 * Pure. The engine already reads its trajectory through a getter, so applying
 * an offset is a change to the config the live page builds and nothing else —
 * no engine change, which is the whole reason the getter exists.
 */

import type { Trajectory } from '@/lib/voice/types'

/** Two reps at or above this, at the same level, and she gets harder. */
export const BUMP_AT = 75

/** Two reps below this, and she quietly eases off. */
export const EASE_AT = 55

/** How many recent reps at a level are considered. Both must agree. */
export const WINDOW = 2

/** One step, per adjustment. */
const START_STEP = 2
const GAIN_STEP = 0.08

/**
 * The clamps.
 *
 * Six points of start and a quarter of gain, either way. Wide enough for the
 * adjustment to be felt over a few sessions, narrow enough that a run of bad
 * nights cannot turn Level 6 into Level 2 — which would be the difficulty
 * equivalent of the score drifting, and just as corrosive.
 */
export const MAX_START_BONUS = 6
export const MAX_GAIN_BONUS = 0.25

export interface DifficultyOffset {
  startBonus: number
  gainBonus: number
}

export const NO_OFFSET: DifficultyOffset = { startBonus: 0, gainBonus: 0 }

/**
 * What this rep changes, if anything.
 *
 * `announce` is false for `ease` always and by construction. A caller cannot
 * accidentally surface the downward adjustment by reading the wrong field,
 * because the only field that says "show something" is already false.
 */
export interface DifficultyChange {
  direction: 'bump' | 'ease' | 'hold'
  offset: DifficultyOffset
  /** Only ever true for a bump (§08, §12). */
  announce: boolean
}

function clamp(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value))
}

/**
 * Decide the adjustment from the last few scores at one level.
 *
 * `recent` is newest first. Both of the last two have to agree — one good
 * night is not a trend, and one bad one is even less of a trend when the
 * consequence is invisible to the person having it.
 *
 * An ungraded rep is not a signal and is filtered out by the caller; passing
 * fewer than `WINDOW` scores holds.
 */
export function nextDifficulty(input: {
  recent: readonly number[]
  current: DifficultyOffset
}): DifficultyChange {
  const window = input.recent.slice(0, WINDOW)
  const hold: DifficultyChange = { direction: 'hold', offset: input.current, announce: false }
  if (window.length < WINDOW) return hold

  const bump = window.every((score) => score >= BUMP_AT)
  const ease = window.every((score) => score < EASE_AT)
  if (!bump && !ease) return hold

  // **The sign is the easy thing to get backwards here.** "Bump" means bump the
  // DIFFICULTY up, and a harder character opens colder and warms slower — so a
  // bump SUBTRACTS from start and gain. Easing off adds. Getting this inverted
  // would make the product quietly reward struggling and punish improving,
  // and because the downward path is silent (§12) nobody would be told.
  const step = bump ? -1 : 1
  const offset: DifficultyOffset = {
    startBonus: clamp(input.current.startBonus + step * START_STEP, MAX_START_BONUS),
    gainBonus: round3(clamp(input.current.gainBonus + step * GAIN_STEP, MAX_GAIN_BONUS)),
  }

  // Already at the clamp. Nothing moved, so nothing is announced either — an
  // "she's going to make you work today" on a rep identical to the last one is
  // a promise the rep does not keep.
  if (offset.startBonus === input.current.startBonus && offset.gainBonus === input.current.gainBonus) {
    return hold
  }

  return { direction: bump ? 'bump' : 'ease', offset, announce: bump }
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000
}

/**
 * Apply an offset to a trajectory.
 *
 * Start and gain only. The ceilings are untouched on purpose: `hardCeiling` is
 * what makes Level 8 unwinnable by construction (§06), and an offset that
 * could lift it would hand Alex to anybody who had two good nights against her
 * — which is the exact lesson that level exists to refuse to teach.
 */
export function withDifficulty(trajectory: Trajectory, offset: DifficultyOffset): Trajectory {
  if (offset.startBonus === 0 && offset.gainBonus === 0) return trajectory
  return {
    ...trajectory,
    start: Math.max(0, trajectory.start + offset.startBonus),
    gain: Math.max(0.1, round3(trajectory.gain + offset.gainBonus)),
  }
}
