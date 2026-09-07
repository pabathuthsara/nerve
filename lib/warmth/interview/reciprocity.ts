/**
 * Who is doing the work, in an interview — where the premise inverts.
 *
 * A NEW FILE BESIDE `lib/warmth/reciprocity.ts`, WHICH IS NOT OPENED (rule 19).
 *
 * ── WHY THE DATING MODEL IS BACKWARDS HERE ───────────────────────────────
 *
 * The dating rule is `min(bandCap, ceil(hisWords × 1.3))`: he gives one word,
 * he gets one. That is exactly right for a stranger in a shop — she is not
 * obliged to carry a conversation he has left, and a stranger visibly losing
 * interest is the signal the product is teaching him to read.
 *
 * Applied to an interview it produces the opposite of an interviewer. A
 * candidate who answers "Yes." would buy a two-word question, which is a
 * stub — and the interviewer's job at that exact moment is to **follow up**,
 * because a one-word answer is the thing an interviewer digs into. So the
 * mirror does not cap her; it becomes a **floor on HIS share**: the shorter he
 * is, the more of the room she is entitled to take, up to her band.
 *
 * And "she may say nothing" becomes something far more valuable rather than
 * disappearing. **Letting a pause sit after a complete answer** is a real
 * interviewer behaviour, it is the single most uncomfortable thing in a real
 * interview, and a candidate who learns to stop talking into it has learned
 * something no amount of question practice teaches.
 *
 * ── AND IT CARRIES NO WARMTH OPINION OF ITS OWN ──────────────────────────
 *
 * `HUMANNESS.md` §7.1 records what happened when the dating version of this
 * file hung every gate on ENGAGED — twenty points above the band table it was
 * gating, and above every `unlocksAt` on the roster. It won every argument
 * silently: a seventeen-turn rep asked nothing and volunteered nothing. That
 * failure is not track-specific and this file must not repeat it. Nothing below
 * reads impression except through the band's OWN floor, and the only question
 * these functions answer is **what did he just do**.
 *
 * Pure functions with tests, the `rep-rules.ts` pattern.
 */

import { bandFor, bandIndex, type WarmthBand } from '../bands'
import { interviewSpecFor } from './bands'
import type { UserTurnShape } from '../reciprocity'

export type { UserTurnShape }

/**
 * A real answer, in words.
 *
 * Higher than the dating arm's eight, because eight words is a real turn in a
 * conversation and a fragment in an interview: "I led the migration" is six
 * words and is a job title with a verb on it.
 */
export const ANSWER_WORDS = 20

/**
 * The band at which she stops working through a list and starts following the
 * conversation.
 *
 * OPEN, and it is the same number the OPEN band's own permission is written
 * against — "You may pick up a detail from their answer and ask about it." The
 * two agreeing is the point, and it is the whole of this file's warmth opinion:
 * a floor under a rule the band already states, never a second statement of it.
 */
export const INTERVIEW_FOLLOW_UP_BAND: WarmthBand = 'OPEN'

/**
 * How much of the room she takes when he leaves it empty.
 *
 * The inverse of the dating mirror. A one-word answer does not buy a one-word
 * question; it buys her whole band, because that is the turn where an
 * interviewer digs in. A long, complete answer buys her the band's TYPICAL —
 * she has heard enough and does not need to fill anything.
 */
export function interviewWordCap(impression: number, his: UserTurnShape | null): number {
  const spec = interviewSpecFor(bandFor(impression))
  if (!his) return spec.maxWords

  // A DEAD END IS THE MOMENT TO ASK MORE, NOT LESS.
  //
  // This is the single line that inverts the dating model, and it is the whole
  // reason the two files exist separately.
  if (his.deadEnd) return spec.maxWords

  // He gave a real answer. She does not need the room, and an interviewer who
  // talks at length after a good answer is an interviewer who is enjoying
  // herself rather than interviewing. Floored at the typical so this can never
  // produce a fragment.
  if (his.words >= ANSWER_WORDS) return Math.min(spec.maxWords, spec.typicalWords)

  return spec.maxWords
}

/**
 * Whether she follows up on what he just said, rather than moving down her list.
 *
 * Two conditions, and both are about him:
 *
 *  1. **Warm enough**, at the floor the band table already uses. Above it the
 *     band still decides the shape: OPEN allows one follow-up, ENGAGED lets her
 *     leave the list entirely. That split is the band's.
 *  2. **There is something to follow up ON.** A dead end is followed up
 *     unconditionally — that is the point — and a real answer is followed up
 *     when it named something concrete. An answer that was a paragraph of
 *     adjectives is not a thread.
 */
export function interviewMayFollowUp(impression: number, his: UserTurnShape | null): boolean {
  if (!his) return false
  if (his.deadEnd) return true
  if (bandIndex(bandFor(impression)) < bandIndex(INTERVIEW_FOLLOW_UP_BAND)) return false
  return his.disclosed || his.words >= ANSWER_WORDS
}

