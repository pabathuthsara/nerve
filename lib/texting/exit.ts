/**
 * Going, and having gone, in a thread.
 *
 * ── WHY THE STATE DECIDES AND THE MODEL DOES NOT ─────────────────────────
 *
 * `lib/warmth/leaving.ts` is the write-up and it was paid for on the voice arm:
 * leaving used to be a REQUEST to the model — an `EXIT_SENTINEL` she had to
 * remember to emit while also writing a line — so a spoken goodbye committed
 * nothing and she said one three times while the rep ran to the clock.
 *
 * The old text mode inherited exactly that design and nothing else: `ended`
 * came only from the sentinel. This file replaces it. The sentinel is demoted
 * to a hint that can move the state forward; it can no longer be the only route
 * out, and it can never move the state backwards because `advanceExit` is
 * monotonic.
 *
 * `SceneExit` itself is READ from `lib/warmth/leaving.ts` rather than
 * redeclared, because "present, wrapping, leaving" means the same three things
 * in both sections and two enums would eventually disagree about which is
 * which.
 *
 * ── THE THREE ENDINGS, AND WHY TWO OF THEM ARE SILENT ────────────────────
 *
 *   warm       she says one last thing and goes. A real line, a reason, and
 *              the door left open.
 *   faded      she stops replying. No final message at all.
 *   dismissed  he told her to go away, and she went. Also no final message.
 *
 * **The two cold endings produce silence, and that is the whole feature.**
 * "Left on read" is the most instructive signal texting has: everybody already
 * knows how to read it, it costs nothing to render, and it is the one thing a
 * spoken rep physically cannot do. A character who delivers a closing speech
 * about why she is disengaging is doing the user's noticing for him, which is
 * the same failure as coaching during a live rep (§05).
 *
 * ── AND THE WARM EXIT IS A BUDGET, NOT A COIN FLIP ───────────────────────
 *
 * The ask was "randomly she says she has to go". Randomness in an outcome that
 * reads as a verdict is a slot machine, and this codebase already refuses those
 * on the record — `BREAKTHROUGHS_PER_SESSION` is 2 because "a third would be a
 * slot machine rather than a conversation". So it is a turn budget with jitter
 * on the exact exchange, seeded from the thread: unpredictable-feeling, never
 * arbitrary, and identical on every replay and every device.
 *
 * Pure and synchronous. Nothing here sees a model or a clock of its own.
 */

import { advanceExit, isDismissal, isUserFarewell, type SceneExit } from '@/lib/warmth/leaving'
import { flattenPunctuation } from '@/lib/warmth/text'
import { bandFor, bandIndex, type WarmthBand } from '@/lib/warmth/bands'
import { seededRandom } from '@/lib/voice/seed'

export type { SceneExit }

/**
 * Constructions that contain a dismissal and are not one.
 *
 * ── THE DEFECT THIS EXISTS FOR, FOUND BY THE AUDITION HARNESS ────────────
 *
 * `isDismissal` in `lib/warmth/leaving.ts` matches `/\b(?:get|go)\s+(?:lost|away)\b/`,
 * and on the bench a player sent:
 *
 *   "did you end up dancing at all or just trying not to get lost in the noise?"
 *
 * **The thread ended on turn two, marked `dismissed`.** An ordinary, friendly,
 * curious question was read as the user telling her to go away — and because a
 * dismissal is the one exit that commits immediately, there was no wind-down
 * and no way back.
 *
 * ── WHY THE FIX IS HERE AND NOT THERE ────────────────────────────────────
 *
 * `leaving.ts` is Tier 0 (rule 19, `TEXTING-PLAN.md` §0). It is read by every
 * dating character, its patterns were tuned against measured reps, and a
 * texting audition is not the ceremony that file's header asks for. So texting
 * NARROWS the shared predicate at its own call site rather than editing it.
 *
 * **The same false positive exists on the dating arm** and is recorded in
 * `TEXTING-PLAN.md` §18 as owed — it is rarer in speech, where "get lost in the
 * noise" is a less likely sentence than it is in a typed question, but it is
 * the same hole and it should be fixed there deliberately.
 *
 * Each entry is the dismissal verb followed by something it is happening TO,
 * which is what makes it a description rather than an instruction. "Get lost."
 * is an imperative with no object; "get lost in the noise" has one.
 */
