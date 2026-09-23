/**
 * What he just did, in the only terms the meter needs.
 *
 * ── THE DEFECT THIS EXISTS FOR ───────────────────────────────────────────
 *
 * `deadEnd` was "fewer than three words, and not his opening turn". One
 * threshold, standing in for six different things a person can do with a short
 * sentence — and it was wrong in BOTH directions at once. Measured in real reps
 * on 9 September:
 *
 *   "What's up?"   -6, AND +3 as an open question. The same turn.
 *   "How come?"    -6, AND +3 as an open question. The same turn.
 *   "Go away."     -4.03, classified mechanically as a short dead end, with no
 *                  representation anywhere that he had told her to leave.
 *
 * A nervous beginner's two best moves — asking a short question and answering
 * one — are the two the meter punished hardest, while the one move that should
 * have ended the scene was scored as though he had merely run out of things to
 * say. Signal-reading is the skill this product claims to train, and the signal
 * was measuring sentence length.
 *
 * ── WHAT A DEAD END ACTUALLY IS ──────────────────────────────────────────
 *
 * It is NON-PARTICIPATION: he was given something to respond to and he did not
 * respond to it. "Mhm." is a dead end. "Ok." is a dead end. "Yeah, twice." is
 * an ANSWER, and "How come?" is a QUESTION, and neither is a failure of any
 * kind. The distinction cannot be made on word count and can be made on shape,
 * cheaply, with no model — which is what this file is.
 *
 * ── WHY IT IS A NEW FILE ─────────────────────────────────────────────────
 *
 * `reciprocity.ts`, `fast.ts` and `bands.ts` are the files `PERSONA-AUDIT.md`
 * records the cost of reopening, and `INTERVIEW-PLAN.md` §0 asks for a new file
 * beside them rather than a parameter added to them. `UserTurnShape` keeps its
 * four fields byte for byte; `deadEnd` keeps its name and its meaning at every
 * call site. What changes is how the boolean is DECIDED, in one place, with
 * tests.
 *
 * Pure and synchronous. Nothing here sees a model, so nothing here costs a
 * millisecond of the gap between him finishing and her starting.
 */

import { isDismissal } from './leaving'
import { flattenPunctuation } from './text'
import { hasHostilityMarker } from './triggers'

/**
 * The six things a user turn can be, decided in this order — first match wins.
 *
 * The ORDER is the design. A hostile question is a dismissal and never a
 * question, because otherwise "Why are you still here?" is scored as curiosity;
 * that ordering is the whole fix for the rep where warmth rose 27 → 48 during
 * two minutes of contempt.
 */
export type UserTurnKind =
  /** He said nothing intelligible. A transcription artefact or a false trigger. */
  | 'silence'
  /**
   * What arrived is not English, so it is almost certainly what the
   * transcriber MISHEARD rather than what he said (PERSONA-REALISM-REPORT R8).
   *
   * Only ever returned for SPOKEN turns (`TurnKindContext.spoken`): typed text
   * in a thread is what was typed. See `isMisheard`.
   */
  | 'unclear'
  /** Contempt aimed at her, or an instruction to leave. */
  | 'dismissal'
  /** He asked her something. Short by construction; never a failure. */
  | 'question'
  /** Hello, and nothing else yet. */
  | 'greeting'
  /** Participation-shaped noise. "Mm." "Ok." "Right." THIS is the dead end. */
  | 'acknowledgement'
  /** Short but responsive. "Yeah, twice." "Accounts, mostly." */
  | 'answer'
  /** A real turn with something in it for her to pick up. */
  | 'disclosure'

export interface TurnKindContext {
  /**
   * This is the first thing he has said in the rep.
   *
   * Only the caller knows. It does not change the CLASS — a hello is a greeting
   * wherever it lands — but `deadEndFrom` reads it, because an opener answers
   * nothing and therefore cannot have failed to answer.
   */
  opening?: boolean
  /**
   * Her previous line ended in a question.
   *
   * The half of the answer that word count can never supply. "Yeah." is an
   * ANSWER when she just asked him something and an ACKNOWLEDGEMENT when she
   * did not, and the two deserve opposite treatment: one is him participating
   * and the other is him running out. Absent means "unknown", which falls back
   * to the stricter reading, so a caller that cannot supply it keeps the
   * behaviour it has always had.
   */
  herLastTurnAsked?: boolean
  /**
   * The turn came from a transcriber, not a keyboard.
   *
   * The one reason a turn can be unintelligible that is not the user's doing.
   * Absent means typed — the texting arm reads `classifyUserTurn` too, and a
   * message somebody typed in Danish is a message in Danish.
   */
  spoken?: boolean
}

/** He gave a real turn at this many words. Matches `DISCLOSURE_WORDS`. */
const DISCLOSURE_WORDS = 8

/** Below this, a turn is too short to have answered anything on its own. */
const SHORT_WORDS = 3

/**
 * Interrogative shape, tuned for RECALL rather than for the open/closed split.
 *
 * Deliberately NOT `isOpenQuestion` from `./fast.ts`. That function answers a
 * different question — is this the kind of question that invites a sentence —
 * and it returns false for "Do you like it?", which is unambiguously him asking
 * her something. Using it here would leave every closed question classified as
 * an acknowledgement and charged -6, which is the bug this file exists to fix
 * wearing a different hat.
 */
const INTERROGATIVE =
  /^\s*(?:(?:so|and|but|ok|okay|well|right|hey|oh|alright|anyway|then)[,\s]+){0,2}(?:what|how|why|where|when|who|which|whose|do|does|did|are|is|was|were|have|has|had|can|could|will|would|should|shall|am|any|really|seriously|and you|you too|tell me|talk me through)\b/i

