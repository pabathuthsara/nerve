/**
 * How a character opens up in text mode — and how far she is allowed to.
 *
 * ── WHY THIS IS NOT THE WARMTH ENGINE ───────────────────────────────────────
 *
 * A voice rep scores every user turn twice: a local structural pass and a model
 * judgement (`lib/warmth/`). Text mode runs neither, on purpose.
 *
 * The model pass costs money, and text mode's entire promise is that it costs
 * no quota — a free surface that quietly bills two model calls per message is
 * the same dishonesty as a rep you were charged for and never heard. The local
 * pass is worse than useless here rather than merely absent: it reads pause
 * length, filler rate and hesitation off a spoken turn's timings, and a typed
 * message has none of those. Feeding it zeros would not be a cheaper meter, it
 * would be a meter measuring nothing and saying so with a number.
 *
 * So text mode does not judge what was said. It tracks only that the
 * conversation is still going, which is the one thing it can honestly observe,
 * and it moves her along **her own authored trajectory** while it does —
 * `start`, `gain` and `sessionCeiling` are the same numbers the voice rep was
 * tuned on, so a character who is warm in text is warm for the reason she is
 * warm anywhere.
 *
 * ── THE CEILING, WHICH IS A PRODUCT RULE ────────────────────────────────────
 *
 * Text never reaches `ARM_THRESHOLD`. She cannot be armed, so she never offers
 * a number and there is no win to take. That is not a limitation to apologise
 * for — it is what keeps the two modes from competing. The number is the voice
 * rep's payoff, and a payoff that can be farmed in a mode with no meter, no
 * clock and no cost is a payoff worth nothing.
 *
 * Pure, so the ceiling is a test rather than a promise.
 */

import { ARM_THRESHOLD } from '@/lib/data/rep-rules'
import type { Persona } from '@/lib/voice/types'

/**
 * The hard stop, a clear step below the arm line.
 *
 * Five points of daylight rather than one, so that no rounding, no future
 * retune of a persona's gain, and no off-by-one in a comparison can put a text
 * conversation on the threshold by accident.
 */
export const TEXT_WARMTH_CEILING = ARM_THRESHOLD - 5

/**
 * Where she stands after this many of his turns.
 *
 * Linear in her own `gain`, which is the per-turn number her trajectory was
 * authored with. No jitter: the same conversation reopened on another device
 * must not find her in a different mood, and there is no session here to seed
 * one from.
 */
export function textWarmth(persona: Persona, userTurns: number): number {
  const trajectory = persona.trajectory
  const raised = trajectory.start + Math.max(0, userTurns) * trajectory.gain
  const ceiling = Math.min(trajectory.sessionCeiling, TEXT_WARMTH_CEILING)
  return Math.round(Math.min(ceiling, Math.max(0, raised)))
}
