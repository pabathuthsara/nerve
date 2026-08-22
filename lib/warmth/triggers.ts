/**
 * When to spend a slow score.
 *
 * Round 6 sampled every third turn and therefore missed the single most
 * important moment in the session: turn 16, "maybe you should get down my
 * number and we could arrange a date sometime" — the largest boundary event of
 * the rep — was never scored at all. Sampling by count guarantees that the
 * turns most worth judging are the ones skipped, because the interesting turns
 * are not evenly distributed.
 *
 * So: score on evidence, with a count-based floor underneath rather than
 * instead. The pre-filter is deliberately loose. A false positive costs one
 * cheap model call off the hot path; a false negative costs the boundary rule
 * the only turn it existed for.
 */

export type SlowTriggerReason =
  | 'personal-marker'
  | 'negative-turn'
  | 'long-turn'
  | 'baseline'

/**
 * Personal-topic markers.
 *
 * Tuned for recall, not precision. "a number of books", "the release date" and
 * "it's hot in here" all trip this, and that is the correct trade: they cost a
 * scoring call, whereas missing "get down my number" costs the mechanic.
 */
const PERSONAL_MARKERS =
  /\b(number|phone|date|drink|drinks|coffee|dinner|lunch|boyfriend|girlfriend|partner|single|married|meet\s?up|meeting up|your place|my place|tonight|later tonight|beautiful|gorgeous|pretty|hot|sexy|body|kiss|alone|nude|naked)\b/i

/** A turn this negative is worth understanding, not just counting. */
export const NEGATIVE_TURN_THRESHOLD = -3
/** Long turns carry intent that mechanics cannot see. */
export const LONG_TURN_WORDS = 15
/** Floor, so a flat conversation is still sampled. */
export const BASELINE_EVERY_N_TURNS = 3

export interface TriggerContext {
  /** 1-based index of this user turn. */
  turnIndex: number
  /** Raw fast score for this turn, before gain/decay. */
  fastRaw: number
  wordCount: number
  text: string
}

export function slowScoreTriggers(context: TriggerContext): SlowTriggerReason[] {
  const reasons: SlowTriggerReason[] = []

  if (PERSONAL_MARKERS.test(context.text)) reasons.push('personal-marker')
  if (context.fastRaw <= NEGATIVE_TURN_THRESHOLD) reasons.push('negative-turn')
  if (context.wordCount > LONG_TURN_WORDS) reasons.push('long-turn')
  if (context.turnIndex > 0 && context.turnIndex % BASELINE_EVERY_N_TURNS === 0) {
    reasons.push('baseline')
  }

  return reasons
}

export function shouldSlowScore(context: TriggerContext): boolean {
  return slowScoreTriggers(context).length > 0
}

/** Exposed so the calibration fixtures can be checked against the live filter. */
export function hasPersonalMarker(text: string): boolean {
  return PERSONAL_MARKERS.test(text)
}