/** Bare greetings. A hello is a hello at any point, but it offers nothing. */
const GREETING =
  /^\s*(?:hi|hey|hello|heya|hiya|yo|morning|afternoon|evening|good\s+(?:morning|afternoon|evening)|howdy|hey\s+there|hi\s+there|hello\s+there)\s*[.,!?]*\s*$/i

function words(text: string): number {
  return text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length ?? 0
}

/**
 * Whether the turn asks her something.
 *
 * A question mark settles it outright. Without one, an interrogative lead-in is
 * required — spoken questions frequently lose their punctuation in
 * transcription ("so what do you do" comes back flat), and the whole reason
 * short questions were being charged -6 is that nothing in the pipeline was
 * looking for them.
 */
export function asksSomething(text: string): boolean {
  const trimmed = flattenPunctuation(text).trim()
  if (!trimmed) return false
  if (trimmed.includes('?')) return true
  return INTERROGATIVE.test(trimmed)
}

/**
 * Classify one user turn.
 *
 * First match wins, in the order the union is declared. Nothing here allocates
 * beyond one regex test per branch, so it is safe on the hot path — it runs in
 * the same synchronous block as `scoreFast`.
 */
export function classifyUserTurn(
  text: string,
  context: TurnKindContext = {},
): UserTurnKind {
  const trimmed = flattenPunctuation(text).trim()
  const count = words(trimmed)
  if (count === 0) return 'silence'

  // BEFORE EVERYTHING THAT READS MEANING, because there is none to read. The
  // transcriber is pinned to English and still produced "Hej der" for "Hey
  // there" and "음." for a hum, and she answered the first with "Hej." — a
  // mishearing mirrored back as though he had spoken Danish. A person says
  // "sorry?".
  if (context.spoken && isMisheard(trimmed)) return 'unclear'

  // BEFORE the question branch, and that is the fix for "Why are you still
  // here?" scoring +2.25. Contempt with a question mark on the end is contempt.
  if (isDismissal(trimmed) || hasHostilityMarker(trimmed)) return 'dismissal'

  if (asksSomething(trimmed)) return 'question'
  if (GREETING.test(trimmed)) return 'greeting'

  // A SHORT TURN IS ONLY A FAILURE WHEN NOTHING WAS ASKED OF IT.
  //
  // She asked, he answered in two words: that is a person talking, and it used
  // to cost him six points. She said something and he said "Mm": that is the
  // withdrawal the product exists to teach him to notice, and it still does.
  if (count < SHORT_WORDS && !context.herLastTurnAsked) return 'acknowledgement'

  if (count >= DISCLOSURE_WORDS) return 'disclosure'
  return 'answer'
}

/**
 * Words a pinned-English transcriber produces when it mishears — common
 * function words and greetings of the languages it most often drifts into.
 *
 * Deliberately NOT a list of every foreign word. The failure is short turns
 * that came back as another language, and those are made of exactly these.
 * An English word that is also foreign ("die", "man", "in", "ja" as in "yeah")
 * is either absent or cannot tip a turn on its own — see `isMisheard`.
 */
const FOREIGN = new Set([
  // Danish, Norwegian, Swedish
  'hej', 'hei', 'hallå', 'der', 'det', 'och', 'og', 'jeg', 'jag', 'ikke', 'inte', 'tak', 'tack', 'nej', 'hvad', 'vad',
  // German, Dutch
  'hallo', 'ich', 'und', 'nicht', 'bitte', 'danke', 'ja', 'nein', 'ist', 'das', 'wie', 'geht', 'dank', 'wel', 'niet', 'een', 'het',
  // Spanish, Portuguese, Italian, French
  'hola', 'gracias', 'como', 'estas', 'está', 'qué', 'que', 'sí', 'olá', 'obrigado', 'ciao', 'grazie', 'bonjour', 'merci', 'oui', 'je', 'suis', 'c\'est', 'est', 'moi',
])

/**
 * Whether a spoken turn is probably a transcription of something else.
 *
 * Two shapes, both measured:
 *
 *  1. **Mostly not in the Latin alphabet** — "음.", "อืม". Nobody on the roster
 *     is speaking Korean or Thai; a transcriber pinned to English emitted those
 *     for a hum and a breath.
 *  2. **A short turn made of foreign function words** — "Hej der." Four words
 *     or fewer, at least half of them in `FOREIGN`. Short because a long turn
 *     that happens to contain "que" is a sentence in English with a Spanish
 *     word in it, and a false positive here costs him an unanswered line.
 */
export function isMisheard(text: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? []
  if (letters.length === 0) return false
  const latin = letters.filter((ch) => /\p{Script=Latin}/u.test(ch)).length
  if (latin / letters.length < 0.5) return true
  const tokens = text.toLowerCase().match(/[\p{L}']+/gu) ?? []
  if (tokens.length === 0 || tokens.length > 4) return false
  const foreign = tokens.filter((token) => FOREIGN.has(token)).length
  return foreign >= 1 && foreign * 2 >= tokens.length
}

/**
 * The dead-end boolean, from the class.
 *
 * One line, and it is the seam: every existing caller of `UserTurnShape.deadEnd`
 * — the mirror cap, the ask gate, the volunteer gate, the silence gate, the
 * steering invitation, the slow-score sampler — reads exactly the flag it
 * always read, and reads it about the right thing for the first time.
 *
 * **The opening exemption is preserved verbatim**, including its reason: "Hey
 * there." must not cost him six points and must not be answered with silence,
 * because nothing had been asked and so nothing had been left unanswered.
 */
export function deadEndFrom(kind: UserTurnKind, context: TurnKindContext = {}): boolean {
  if (context.opening) return false
  return kind === 'acknowledgement'
}
