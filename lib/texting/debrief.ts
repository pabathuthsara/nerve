/**
 * What happened, after she has gone.
 *
 * ── A DEBRIEF AND NOT A SCORECARD, WHICH IS A PRODUCT DECISION ───────────
 *
 * Texting produces no composite, no `sessions` row, no `scores` row, no streak
 * movement and no unlock. `TEXTING-PLAN.md` §16 lists all of that under what is
 * deliberately out of scope, and the `text_threads` migration's own header is
 * the argument: ungraded rows in `sessions` would reach every progress chart,
 * every unlock count and every history read in the product.
 *
 * The second reason is §07. **Outcome is never scored.** If a warm ending
 * scored higher than a cold one, the product would be grading the result of a
 * conversation rather than the way it was had — and the request that started
 * this section ("tell him he did the texting rep well") is exactly the thing
 * rule 2 forbids. So both endings get the same debrief shape, and what it
 * reports is what he DID.
 *
 * ── AND IT COSTS NOTHING ─────────────────────────────────────────────────
 *
 * Every string below already exists. `FastReason.detail` is written by the
 * scorer in plain words — *came back to "shelter" from 5 turns ago*, *3 dead
 * ends in a row* — because the voice arm's telemetry needed it to be readable.
 * No model is called and no second judgement is made.
 *
 * Pure, so what the screen says can be tested without a database.
 */

import type { WarmthEvent } from '@/lib/warmth/engine'
import type { TextingEnding } from './exit'
import type { TextingMeterState } from './meter'

/** One point on her interest line. */
export interface CurvePoint {
  /** Completed exchange index, from 1. */
  exchange: number
  warmth: number
}

/** One turn that moved it, with the scorer's own words for why. */
export interface Mover {
  /** What he sent. Several messages arrive joined by a newline. */
  text: string
  /** Applied delta, signed. Rendered with `tabular-nums`. */
  delta: number
  /** The scorer's reasons, in plain words. */
  reasons: string[]
  /** Exchange index, from 1. */
  exchange: number
}

export interface Debrief {
  curve: CurvePoint[]
  /** Where she started and where she finished. */
  opened: number
  closed: number
  /** The high-water mark, which is often not the end. */
  peak: number
  movers: Mover[]
  /** How it finished, in one sentence. */
  ending: string
  /** True when nothing happened worth charting — a thread of two messages. */
  thin: boolean
}

/** How many turns the debrief names. Three is a lesson; ten is a transcript. */
export const MAX_MOVERS = 3

/** Below this many exchanges there is no curve worth drawing. */
export const MIN_EXCHANGES_FOR_CURVE = 3

/**
 * What ended it, in one sentence.
 *
 * NEITHER OF THESE IS A VERDICT. "She stopped replying" is a fact about what
 * happened; "you failed" would be a judgement about the outcome, and §07 says
 * the outcome is worth zero. No red, no congratulation, and nothing that reads
 * as a grade — `RETENTION-AUDIT.md` §4 keeps guilt copy on the refused list.
 */
export function endingSentence(ending: TextingEnding | null): string {
  switch (ending) {
    case 'warm':
      return 'She ended it herself, and left the door open.'
    case 'faded':
      return 'She read your last message and did not answer it.'
    case 'dismissed':
      return 'You told her to leave, and she did.'
    case 'abandoned':
      return 'You started this one over.'
    default:
      return 'This one is still going.'
  }
}

/**
 * The turns that moved her most, largest absolute move first.
 *
 * ABSOLUTE, so a thread that went badly is as legible as one that went well.
 * Showing only the gains would make a faded thread a blank page at the one
 * moment somebody wants to know what happened.
 */
export function moversFrom(events: readonly WarmthEvent[]): Mover[] {
  return [...events]
    .map((event, index) => ({
      text: event.userText,
      delta: Math.round(event.delta * 10) / 10,
      reasons: event.detail,
      exchange: index + 1,
    }))
    .filter((mover) => Math.abs(mover.delta) >= 0.5 && mover.text.trim().length > 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, MAX_MOVERS)
}

export function buildDebrief(
  meter: TextingMeterState,
  ending: TextingEnding | null,
): Debrief {
  const curve: CurvePoint[] = meter.events.map((event, index) => ({
    exchange: index + 1,
    warmth: Math.round(event.warmthAfter),
  }))

  const opened = Math.round(meter.events[0]?.warmthBefore ?? meter.warmth)
  const closed = Math.round(meter.warmth)
  const peak = curve.reduce((highest, point) => Math.max(highest, point.warmth), opened)

  return {
    curve,
    opened,
    closed,
    peak,
    movers: moversFrom(meter.events),
    ending: endingSentence(ending),
    thin: curve.length < MIN_EXCHANGES_FOR_CURVE,
  }
}
