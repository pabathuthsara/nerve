/**
 * Fast turn scoring — synchronous, local, no model.
 *
 * Runs the instant a user turn finalises and must stay cheap enough that it
 * never appears in a latency measurement. Everything here is a lexical or
 * structural property of the transcript; nothing requires understanding what
 * was said. Judgement is the slow scorer's job (§07 splits the same way:
 * deterministic layer local, judgement layer model).
 */

import type { Personality, TranscriptTurn } from '@/lib/voice/types'
import { temperamentOf } from './temperament'

export interface FastScoreContext {
  /** Persona level. Gates the pause penalty. */
  level: number
  /**
   * LAYER 2, weighting what this particular character is moved by.
   *
   * Optional so fixtures and the calibration harness keep a neutral character,
   * but a live rep always passes it — see `temperamentOf`.
   */
  personality?: Personality
  /** Her recent turns, most recent last. Used to detect a genuine callback. */
  agentTurns: readonly TranscriptTurn[]
  /** How many dead-end replies immediately precede this one. */
  precedingDeadEnds: number
  /**
   * Seconds between her finishing and him starting. Null when unknown — the
   * opening turn, or a turn where she never spoke.
   */
  gapSeconds: number | null
}

export interface FastReason {
  code:
    | 'open-question'
    | 'engaged-length'
    | 'callback'
    | 'dead-end'
    | 'dead-end-streak'
    | 'filler-rate'
    | 'hesitation'
  points: number
  detail: string
}

export interface FastScore {
  /** Raw, before the level's gain/decay asymmetry is applied. */
  raw: number
  reasons: FastReason[]
  wordCount: number
  deadEnd: boolean
  fillerPerMinute: number
}

/**
 * Words that carry no topical content. Used so a "callback" means he picked up
 * something she actually said, not that both sentences contained "the".
 */
const STOPWORDS = new Set([
  'a', 'about', 'actually', 'all', 'am', 'an', 'and', 'any', 'are', 'as', 'at', 'be', 'been',
  'but', 'by', 'can', 'did', 'do', 'does', 'for', 'from', 'get', 'got', 'had', 'has', 'have',
  'he', 'her', 'here', 'him', 'his', 'how', 'i', 'if', 'in', 'is', 'it', 'its', 'just', 'know',
  'like', 'me', 'mm', 'my', 'no', 'not', 'of', 'oh', 'ok', 'okay', 'on', 'one', 'or', 'really',
  'right', 'she', 'should', 'so', 'some', 'that', 'the', 'their', 'them', 'then', 'there',
  'they', 'thing', 'things', 'this', 'to', 'too', 'up', 'very', 'was', 'we', 'well', 'were',
  'what', 'when', 'where', 'which', 'who', 'why', 'will', 'with', 'would', 'yeah', 'yes',
  'you', 'your',
])

/** Open interrogatives. These invite a sentence; the closed set invites a word. */
const OPEN_OPENERS = /\b(what|how|why|where|when|who|which|tell me|talk me through)\b/i

/** Leading closed forms. "Do you like it?" is a yes/no, however it ends. */
const CLOSED_OPENER = /^\s*(do|does|did|are|is|was|were|have|has|had|can|could|will|would|should|shall|am|any)\b/i

/**
 * Unambiguous fillers only.
 *
 * "like", "actually", "basically" and "literally" were in this list and cost
 * real signal: "crime feels like a stretch for me" and "I might actually give
 * it a go" are ordinary English, and both were charged -2 as nervous filler,
 * cancelling the engagement they should have earned. A word that is a filler
 * half the time is not usable as a filler signal — §07's filler_rate metric
 * would inherit the same false positives and the user would watch a number
 * that is measuring their vocabulary rather than their nerves.
 */
const FILLERS = /\b(um+|uh+|er+|ah+|erm+|you know|i mean|sort of|kind of|kinda|sorta)\b/gi

/**
 * One "um" in a four-second turn is 15/min and would trip any rate threshold
 * instantly. Our user is nervous by definition; charging them for a single
 * hesitation is the same mistake as the pause penalty at level 1.
 */
const MIN_FILLERS_TO_COUNT = 2