/**
 * Whether she may ask something this turn.
 *
 * **Always, once there is a turn to answer.** An interviewer asks a question on
 * essentially every turn, because that is what an interview is — and the thing
 * that varies is not WHETHER she asks but whether she follows up on what they
 * just said or moves to the next item, which the band directive already owns in
 * its own words at every band.
 *
 * This is separate from `interviewMayFollowUp` on purpose, and the first
 * audition is why. That gate answers "has this answer earned her leaving her
 * list", which is the right question for volunteering and the wrong one for
 * asking at all: a candidate giving five-word answers is neither a dead end
 * (three words or fewer) nor a real answer (twenty or more), so the follow-up
 * gate said no on most turns, `suppressQuestion` went true, and "Do not follow
 * up this turn" was issued and ignored on turn after turn. A directive that is
 * disobeyed every turn teaches the model that the bracketed line is optional,
 * and the bracketed line is the only thing that owns reply length.
 */
export function interviewMayAsk(_impression: number, his: UserTurnShape | null): boolean {
  return his !== null
}

/**
 * When the candidate has answered at length, and then kept going.
 *
 * A complete answer is twenty words. Letting a pause sit after one of those
 * would be reflexive; the technique is for the answer that FILLED THE ROOM, and
 * an over-answer is the honest signal that somebody is already talking to fill
 * space. Twice the bar, so the two are not the same event.
 */
export const OVER_ANSWER_WORDS = ANSWER_WORDS * 2

/**
 * How many of her turns must pass between two pauses.
 *
 * **Measured rather than chosen.** The first audition of Marcus Vance against
 * the under-confident candidate — who over-answers on every single turn — came
 * back with seven silent turns out of twenty-two, because "never twice running"
 * permits every other one. An interviewer who goes quiet after a third of the
 * answers is not applying pressure, she is not listening. Four turns puts it at
 * two or three in a twenty-minute round, which is what it is in life.
 */
export const PAUSE_SPACING_TURNS = 4

/**
 * Whether she may let the pause sit.
 *
 * **The interview equivalent of silence, and it is worth more here than there.**
 * A candidate who has just over-answered, into a room where nobody says
 * anything, is at the exact moment real interviews are lost: most people fill
 * it, and what they fill it with undoes what they just said.
 *
 * Deliberately narrow, and narrow in the opposite direction from the dating
 * rule. It fires on an over-answer rather than an empty one, at most once every
 * few turns, never on the closing turn, and never on his first — an interviewer
 * who greets a candidate with silence is not applying pressure, she is broken.
 *
 * It carries no warmth opinion, exactly like every other gate in this file. It
 * is a fact about what he just did and how recently she last did this.
 */
export function interviewMayLetPauseSit(
  his: UserTurnShape | null,
  options: {
    silentLastTurn?: boolean
    opening?: boolean
    turnsSinceSilence?: number
    /**
     * He actually put a question to her — his turn contains a question mark.
     *
     * **Not `his.askedQuestion`, and the difference is the whole reason this
     * option exists.** That flag is `text.includes('?') || isOpenQuestion(text)`,
     * and `isOpenQuestion` is a lexical heuristic tuned for a stranger's
     * three-word turns: it fires on any text containing "which", "how", "when"
     * or "what". A candidate's paragraph contains one of those essentially
     * always, so reading that flag here silently disabled this gate on every
     * long answer — measured, and the reason the rambler audition came back
     * with zero pauses in twenty-two turns.
     *
     * `fast.ts` is Tier 0 and is not opened; the caller supplies the stricter
     * signal instead. Absent falls back to the flag, which is the conservative
     * direction: it can only ever suppress a pause, never add one.
     */
    askedDirectly?: boolean
  } = {},
): boolean {
  if (!his || options.silentLastTurn || options.opening) return false
  if (his.deadEnd) return false
  if (options.askedDirectly ?? his.askedQuestion) return false
  // Absent means she has never done it, which is the state at the start of
  // every rep and must not be read as "too soon".
  const since = options.turnsSinceSilence ?? Number.POSITIVE_INFINITY
  if (since < PAUSE_SPACING_TURNS) return false
  return his.words >= OVER_ANSWER_WORDS
}

/**
 * The clause this adds to the steering line. One, and only one.
 *
 * Phrased as a direction about HIM rather than a permission to perform, for the
 * same reason the dating arm's is: anything at maximum recency reading as "do
 * this now" gets done now, and on a stateless arm the directive is the last
 * thing read before every generation.
 */
export function interviewReciprocityClauses(
  _impression: number,
  his: UserTurnShape | null,
): string[] {
  if (!his) return []
  if (his.deadEnd) {
    return ['That was not an answer. Ask them for the specific thing, once, and wait.']
  }
  if (his.words >= ANSWER_WORDS) {
    // NAMES THE EXACT OPENER, because "do not restate it back to them" was
    // shipping on every turn of a real rep and being ignored on ten of
    // seventeen: "You said the website Nerve...", "You mentioned switching the
    // voice provider...". A rule the model reads as a style note gets weighed
    // against its habit; two forbidden strings do not.
    return ['Ask your next question directly. Never begin with "You said" or "You mentioned".']
  }
  return []
}
