/**
 * What builds liking, as opposed to what merely keeps a conversation going.
 *
 * ── THE DEFECT THIS EXISTS FOR (PERSONA-REALISM-REPORT §5.3, W3) ─────────
 *
 * `fast.ts` pays for three structural things — an open question, a turn of a
 * decent length, a callback — and charges for a dead end. Those are the shape
 * of a conversation. They are not what the research says makes a stranger like
 * you, and the difference matters because the meter IS the lesson: whatever it
 * pays for is what a user learns to do.
 *
 *   · Huang et al. (2017): FOLLOW-UP questions specifically drive liking and
 *     second dates. McFarland, Jurafsky & Rawlings (2013) are the counterweight
 *     — in real speed dates plain question-asking left women feeling LESS
 *     connected. So the follow-up is what is worth more, not the question.
 *   · McFarland et al. (2013): appreciative and sympathetic language ("that
 *     must be…", "no way", "good for you") predicted women "clicking".
 *   · Sprecher et al. (2013): disclosure that takes turns beats one-way
 *     disclosure. Something of his own, straight after she offered something
 *     of hers, is the move.
 *   · An interview — a run of questions with nothing of his own in between —
 *     is what Maya's own contract names as the thing that loses her. Only the
 *     slow judge could see it, and only when it happened to be sampled.
 *   · A topic hop — a fresh question that ignores what she just said — is the
 *     visible form of not listening.
 *
 * ── WHY A NEW FILE ──────────────────────────────────────────────────────
 *
 * `fast.ts` is Tier 0 and the report is explicit: "a pure function with tests,
 * in a new file beside fast.ts, not a parameter added to it" — the shape
 * `turn-kind.ts` and `leaving.ts` set. `scoreFast` is byte-for-byte the scorer
 * it was; `WarmthSession` folds these reasons into its result with
 * `withRapport`, under the same temperament and the same hostility guard, so
 * one turn still produces one `FastScore`.
 *
 * ── THE RATIO THAT MUST SURVIVE ─────────────────────────────────────────
 *
 * `README.md`: "a dead end has to cost more than a good question earns", or she
 * never visibly withdraws and signal-reading is unlearnable. The largest thing
 * here is +2 on top of what `scoreFast` already pays, so a follow-up open
 * question lands at +4 of question credit against a dead end's -6 and a
 * streak's -14. `rapport.test.ts` asserts the ratio rather than trusting it.
 *
 * Pure and synchronous. Lexical, like everything on this path: it does not
 * understand what was said and does not pretend to. It never sees a model and
 * never costs a millisecond of the gap between him finishing and her starting.
 */

import type { Personality, TranscriptTurn } from '@/lib/voice/types'
import { contentWords, type FastReason, type FastScore } from './fast'
import { temperamentOf } from './temperament'
import { asksSomething, type UserTurnKind } from './turn-kind'
import { flattenPunctuation } from './text'

export interface RapportContext {
  /** Her line immediately before his. Null on his opener, or if she never spoke. */
  herLast: TranscriptTurn | null
  /**
   * How many of his turns IMMEDIATELY before this one were questions with
   * nothing of his own in them. The session counts; this only reads it.
   */
  priorQuestionRun: number
  /** What `scoreFast` decided this turn was. */
  kind: UserTurnKind
  /**
   * Her author says an interview loses her (`personaNotes(persona).dislikes`).
   *
   * The interview penalty is HERS, not everybody's: a character who says
   * nothing about it is a character who does not mind, and charging every rung
   * for a run of questions would be a warmth opinion nobody authored.
   */
  penalisesInterview: boolean
  /** Whether scoreFast already paid `open-question` on this turn. */
  paidOpenQuestion: boolean
  /** This is his first turn. Nothing is a follow-up or a hop yet. */
  opening: boolean
}

/** Points, in the units `scoreFast` uses. */
export const RAPPORT_POINTS = {
  /** On top of `open-question` (+3), so a follow-up is worth +4 of question credit. */
  followUpUpgrade: 1,
  /** A follow-up that `open-question` did not pay — "Why blue?" is closed-shaped. */
  followUpAlone: 4,
  appreciation: 1.5,
  reciprocalDisclosure: 2,
  interviewMode: -2,
  topicHop: -1,
} as const

/** A run of this many questions with nothing of his own is an interview. */
export const INTERVIEW_RUN = 3

/**
 * Appreciation and sympathy, the McFarland set.
 *
 * Tuned for PRECISION, because this pays. "no way" and "that sucks" are here;
 * "nice" and "cool" are not — they are what a person says when they are not
 * listening, and paying for them would teach the user to say them on autopilot.
 */
