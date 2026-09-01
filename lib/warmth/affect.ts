/**
 * Three axes, because a person is not a dimmer switch.
 *
 * Warmth on its own can only say "more open" or "less open". A stranger is
 * running at least three semi-independent states, they move at different rates,
 * and — this is the part that reads as a real person — **they conflict**:
 *
 *   INTEREST  do I want to keep talking to you. This is `warmth`, unchanged:
 *             every threshold, every band, every stored column and the whole
 *             difficulty ladder are written against it and it stays the
 *             headline number.
 *   COMFORT   do I feel at ease. Falls hard and fast on anything that misjudges
 *             the distance between us; recovers slowly, and never as fast as
 *             interest does.
 *   LIKING    do I like YOU, as opposed to the subject. The slowest and least
 *             volatile of the three, moved mostly by being picked up on and by
 *             things landing.
 *
 * Collapsed onto one axis none of the interesting states can exist. Interested
 * but not at ease is the intense stranger. At ease but bored is the nice person
 * you have nothing to say to. Likes him but guarded is half of everyone. Each
 * one is instantly recognisable as a human being and none of them is reachable
 * with a single number.
 *
 * This module owns only the reading — how the three combine into a posture, and
 * what that posture tells her. The moving is the engine's, so there is still
 * exactly one place a turn is applied.
 */

import type { WarmthBand } from './bands'

export interface AffectState {
  /** Interest. The headline axis; everything downstream still reads this. */
  warmth: number
  comfort: number
  liking: number
}

/**
 * How the three stand RELATIVE to each other.
 *
 * Relative rather than absolute on purpose: "comfort 45" means nothing on its
 * own, while "comfort well below interest" is a person leaning in and holding
 * back at the same time, which is a thing anyone would recognise from across a
 * room. The band already says how much she gives; this says what shape it takes.
 */
export type Posture =
  /** Interested, not at ease. Curious at him, closed about herself. */
  | 'wary'
  /** At ease, not interested. Relaxed, warm, going nowhere. */
  | 'at-ease'
  /** Likes him past what the conversation has earned. */
  | 'taken'
  /** Engaged with the subject rather than with him. */
  | 'polite'
  /** The three agree. The band is the whole story. */
  | 'level'

/**
 * How far apart two axes must sit before the gap means anything.
 *
 * Wide enough that ordinary turn-to-turn wobble never trips it — a posture that
 * flickers every turn would read as instability rather than as character.
 */
const DIVERGENCE = 15
/** Liking runs slower than interest, so it needs less room to count as ahead. */
const LIKING_DIVERGENCE = 12

/**
 * How posture is read off the three axes.
 *
 *   `absolute`  the gaps are measured against zero. Today's behaviour, and the
 *               default, because every stored calibration and every tuned
 *               character was measured under it.
 *   `relative`  the gaps are measured against the gaps she OPENED with.
 *
 * ── WHY THERE IS A SECOND MODE (PERSONA-AUDIT §3.1) ──────────────────────
 *
 * `openingAffect` starts comfort well above warmth on purpose: a stranger in a
 * public place is not hostile, she is unavailable. That is right, and it is
 * argued at the bottom of this file. But it opens the axes 15 or more apart for
 * every character whose trajectory starts below 50 — which is the entire
 * shipped roster — so `absolute` reports `at-ease` on turn one of every rep and
 * hands out "Comfortable, not interested. Easy and unhurried, and ask him
 * nothing" before the user has said a word.
 *
 * A posture is meant to say *these axes have moved apart*. Read absolutely it
 * says *these axes were authored apart*, which is not news about anybody, and
 * on Tess it is the exact inverse of her character. Two correct modules
 * composing into a third instruction nobody wrote — the round-6 failure, one
 * layer further out.
 *
 * `relative` is the correct reading and is intended to become the only one.
 * It is opt-in for now because flipping it for the roster is a retune of three
 * tuned characters and wants the stability harness, not a commit.
 */
export type PostureMode = 'absolute' | 'relative'

export function postureOf(
  state: AffectState,
  options: { mode?: PostureMode; opening?: AffectState } = {},
): Posture {
  const { warmth, comfort, liking } = state

  // What counts as "apart". Under `relative` the opening spread is subtracted
  // out, so only divergence the conversation actually produced can fire.
  const base =
    options.mode === 'relative' && options.opening
      ? options.opening
      : { warmth: 0, comfort: 0, liking: 0 }

  const comfortGap = comfort - warmth - (base.comfort - base.warmth)
  const likingGap = liking - warmth - (base.liking - base.warmth)

  // Order matters: discomfort outranks everything. Somebody who is not at ease
  // is not really doing any of the other three, whatever the numbers say.
  if (comfortGap < -DIVERGENCE) return 'wary'
  if (comfortGap > DIVERGENCE) return 'at-ease'
  if (likingGap > LIKING_DIVERGENCE) return 'taken'
  if (likingGap < -DIVERGENCE) return 'polite'
  return 'level'
}

/**
 * The clause a posture adds to the direction, or nothing.
 *
 * `level` is silent by design. When the three axes agree there is nothing to
 * add that the band has not already said, and a redundant clause on every turn
 * is exactly the repetition that flattens her out.
 *
 * Second person, imperative, and about behaviour rather than feeling — a model
 * given "you feel uneasy" narrates it, and a model given "do not offer anything
 * about yourself" does it.
 */
export function postureClause(posture: Posture): string | null {
  switch (posture) {
    case 'wary':
      return 'Curious about him, not at ease. Ask, do not offer anything of your own.'
    case 'at-ease':
      return 'Comfortable, not interested. Easy and unhurried, and ask him nothing.'
    case 'taken':
      return 'You like him more than the conversation. Let it show in how you say it.'
    case 'polite':
      return 'The subject holds you more than he does. Stay on it, not on him.'
    case 'level':
      return null
  }
}

/**
 * The opening spread.
 *
 * Comfort does NOT start where interest starts. A stranger in a public place is
 * not hostile, they are simply unavailable — that is the whole difference
 * between "no" and "not you". So comfort opens well above a cold trajectory's
 * warmth and has further to fall, which is what makes overreach cost something
 * real on level 1 as well as level 8.
 *
 * Liking opens slightly BELOW interest and climbs slower, so early warmth is
 * always about the conversation first and the person second. Deciding you like
 * somebody takes longer than deciding you will keep talking to them.
 */
export function openingAffect(warmthStart: number): AffectState {
  return {
    warmth: warmthStart,
    comfort: Math.min(70, 45 + warmthStart * 0.4),
    liking: Math.max(0, warmthStart - 6),
  }
}

/** Reported alongside the band so telemetry can show the shape, not just the level. */
export interface AffectReading extends AffectState {
  band: WarmthBand
  posture: Posture
}
