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
  | 'hostility'
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

/**
 * Contempt, read WITHOUT consulting the fast score.
 *
 * The measured failure: a user was openly contemptuous for two minutes and
 * warmth rose from 47 to 52, because "What the fuck?" was scored as an open
 * question. The structural cause is that the one layer which can recognise
 * hostility — the slow scorer — is gated behind the one layer that cannot:
 * `negative-turn` only routes there at `fastRaw <= -3`, and the fast scorer has
 * no representation for contempt at all. A hostile turn that scores POSITIVELY
 * mechanically is therefore invisible to the only thing that could judge it.
 *
 * So this reads the text and nothing else, and it fires on its own. A false
 * positive costs one cheap model call off the hot path; a false negative costs
 * the product the claim that it teaches anything.
 *
 * ── WHY IT IS DIRECTED, NOT MERELY RUDE ─────────────────────────────────
 *
 * Unlike `PERSONAL_MARKERS` above, this one is tuned for PRECISION as well,
 * because it has a second consumer: `lib/warmth/fast.ts` refuses to pay
 * `open-question` or `engaged-length` on a flagged turn. That is a scoring
 * consequence, and charging an enthusiastic user for "this is fucking great"
 * would be its own version of the filler-rate mistake §07 already made once.
 *
 * Hence: profanity only where it is DIRECTED or exclamatory, second-person
 * insults, imperatives to leave, and explicit dismissals. Bare profanity in the
 * middle of a sentence is not contempt and is deliberately not matched.
 */
const HOSTILITY = new RegExp([
  // Directed or exclamatory profanity. "What the fuck?" as an exclamation, or
  // aimed at him — but NOT "what the hell is that one about", which is a
  // person being curious with their voice up.
  /(?:^|[\s,;:—-])(?:what|who) the (?:fuck|hell)(?:\s*[?!.…]*\s*$|\s+(?:are|is|do|did|was|were|have)\s+(?:you|your|u)\b)/,
  /\bfuck (?:you|off|this|that|sake)\b/,
  /\b(?:piss|sod|bugger|jog) off\b/,
  /\b(?:get|go) (?:lost|away)\b/,
  /\bleave me alone\b/,
  /\bshut (?:up|it|the)\b/,
  // Second-person insults, with the usual intensifiers in between.
  /\byou(?:'?re| are| sound| seem)(?: so| such| a| an| really| very| just| being| like)*\s+(?:rude|creepy|weird|boring|stupid|dumb|thick|pathetic|annoying|useless|awful|terrible|horrible|obnoxious|arrogant|fake|a robot|an ai|a bot|a bitch|an idiot|a creep|a loser|a prick|a dick)\b/,
  // Naming him as one, without the copula. "you idiot", "you absolute muppet".
  /\byou(?: absolute| complete| total| stupid| fucking)* (?:idiot|moron|bitch|bastard|prick|dickhead|wanker|twat|arsehole|asshole|muppet|loser|creep|freak)\b/,
  // Dismissals. Deliberately not bare "whatever" or "I don't care", which are
  // ordinary English about a topic rather than about the person.
  /\b(?:who cares|nobody cares|couldn'?t care less|get over yourself|grow up|do one)\b/,
  /\bthis is (?:a waste of|pointless|stupid|boring)\b/,
].map((pattern) => pattern.source).join('|'), 'i')

/**
 * True when this turn is contempt aimed at her.
 *
 * Exported because two layers need the same answer: this file routes it to the
 * slow scorer, and `fast.ts` refuses to pay a positive on it. One filter, so
 * the trigger and the guard cannot drift apart.
 */
export function hasHostilityMarker(text: string): boolean {
  return HOSTILITY.test(text)
}

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
  /** Fewer than three words. `FastScore.deadEnd`. */
  deadEnd?: boolean
}

export function slowScoreTriggers(context: TriggerContext): SlowTriggerReason[] {
  const reasons: SlowTriggerReason[] = []

  if (PERSONAL_MARKERS.test(context.text)) reasons.push('personal-marker')
  // Before `negative-turn` and independent of it, which is the entire point:
  // contempt that scores positively on the mechanics can only be caught here.
  if (hasHostilityMarker(context.text)) reasons.push('hostility')
  if (context.fastRaw <= NEGATIVE_TURN_THRESHOLD) reasons.push('negative-turn')
  if (context.wordCount > LONG_TURN_WORDS) reasons.push('long-turn')
  // The count-based floor, but never on a grunt. There is nothing in "Mhm." for
  // a judgement layer to judge, and the cost of asking is not the call: in a
  // real rep the sampler routed a one-word turn to the model and the model
  // returned +2.44, so an acknowledgement pushed the meter UP by more than a
  // dead end had just pushed it down. A mis-transcribed one at that.
  const nothingToJudge = context.deadEnd ?? context.wordCount < 3
  if (!nothingToJudge && context.turnIndex > 0 && context.turnIndex % BASELINE_EVERY_N_TURNS === 0) {
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