const APPRECIATION = new RegExp([
  /\bthat (?:must|would|sounds like it would) (?:be|have been)\b/,
  /\b(?:no way|good for you|well done|fair play|love that|i love that)\b/,
  /\bthat'?s (?:awesome|amazing|brilliant|lovely|great|so cool|really cool|rough|hard|tough|horrible|awful|a shame|sad)\b/,
  /\bthat (?:sucks|stinks|is rough|is hard|is tough)\b/,
  /\b(?:sorry to hear|i'?m sorry that|oh no)\b/,
  /\bsounds (?:hard|rough|tough|lovely|amazing|fun|great)\b/,
].map((pattern) => pattern.source).join('|'), 'i')

/** "I", "my", "me", and the contractions. His own life, in his own words. */
const FIRST_PERSON = /\b(?:i|i'm|im|i've|ive|i'd|id|i'll|my|me|mine|myself)\b/i

/**
 * Acknowledgements of what she said. A new question that opens with one of
 * these is a person changing the subject politely, not ignoring her.
 */
const ACKNOWLEDGEMENT = /^\s*(?:oh|ah|ha|haha|huh|nice|cool|right|yeah|yes|really|wow|same|fair|true|okay|ok|mm|hm|interesting|no way)\b/i

/** Words of hers, at least this many, before a fresh question can ignore them. */
const HOP_MIN_WORDS = 3

/**
 * She offered something of her own.
 *
 * A first-person statement of three words or more that is not itself a
 * question. "Twice, actually." is not; "I read it twice." is.
 */
export function herDisclosed(turn: TranscriptTurn | null): boolean {
  if (!turn) return false
  const text = flattenPunctuation(turn.text).trim()
  if (!text || text.endsWith('?')) return false
  const words = text.match(/[\p{L}\p{N}']+/gu) ?? []
  return words.length >= 3 && FIRST_PERSON.test(text)
}

/** A first-person content statement from him, not a question. */
function hisDisclosure(text: string): boolean {
  const flat = flattenPunctuation(text).trim()
  if (!flat || asksSomething(flat)) return false
  const words = flat.match(/[\p{L}\p{N}']+/gu) ?? []
  return words.length >= 5 && FIRST_PERSON.test(flat)
}

/** A question with nothing of his own in it. Counted by the session. */
export function isBareQuestion(text: string): boolean {
  const flat = flattenPunctuation(text).trim()
  return asksSomething(flat) && !FIRST_PERSON.test(flat)
}

/**
 * The rapport reasons for one of his turns. Unweighted; see `withRapport`.
 *
 * Never on an opener, never on an unclear turn, never on a dismissal — a
 * hostile turn is not paid for anything (`fast.ts`'s guard, restated here
 * because this is a second source of reasons and the guard is about the set).
 */
export function rapportReasons(text: string, context: RapportContext): FastReason[] {
  if (context.opening) return []
  if (context.kind === 'unclear' || context.kind === 'dismissal' || context.kind === 'silence') return []

  const reasons: FastReason[] = []
  const herLast = context.herLast
  const asked = asksSomething(text)
  const mine = contentWords(text)
  const hers = herLast ? contentWords(herLast.text) : new Set<string>()
  const overlap = [...mine].find((word) => hers.has(word))
  const disclosedToHim = herDisclosed(herLast)

  if (asked && overlap) {
    reasons.push({
      code: 'follow-up',
      points: context.paidOpenQuestion ? RAPPORT_POINTS.followUpUpgrade : RAPPORT_POINTS.followUpAlone,
      detail: `followed up on "${overlap}"`,
    })
  }

  if (disclosedToHim && APPRECIATION.test(flattenPunctuation(text))) {
    reasons.push({ code: 'appreciation', points: RAPPORT_POINTS.appreciation, detail: 'met what she shared' })
  }

  if (disclosedToHim && hisDisclosure(text)) {
    reasons.push({
      code: 'reciprocal-disclosure',
      points: RAPPORT_POINTS.reciprocalDisclosure,
      detail: 'offered something of his own back',
    })
  }

  if (
    context.penalisesInterview
    && isBareQuestion(text)
    && context.priorQuestionRun + 1 >= INTERVIEW_RUN
  ) {
    reasons.push({
      code: 'interview-mode',
      points: RAPPORT_POINTS.interviewMode,
      detail: `${context.priorQuestionRun + 1} questions running with nothing of his own`,
    })
  }

  // A HOP IS A QUESTION THAT IGNORES HER ANSWER. Only when she actually said
  // something to ignore, only when nothing of hers was picked up, and never
  // when he opened by acknowledging her first — "Oh nice. What about you?" is a
  // person taking a turn, not a person not listening.
  const herWords = herLast ? (herLast.text.match(/[\p{L}\p{N}']+/gu) ?? []).length : 0
  if (
    asked
    && !overlap
    && herLast
    && herWords >= HOP_MIN_WORDS
    && !herLast.text.trim().endsWith('?')
    && !ACKNOWLEDGEMENT.test(flattenPunctuation(text))
  ) {
    reasons.push({ code: 'topic-hop', points: RAPPORT_POINTS.topicHop, detail: 'changed the subject without picking up her answer' })
  }

  return reasons
}

/**
 * The fast score with the rapport reasons folded in.
 *
 * The SAME temperament `scoreFast` applies to its own reasons, so a patient
 * character forgives an interview the way she forgives a dead end and a
 * distracted one discounts appreciation the way she discounts any turn that
 * never picked up anything of hers. One turn still produces one score, and the
 * engine cannot tell which file a reason came from.
 */
export function withRapport(
  score: FastScore,
  rapport: readonly FastReason[],
  personality: Personality | undefined,
): FastScore {
  if (rapport.length === 0) return score
  const t = temperamentOf(personality)
  // A follow-up is by definition specific — it picked up something of hers.
  const specific = score.reasons.some((reason) => reason.code === 'callback')
    || rapport.some((reason) => reason.code === 'follow-up')
  const weighted = rapport.map((reason) => {
    if (reason.points < 0) return { ...reason, points: reason.points * t.penalty }
    if (specific) return reason
    return { ...reason, points: reason.points * t.genericGain }
  }).map((reason) => ({ ...reason, points: Math.round(reason.points * 10) / 10 }))
  const reasons = [...score.reasons, ...weighted]
  return {
    ...score,
    reasons,
    raw: Math.round(reasons.reduce((sum, reason) => sum + reason.points, 0) * 10) / 10,
  }
}