const BENIGN = new RegExp([
  /\bget(?:ting)?\s+lost\s+(?:in|on|at|among|amongst|down|inside|within)\b/,
  /\bgo(?:ing)?\s+away\s+(?:for|to|on|with|next|this|last|in)\b/,
  /\b(?:i|we|they|she|he|it)\s+(?:get|got|gets|go|went|goes)\s+(?:lost|away)\b/,
  /\bdon'?t\s+(?:want\s+to\s+)?get\s+lost\b/,
  /\bnot\s+to\s+get\s+lost\b/,
].map((pattern) => pattern.source).join('|'), 'i')

/**
 * He told her to go away, and meant her.
 *
 * A NARROWING of the shared predicate, never a replacement: everything
 * `isDismissal` refuses is still refused here. What is added is the exclusion
 * above, because this predicate ENDS A THREAD on the turn it fires and a false
 * positive costs somebody the whole conversation.
 */
export function isTextingDismissal(text: string): boolean {
  const flat = flattenPunctuation(text).trim()
  if (!isDismissal(flat)) return false
  return !BENIGN.test(flat)
}

/**
 * How a thread finished.
 *
 * `null` while it is still running. Stored on the row rather than recomputed,
 * because the debrief has to be able to say what happened months later and the
 * transcript alone cannot distinguish "she faded" from "he stopped typing".
 *
 * **`abandoned` is not one the exit layer can produce**, and that is why it is
 * here rather than inferred. Only `startFresh` writes it. It exists because
 * marking a thread the user closed himself as `faded` had the debrief tell him
 * *"She read your last message and did not answer it"* — a lie about the one
 * signal this whole section teaches, on the screen whose job is to explain what
 * happened.
 */
export type TextingEnding = 'warm' | 'faded' | 'dismissed' | 'abandoned'

/**
 * Warmth at or below which she is on her way out.
 *
 * Inside CLOSED (0-19) rather than at its floor. A thread that has fallen this
 * far has had several dead ends or a hostile turn in it, and the band's own
 * directive at that point is "answer and stop" — a person who has reached that
 * and keeps going is a person who cannot leave, which is the complaint this
 * whole section started from.
 */
export const COLD_FLOOR = 12

/**
 * Consecutive dead ends that commit a cold exit.
 *
 * Three, matching the authored exit condition every dating persona already
 * carries ("They give you three genuinely dead-end replies in a row"). The
 * texting characters carry the same sentence, so the state and the contract
 * agree about the number rather than racing each other to a different one.
 */
export const DEAD_END_EXIT = 3

/**
 * The band she must have reached for a warm exit to be available.
 *
 * OPEN. Below it, running out of budget is not "she had a nice time and had to
 * go" — it is a conversation that never got going, and dressing that up as a
 * warm goodbye would be scoring the outcome she did not have.
 */
export const WARM_EXIT_BAND: WarmthBand = 'OPEN'

/** The middle of the warm-exit budget, in completed exchanges. */
export const WARM_EXIT_EXCHANGES = 18
/** How far either side of it the jitter reaches. */
export const WARM_EXIT_JITTER = 6

/**
 * The exchange at which she would leave if the thread stays warm.
 *
 * Seeded, so a reload does not re-roll it and two devices agree. Rolled from a
 * SUFFIX of the thread seed rather than the seed itself, so the exit budget and
 * the opening jitter are independent draws off one identity — using the raw
 * seed for both would correlate "she opened warm" with "she leaves late" for no
 * reason anybody chose.
 */
