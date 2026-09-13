/**
 * Who is doing the work, in a message thread.
 *
 * A NEW FILE BESIDE `lib/warmth/reciprocity.ts`, WHICH IS NOT OPENED (rule 19,
 * `TEXTING-PLAN.md` §0). The dating file's gates are read by every character on
 * the roster, its floors were argued down from ENGAGED to OPEN after a measured
 * failure, and `UserTurnShape` is pinned field for field by
 * `lib/characterization/dating-arm.test.ts`. Nothing here touches any of it.
 *
 * ── WHAT TEXTING ADDS, AND IT IS ONE THING ───────────────────────────────
 *
 * Speech has no equivalent of sending three messages in a row and waiting.
 * Every dating gate reads ONE turn because a spoken conversation cannot produce
 * two in succession — the other person is standing there. A thread can, and
 * what it means is legible:
 *
 *   he double-texted and she is WARM      enthusiasm. Costs nothing.
 *   he double-texted and she is COLD      pressure. It is the single most
 *                                         recognisable way a text conversation
 *                                         goes wrong, and the product should
 *                                         let him feel it rather than explain
 *                                         it.
 *
 * So `TextingTurnShape` carries `messages`, and it is the only field the dating
 * shape does not have. Everything else is the same four questions, asked of a
 * typed turn.
 *
 * ── VOLUME IS NEVER REWARDED ─────────────────────────────────────────────
 *
 * `words` is the BEST SINGLE MESSAGE, never the sum. Summing would mean a user
 * who sends "hey" five times has written a twenty-five word turn, and the
 * mirror cap would hand him a paragraph back for it. He gets credit for the
 * best thing he actually said.
 *
 * ── AND IT CARRIES NO WARMTH OPINION OF ITS OWN ──────────────────────────
 *
 * The floors below are the texting band table's own, exactly as the dating
 * file's are the dating table's. That file's header records what happened when
 * they disagreed: every gate sat on ENGAGED for a day, twenty points above the
 * band it was gating, and won every argument silently — a rep that peaked at 56
 * asked no question in seventeen turns and had four authored gates dropped
 * unread. Warmth is the band's. This file only ever answers "what did he just
 * do".
 */

import { bandFor, bandIndex, type WarmthBand } from '../bands'
import { textingSpecFor } from './bands'

/**
 * What he just did, in a thread.
 *
 * The first four fields are the dating shape's four, byte for byte in meaning,
 * so anybody who knows one knows the other. `messages` is the addition and it
 * is documented above.
 */
export interface TextingTurnShape {
  /** Words in his BEST single message. Never the sum — see the header. */
  words: number
  /** He asked something. */
  askedQuestion: boolean
  /** He gave a real turn rather than an acknowledgement. */
  disclosed: boolean
  /** Participation-shaped noise, with something there to answer. */
  deadEnd: boolean
  /**
   * How many messages he sent before she replied. 1 is the ordinary case.
   *
   * Counted by the caller, which is the only thing that knows — see
   * `lib/texting/meter.ts`. Never below 1.
   */
  messages: number
}

/**
 * The band at which she is allowed to drive rather than answer.
 *
 * OPEN, matching the texting table's own `permission` at that band, for exactly
 * the reason the dating file gives: the two agreeing is the point.
 */
export const TEXTING_RECIPROCITY_BAND: WarmthBand = 'OPEN'

/**
 * How much longer than him she may be.
 *
 * Lower than the dating arm's 1.3, and deliberately. A typed conversation shows
 * both sides' message lengths side by side on one screen, permanently, and a
 * person who consistently writes half again as much as you is visible in a way
 * a talker never is. 1.2 leaves her room to be warmer without making the thread
 * look lopsided.
 */
export const TEXTING_MIRROR_RATIO = 1.2

/** The fewest words a dead end is ever worth. "ok" is a complete text message. */
export const TEXTING_MIRROR_FLOOR = 1

/**
 * The number of messages in a row at which pressure starts to read as pressure.
 *
 * Two is not a double-text worth noticing — people finish a thought in a second
 * message constantly, and treating that as neediness would punish ordinary
 * typing. Three in a row with no reply is the shape everybody recognises.
 */
export const PRESSURE_MESSAGES = 3

/** He is pushing: several messages in a row, and she is not warm. */
export function isPressuring(warmth: number, his: TextingTurnShape | null): boolean {
  if (!his) return false
  if (his.messages < PRESSURE_MESSAGES) return false
  return bandIndex(bandFor(warmth)) < bandIndex(TEXTING_RECIPROCITY_BAND)
}

/**
 * Her ceiling this turn: the band's, lowered to mirror what he just gave.
 *
 * The band is still the ceiling — this can only ever LOWER it. Warmth decides
 * how much she gives; reciprocity decides whether this turn has earned it.
 *
 * Both dating exemptions are kept, because both were learned from real reps and
 * neither is about the medium:
 *
 *   a question is never mirrored, because questions are short by construction
 *   and mirroring one punishes the most useful thing a nervous user does
 *
 *   a real turn always buys the band's typical, because two words is right for
 *   a grunt and wrong for a sentence
 */
export function textingMirrorCap(warmth: number, his: TextingTurnShape | null): number {
  const spec = textingSpecFor(bandFor(warmth))
  if (!his) return spec.maxWords
  if (his.askedQuestion) return spec.maxWords

  const mirrored = Math.ceil(his.words * TEXTING_MIRROR_RATIO)
  const floor = his.deadEnd
    ? TEXTING_MIRROR_FLOOR
    : Math.min(spec.typicalWords, spec.maxWords)
  return Math.min(spec.maxWords, Math.max(floor, mirrored))
}

/**
 * Whether she may ask him anything this turn.
 *
 * The dating file's three conditions, unchanged in substance, plus the one the
 * medium adds: **she does not ask a question of somebody who is pushing.** A
 * question is an invitation to keep going, and extending one to a person
 * sending his third unanswered message is the character contradicting the
 * signal she is supposed to be giving.
 */
export function textingMayAsk(warmth: number, his: TextingTurnShape | null): boolean {
  if (!his) return false
  if (bandIndex(bandFor(warmth)) < bandIndex(TEXTING_RECIPROCITY_BAND)) return false
  if (his.deadEnd) return false
  if (isPressuring(warmth, his)) return false
  return his.askedQuestion || his.disclosed
}

/** Whether she may volunteer something he did not ask for. */
export function textingMayVolunteer(warmth: number, his: TextingTurnShape | null): boolean {
  if (!his) return false
  if (bandIndex(bandFor(warmth)) < bandIndex(TEXTING_RECIPROCITY_BAND)) return false
  if (isPressuring(warmth, his)) return false
  return !his.deadEnd
}

/**
 * The clause this adds to the steering line. At most one.
 *
 * Phrased as a permission withdrawn rather than an instruction to perform, for
 * the reason PERSONA-AUDIT §12 gives: anything at maximum recency that reads as
 * "do this now" gets done now.
 *
 * Pressure outranks the dead end when both are true, because it is the larger
 * fact about the last thirty seconds and only one clause is allowed out.
 */
export function textingReciprocityClauses(
  warmth: number,
  his: TextingTurnShape | null,
): string[] {
  if (isPressuring(warmth, his)) {
    return ['He has sent several messages in a row. Reply to the last one only, briefly.']
  }
  if (!his?.deadEnd) return []
  return ['He gave you almost nothing. Match it. Do not fill the gap for him.']
}