export function wordsIn(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

export function contentWords(text: string): Set<string> {
  return new Set(
    wordsIn(text).filter((word) => word.length >= 4 && !STOPWORDS.has(word)),
  )
}

/**
 * An open question invites elaboration. A closed one does not, which is why
 * §07 tracks open_closed_ratio separately — "yes/no questions are where
 * conversations go to die".
 */
export function isOpenQuestion(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  const asksSomething = trimmed.includes('?') || OPEN_OPENERS.test(trimmed)
  if (!asksSomething) return false
  // A closed lead-in wins even when an open word appears later: "Do you know
  // what time it is?" is still a yes/no.
  if (CLOSED_OPENER.test(trimmed)) return false
  return OPEN_OPENERS.test(trimmed)
}

/**
 * How far back a callback has to reach before it stops being an echo of the
 * last thing said and starts being evidence of having listened.
 */
export const LONG_RANGE_TURNS = 4

export interface Callback {
  word: string
  /** How many of her turns ago it was said. 1 is her previous line. */
  distance: number
}

/**
 * Did he pick up something she actually said, rather than just talking?
 *
 * Searches her WHOLE side of the conversation, not the last three turns.
 * Picking up a word from her previous sentence is ordinary conversational
 * cohesion and a model does it by accident; returning to something she
 * mentioned two minutes ago is the thing that makes a person feel listened to,
 * and it used to score exactly nothing because it fell outside the window.
 *
 * Prefers the most recent match so the reported word is the one he was most
 * plausibly picking up, then reports how far back it reached and lets the
 * caller price it.
 */
export function referencesAgent(
  text: string,
  agentTurns: readonly TranscriptTurn[],
): Callback | null {
  if (agentTurns.length === 0) return null
  const mine = contentWords(text)
  if (mine.size === 0) return null

  for (let back = 1; back <= agentTurns.length; back += 1) {
    const turn = agentTurns[agentTurns.length - back]
    if (!turn) continue
    for (const word of contentWords(turn.text)) {
      if (mine.has(word)) return { word, distance: back }
    }
  }
  return null
}

export function fillerCount(text: string): number {
  const matches = text.match(FILLERS)
  return matches ? matches.length : 0
}

export function fillerRatePerMinute(text: string, turn: TranscriptTurn): number {
  const count = fillerCount(text)
  if (count < MIN_FILLERS_TO_COUNT) return 0
  const seconds = Math.max(0.5, turn.t_end - turn.t_start)
  return (count / seconds) * 60
}

export function scoreFast(turn: TranscriptTurn, context: FastScoreContext): FastScore {
  const text = turn.text
  const words = wordsIn(text)
  const wordCount = words.length
  const reasons: FastReason[] = []

  if (isOpenQuestion(text)) {
    reasons.push({ code: 'open-question', points: 3, detail: 'asked an open question' })
  }

  // Engaged but not rambling. Both ends of this band are failure modes (§07).
  if (wordCount >= 8 && wordCount <= 25) {
    reasons.push({ code: 'engaged-length', points: 2, detail: `${wordCount} words` })
  }

  const callback = referencesAgent(text, context.agentTurns)
  if (callback) {
    // A long-range callback is worth more than an immediate one, and the
    // difference is the whole point. Echoing her last sentence is cohesion;
    // coming back to something she said four turns ago is proof of attention,
    // and it is the single most reliable way a stranger decides you were
    // actually listening rather than waiting to speak.
    const longRange = callback.distance >= LONG_RANGE_TURNS
    reasons.push({
      code: 'callback',
      points: longRange ? 3 : 2,
      detail: longRange
        ? `came back to "${callback.word}" from ${callback.distance} turns ago`
        : `picked up "${callback.word}"`,
    })
  }

  const deadEnd = wordCount > 0 && wordCount < 3
  if (deadEnd) {
    reasons.push({ code: 'dead-end', points: -3, detail: `${wordCount}-word reply` })
    // The streak penalty is on top of the individual one: the third dead end
    // costs 7, which is what makes a conversation actually die.
    if (context.precedingDeadEnds + 1 >= 3) {
      reasons.push({
        code: 'dead-end-streak',
        points: -4,
        detail: `${context.precedingDeadEnds + 1} dead ends in a row`,
      })
    }
  }

  const fillerPerMinute = fillerRatePerMinute(text, turn)
  if (fillerPerMinute > 5) {
    reasons.push({
      code: 'filler-rate',
      points: -2,
      detail: `${fillerPerMinute.toFixed(1)} fillers/min`,
    })
  }

  // Hesitation penalty. Deliberately dead below level 4: our user is by
  // definition nervous and hesitant (§05), and charging a beginner for the
  // pause before they work up to speaking would punish the exact thing the
  // product exists to fix.
  if (context.level >= 4 && context.gapSeconds !== null && context.gapSeconds > 3) {
    reasons.push({
      code: 'hesitation',
      points: -2,
      detail: `${context.gapSeconds.toFixed(1)}s before answering`,
    })
  }

  // LAYER 2, applied last and to the whole set.
  //
  // Until this existed, every character on the ladder was moved by identical
  // arithmetic and `personality` was pure prose. Two things change here, both
  // read off dials that were already authored:
  //
  //   patience     what a misstep costs. Our user is nervous by definition and
  //                short replies are the symptom the product exists to treat,
  //                so a flat penalty made every character coldest exactly when
  //                the user was struggling most. Nadia gives grace. Alex does
  //                not. That difference IS patience.
  //   distraction  what an unspecific good turn earns. A distracted character
  //                has to actually be reached — so a turn with no callback in
  //                it is worth less from Erin than from Nadia, which is the
  //                skill her rung claims to train.
  const t = temperamentOf(context.personality)
  const specific = callback !== null
  const weighted = reasons.map((reason) => {
    if (reason.points < 0) return { ...reason, points: reason.points * t.penalty }
    if (specific) return reason
    return { ...reason, points: reason.points * t.genericGain }
  })

  return {
    // Rounded to one place so the log stays readable and two multipliers cannot
    // produce a raw score with a tail of noise on it.
    raw: Math.round(weighted.reduce((sum, reason) => sum + reason.points, 0) * 10) / 10,
    reasons: weighted.map((reason) => ({
      ...reason,
      points: Math.round(reason.points * 10) / 10,
    })),
    wordCount,
    deadEnd,
    fillerPerMinute,
  }
}