export function warmExitBudget(seed: string): number {
  const roll = seededRandom(`${seed}:exit`)()
  const offset = Math.round((roll * 2 - 1) * WARM_EXIT_JITTER)
  return Math.max(6, WARM_EXIT_EXCHANGES + offset)
}

export interface ExitInput {
  /** Where the thread already is. Never moves backwards. */
  current: SceneExit
  warmth: number
  /** Consecutive dead ends including the latest exchange. */
  deadEndStreak: number
  /** Completed exchanges: his messages and her reply. */
  completedExchanges: number
  /** Everything he sent in the latest exchange, joined. */
  lastUserText: string
  /** The exit budget for this thread (`warmExitBudget`). */
  budget: number
  /** She appended the end-of-scene sentinel to her last reply. */
  modelSignalled?: boolean
}

export interface ExitVerdict {
  exit: SceneExit
  /** Set the moment the ending becomes knowable, and never changed after. */
  ending: TextingEnding | null
}

/**
 * Where the thread is after this exchange.
 *
 * Order matters and it is the design:
 *
 *  1. A dismissal is immediate and total. He told her to go; a character who
 *     answers that with a wind-down turn has not heard him.
 *  2. His own farewell is answered warmly — he is the one ending it, politely,
 *     and the single rudest thing this product can do to somebody practising
 *     how to leave a conversation is reply with a fresh question.
 *  3. The cold conditions, which wind down through `wrapping` so the withdrawal
 *     is visible while there is still time to read it.
 *  4. The warm budget, last, because it only applies to a thread that none of
 *     the above has claimed.
 */
export function nextExit(input: ExitInput): ExitVerdict {
  const { current } = input

  // Already finished. Monotonic means monotonic.
  if (current === 'leaving') return { exit: 'leaving', ending: null }

  if (isTextingDismissal(input.lastUserText)) {
    return { exit: advanceExit(current, 'leaving'), ending: 'dismissed' }
  }

  // HE IS LEAVING, POLITELY. She answers it and the thread closes warmly,
  // whatever the meter says — a user who says "right, I'm off" and is met with
  // a fresh question has been told the character cannot hear him.
  if (isUserFarewell(input.lastUserText)) {
    return { exit: advanceExit(current, 'leaving'), ending: 'warm' }
  }

  const cold =
    input.deadEndStreak >= DEAD_END_EXIT || input.warmth <= COLD_FLOOR

  if (cold) {
    // Through `wrapping` first, so there is one visibly shorter, colder reply
    // before the silence. Going straight to `leaving` would make a thread end
    // with no warning at all, and signal-reading needs a signal.
    if (current === 'present') return { exit: 'wrapping', ending: null }
    return { exit: 'leaving', ending: 'faded' }
  }

  const warmEnough = bandIndex(bandFor(input.warmth)) >= bandIndex(WARM_EXIT_BAND)

  // The model may bring the ending forward when one of her authored exit
  // conditions genuinely fires. It can never push it back, and it can never
  // produce a cold ending — a character who decides to go while the meter is
  // warm is a character who had somewhere to be.
  if (input.modelSignalled && warmEnough) {
    return { exit: advanceExit(current, 'leaving'), ending: 'warm' }
  }

  if (warmEnough && input.completedExchanges >= input.budget) {
    if (current === 'present') return { exit: 'wrapping', ending: null }
    return { exit: 'leaving', ending: 'warm' }
  }

  // A thread that was winding down and has been pulled back out of it STAYS
  // wrapping, because `advanceExit` is monotonic and that is the point of it.
  // Recovery is possible right up to the last message — what it buys is a
  // better final exchange, not an infinite conversation.
  return { exit: current, ending: null }
}

/**
 * Whether she writes a reply at all this turn.
 *
 * The whole of "left on read", in one predicate. A cold ending means she has
 * read it and has nothing more to send, so no generation happens — which is
 * also why a faded thread costs less than a warm one rather than more.
 */
export function repliesAtAll(exit: SceneExit, ending: TextingEnding | null): boolean {
  if (exit !== 'leaving') return true
  return ending === 'warm'
}
