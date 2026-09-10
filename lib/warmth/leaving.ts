/**
 * Going, and having gone.
 *
 * ── THE DEFECT THIS EXISTS FOR ───────────────────────────────────────────
 *
 * Leaving was a REQUEST to the model and never a state. Measured in a real rep
 * on 9 September:
 *
 *   him  "Just fuck off."
 *   her  "Right. You've made your point. Enjoy your Sunday."
 *   him  "Why are you still here?"
 *   her  "That's not how I spend my mornings, but alright. Your call."
 *   him  "Go away."
 *   …and the rep ran to the three-minute clock with both of them still in it.
 *
 * She said goodbye and then kept talking, three times. Two separate mechanisms
 * produced that, and neither is a prompt problem:
 *
 *  1. **The only voluntary exit is a sentinel.** `EXIT_SENTINEL` is the sole
 *     route out, so an exit is something the model has to remember to emit
 *     while also writing a line. A spoken goodbye commits nothing.
 *  2. **The steering line argues against it.** `wantClauses` at warmth 20-59
 *     ships "You are not going yet." as the last system message before every
 *     generation — so the most recent instruction she has, on the turn after
 *     she said goodbye, is that she is staying.
 *
 * Nadia's rep is the same failure without the hostility: she said she had
 * better check on the present, and then answered the next turn with a fresh
 * question about his secret talent. A farewell that the next turn can undo is
 * not a farewell.
 *
 * ── WHAT THIS FILE IS ────────────────────────────────────────────────────
 *
 * A monotonic scene state and two narrow lexical predicates. Pure, synchronous,
 * no model, no latency — the answer is computed from the transcript the fast
 * scorer already has in hand.
 *
 * It is a NEW FILE beside the judgement layer rather than a parameter added to
 * it, which is the shape `INTERVIEW-PLAN.md` §0 asks for and the shape
 * `PERSONA-AUDIT.md` records the cost of ignoring.
 */

import { flattenPunctuation } from './text'

/**
 * Where the scene is, and it only ever moves forward.
 *
 *   present   the ordinary state. Nothing about leaving is true.
 *   wrapping  the wind-down has been handed over — thirty seconds out, or she
 *             has decided to go. She is finishing, not continuing.
 *   leaving   committed. The next line is her last and the rep ends after it.
 *
 * Monotonic is the whole point. `closingHandover` was a one-shot boolean that
 * the session cleared as soon as it had been read, so ordinary steering resumed
 * on the very next turn and undid the goodbye. A state that can move backwards
 * is not a state, it is a flag.
 */
export type SceneExit = 'present' | 'wrapping' | 'leaving'

const ORDER: Record<SceneExit, number> = { present: 0, wrapping: 1, leaving: 2 }

/**
 * The later of two states. Never the earlier one, whichever way round they came.
 *
 * Exported rather than inlined because three callers need the same guarantee —
 * the session, the steering context and the tests — and a monotonicity rule
 * implemented three times is a monotonicity rule with three chances to be wrong.
 */
export function advanceExit(current: SceneExit, next: SceneExit): SceneExit {
  return ORDER[next] > ORDER[current] ? next : current
}

/** She has decided to go, whether or not she has said the last line yet. */
export function isLeaving(exit: SceneExit): boolean {
  return exit !== 'present'
}

/**
 * He told her to go away, unambiguously.
 *
 * A STRICT SUBSET of `HOSTILITY` in `./triggers.ts`, and the narrowness is
 * load-bearing: this predicate ENDS A REP, so a false positive costs the user
 * the rest of their three minutes and one of the reps they paid for. Only
 * imperatives to leave qualify — not insults, not profanity, not "this is
 * boring", all of which are rude and none of which are an instruction to go.
 *
 * "Get lost" and "go away" are here; "you're being weird" is not. A user who is
 * being unpleasant gets a cold character and a low score, which is the product
 * working. A user who says "leave me alone" gets left alone, which is the
 * product being honest about what he just did.
 */
const DISMISSAL = new RegExp([
  /\bfuck\s*off\b/,
  /\b(?:piss|sod|bugger|jog)\s*off\b/,
  /\bdo one\b/,
  /\b(?:get|go)\s+(?:lost|away)\b/,
  /\bgo\s+somewhere\s+else\b/,
  /\bleave\s+me\s+alone\b/,
  /\bget\s+out\s+of\s+(?:here|my\s+face)\b/,
  // ANCHORED, and that is not a detail. Unanchored, "go" at the end of a turn
  // matches "I should go." — which is the user saying a polite goodbye, the
  // exact opposite claim, routed to the exit that reads as him being hostile.
  // Only the bare imperative is a dismissal.
  /^\s*(?:just\s+)?(?:leave|go)\s*[.!]*\s*$/,
].map((pattern) => pattern.source).join('|'), 'i')

export function isDismissal(text: string): boolean {
  return DISMISSAL.test(flattenPunctuation(text).trim())
}

/**
 * He is the one ending it, politely.
 *
 * The other half of a committed exit and the commoner one. A user who says "I
 * should get going" and is answered with a fresh question has been told the
 * character cannot hear him, which is the single rudest thing this product can
 * do to somebody practising how to leave a conversation.
 *
 * Deliberately requires a FIRST-PERSON departure or a bare valediction. "You
 * should go" is not this (it is a dismissal); "going to the gym later" is not
 * this either, which is why the movement verbs all require a leaving frame
 * around them.
 */
const FAREWELL = new RegExp([
  /\bi(?:'?m| am| will| shall|'?ll)?\s*(?:should|need to|have to|gotta|better|must)?\s*(?:get going|get off|head off|head out|be off|make a move|take off|shoot off)\b/,
  /\bi(?:'?ll| will| should| need to| have to| gotta| better)\s+(?:go|leave|run|split)\b/,
  /\bi(?:'?ve| have)\s+(?:got\s+)?to\s+(?:go|run|leave|head off|get going)\b/,
  // PAST TENSE ONLY. "Nice to meet you" is what a person says when a
  // conversation STARTS, and an exit predicate that fires on it would end the
  // rep on turn two. "It was good talking to you" cannot be an opener.
  /\b(?:it\s+)?was\s+(?:nice|lovely|good|great)\s+(?:to\s+)?(?:meet|meeting|talk|talking to|speak|speaking to|chat|chatting with)(?:\s+you)?\b/,
  /\b(?:nice|lovely|good|great)\s+(?:meeting|talking to|speaking to|chatting with)\s+you\b/,
  /\b(?:see you|catch you)\s+(?:later|around|soon)\b/,
  /^\s*(?:bye|goodbye|bye bye|cheers then|take care|later)\s*[.!]*\s*$/,
  /\b(?:have a good|enjoy the rest of)\s+(?:one|day|evening|morning|afternoon|night)\b/,
].map((pattern) => pattern.source).join('|'), 'i')

export function isUserFarewell(text: string): boolean {
  return FAREWELL.test(flattenPunctuation(text).trim())
}
