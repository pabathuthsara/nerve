/**
 * RESPONSIVENESS — what he did with what she gave him (PERSONA-REALISM S3).
 *
 * Four counts, read off the transcript with no model, shown on the scorecard
 * as EVIDENCE and never as points:
 *
 *   follow-ups              his questions that came out of her last line
 *   long-range callbacks    coming back to something she said turns ago
 *   bids turned toward      her questions he actually answered
 *   reciprocal disclosures  something of his own, straight after hers
 *
 * They are the four things the conversation literature says build liking and
 * that a lexical pass can see. Huang et al. (2017): it is the FOLLOW-UP
 * question, not question-asking, that moves liking — McFarland et al. (2013)
 * found plain question-asking left women feeling LESS connected. Sprecher et
 * al. (2013): turn-taking disclosure beats one-way disclosure. Gottman's "bids"
 * are the frame for her questions: a question back is interest showing, and
 * the only thing that decides whether it lands is what he does with it.
 *
 * ── WHY THESE ARE NOT SCORED ─────────────────────────────────────────────
 *
 * The deterministic 60% is pinned by `lib/characterization/dating-arm.test.ts`,
 * and moving it is a signed-off act (rule 19), not a side effect of showing
 * more working. The judged half already has LISTENING and CURIOSITY; what it
 * lacked was anything a user could check. These are that: countable, quotable,
 * and the same on Tuesday as on Thursday.
 *
 * ── WHY THE SHARED WORD IS LOOSER THAN `referencesAgent`'s ───────────────
 *
 * The live meter matches content words exactly, which is right on the hot
 * path. Here it would make the canonical follow-up invisible: "I teach piano."
 * → "How long have you been teaching?" shares no exact word. `sameWord` allows
 * an inflection on the end of a root of four letters or more, and nothing
 * else. The long-range CALLBACK count uses `referencesAgent` unchanged, on the
 * raw turns the meter itself was handed, so the scorecard and the meter's
 * `callback` reason are answering the same question — the one difference is
 * that a line of contempt counts for nothing here, as it earns nothing there.
 *
 * Pure and synchronous. It runs in the browser on the scorecard read.
 */

import type { TranscriptTurn } from '@/lib/voice/types'
import {
  LONG_RANGE_TURNS,
  contentWords,
  isOpenQuestion,
  referencesAgent,
  wordsIn,
} from '@/lib/warmth/fast'
import { asksSomething, classifyUserTurn, isMisheard, type UserTurnKind } from '@/lib/warmth/turn-kind'

/* ------------------------------------------------------------------ *
 * Blocks: one speaker's consecutive turns, read as one turn
 * ------------------------------------------------------------------ */

/**
 * One speaker holding the floor.
 *
 * Both adapters split a reply the model delivered in two sentences into two
 * turns when there is a pause inside it, and the calibration set has several
 * ("Yeah, still sketching, badly." then "Not today. Just the notebook."). Read
 * as two turns, the second looks like her replying to herself, and every
 * "what did he do NEXT" question in this file would be asked of the wrong line.
 */
export interface Block extends TranscriptTurn {
  /** Position among blocks. */
  index: number
  /**
   * The 1-based ordinals of HIS raw turns merged into this block — the key
   * the warmth events are stored under (`WarmthEvent.turnIndex`). Empty for
   * hers.
   */
  userOrdinals: number[]
  /**
   * The raw turns this block was merged from, as the adapter emitted them.
   * The live meter never saw a block: `referencesAgent` counts back through
   * her RAW turns, and a callback distance measured in blocks would disagree
   * with the meter's `callback` reason on every rep where she was split.
   */
  turns: TranscriptTurn[]
}

export function blocksOf(transcript: readonly TranscriptTurn[]): Block[] {
  const blocks: Block[] = []
  let userOrdinal = 0
  for (const turn of transcript) {
    // Counted BEFORE the empty check. `WarmthSession.onUserTurn` counts every
    // finalised user turn and `fetchTranscript` keys the gutter the same way,
    // so an empty turn skipped here would shift every event after it onto the
    // wrong line of his.
    if (turn.speaker === 'user') userOrdinal += 1
    const text = turn.text.trim()
    if (!text) continue
    const last = blocks[blocks.length - 1]
    if (last && last.speaker === turn.speaker) {
      last.text = `${last.text} ${text}`
      last.t_end = Math.max(last.t_end, turn.t_end)
      if (turn.speaker === 'user') last.userOrdinals.push(userOrdinal)
      last.turns.push(turn)
      continue
    }
    blocks.push({
      speaker: turn.speaker,
      text,
      t_start: turn.t_start,
      t_end: turn.t_end,
      index: blocks.length,
      userOrdinals: turn.speaker === 'user' ? [userOrdinal] : [],
      turns: [turn],
    })
  }
  return blocks
}

/* ------------------------------------------------------------------ *
 * The lexical pieces
 * ------------------------------------------------------------------ */

/**
 * Two content words that are the same word, give or take an ending.
 *
 * "teach"/"teaching", "place"/"places", "write"/"writing". The shorter must be
 * a root of at least four letters and the difference at most three, which is
 * an inflection and not a different word. It will occasionally pair "part"
 * with "party"; that costs one count on an unscored line, and missing every
 * follow-up that changed tense cost the whole metric.
 */
export function sameWord(a: string, b: string): boolean {
  if (a === b) return true
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  if (long.length - short.length > 3) return false
  const root = short.length >= 5 && short.endsWith('e') ? short.slice(0, -1) : short
  return root.length >= 4 && long.startsWith(root)
}

/** The first content word of `his` that she also said, or null. */
export function sharedWord(his: string, hers: string): string | null {
  const theirs = [...contentWords(hers)]
  if (theirs.length === 0) return null
  for (const word of contentWords(his)) {
    if (theirs.some((other) => sameWord(word, other))) return word
  }
  return null
}

/**
 * Sentences, split on terminal punctuation.
 *
 * `match` rather than a lookbehind split, which a Safari older than 16.4 does
 * not parse, and this runs in the browser.
 */
export function sentencesOf(text: string): string[] {
  return (text.match(/[^.!?…]+[.!?…]*/g) ?? []).map((part) => part.trim()).filter(Boolean)
}

/**
 * Is this sentence a question?
 *
 * A question mark settles it. Without any terminal punctuation at all, the
 * interrogative lead-in `asksSomething` looks for is enough — that is the
 * transcription-dropped "so where are you from" case it was written for. A
 * sentence that ended in a full stop is a statement, whatever word it starts
 * with: "What a day." is not a question.
 */
function isQuestionSentence(sentence: string): boolean {
  const trimmed = sentence.trim()
  if (trimmed.endsWith('?')) return true
  if (/[.!…]$/.test(trimmed)) return false
  return asksSomething(trimmed)
}

/** The statements in a turn, without the questions. */
export function answerPart(text: string): string {
  return sentencesOf(text).filter((sentence) => !isQuestionSentence(sentence)).join(' ')
}

/** The questions in a turn, without the statements. */
export function questionPart(text: string): string {
  return sentencesOf(text).filter(isQuestionSentence).join(' ')
}

/** She asked him something. Her lines are generated and punctuated. */
export function herAsks(text: string): boolean {
  return text.includes('?')
}

const FIRST_PERSON = /\b(?:i|i['’]m|i['’]ve|i['’]d|i['’]ll|my|me|mine|myself)\b/i

/**
 * A first-person statement with something in it.
 *
 * Two content words, because "I don't know." has one ("don't") and is not a
 * disclosure, while "I work in insurance claims." has three and is.
 */
export function isDisclosure(text: string): boolean {
  const statement = answerPart(text)
  return FIRST_PERSON.test(statement) && contentWords(statement).size >= 2
}

/**
 * "You?", "And you?", "What about you?" — the question handed straight back.
 *
 * Not a topic change and not a follow-up. On its own it is a deflection; after
 * a real answer it is the ordinary, good, shape of an exchange.
 */
const BOUNCE =
  /^(?:(?:and|so|but|what|how)\s+)?(?:about\s+)?(?:you|yourself|u)(?:\s+(?:too|then))?\s*\?*$/i

function isBounce(question: string): boolean {
  const cleaned = question.replace(/[^a-z\s?']/gi, ' ').replace(/\s+/g, ' ').trim()
  return BOUNCE.test(cleaned)
}

function wordCount(text: string): number {
  return wordsIn(text).length
}

/**
 * A noise that is not an answer to an OPEN question.
 *
 * `classifyUserTurn` is told she asked, and so rightly reads "Yeah." as an
 * answer — to "Do you come here often?" it is one. To "What are you reading?"
 * it is not, and "Mm." never is. Only consulted when her question was open.
 */
const NOT_AN_ANSWER =
  /^(?:mm+|hmm+|m+hm+|uh[- ]?huh|uh|um|okay|ok|right|cool|nice|sure|ha+|oh|yeah|yep|yes|no|nah|maybe)[.!…]*$/i

/* ------------------------------------------------------------------ *
 * Her question, and what he did with it
 * ------------------------------------------------------------------ */

/**
 * What happened to one of her questions.
 *
 *   answered   a real answer: three words or more, or a first-person line, or
 *              any answer at all to a yes/no question ("Yeah, twice." is done)
 *   thin       an open question met with a word or two, and nothing else but
 *              perhaps the question handed back
 *   hopped     at most a word or two, then a question about something else
 *   dead-end   an acknowledgement with nothing in it, including "Yeah." or
 *              "Mm." to a question that asked for more than yes or no
 *   dismissed  contempt, or telling her to go
 *
 * "Turned toward" is `answered` or `thin`: he met it, however briefly. The S4
 * reading is where a thin answer to an open question is called what it is.
 */
export type BidVerdict = 'answered' | 'thin' | 'hopped' | 'dead-end' | 'dismissed'

export interface BidReading {
  /** When she asked, in seconds. */
  at: number
  her: string
  his: string
  verdict: BidVerdict
  /** Her question invited a sentence rather than a word. */
  open: boolean
  /** Words in the answer he gave before any question of his own. */
  answerWords: number
  /** He asked something back — handed hers back, or asked on her subject. */
  askedBack: boolean
}

export function isTurnedToward(verdict: BidVerdict): boolean {
  return verdict === 'answered' || verdict === 'thin'
}

export function readBid(her: TranscriptTurn, his: TranscriptTurn): BidReading {
  const kind: UserTurnKind = classifyUserTurn(his.text, { herLastTurnAsked: true })
  const open = sentencesOf(her.text).filter((sentence) => sentence.includes('?')).some(isOpenQuestion)
  const answer = answerPart(his.text)
  const answerWords = wordCount(answer)
  const asked = questionPart(his.text)
  const bounce = asked.length > 0 && sentencesOf(asked).every(isBounce)
  const onHerSubject = asked.length > 0 && sharedWord(asked, her.text) !== null
  const base = { at: her.t_start, her: her.text, his: his.text, open, answerWords }

  if (kind === 'dismissal') return { ...base, verdict: 'dismissed', askedBack: false }
  if (kind === 'silence' || kind === 'acknowledgement' || kind === 'greeting'
    || (open && NOT_AN_ANSWER.test(his.text.trim()))) {
    return { ...base, verdict: 'dead-end', askedBack: false }
  }

  const substantial = answerWords >= 3 || FIRST_PERSON.test(answer)
  const askedBack = bounce || onHerSubject

  // A question of his own on a new subject, with at most a word or two in
  // front of it. "Accounts, mostly. Where are you from?" is the example the
  // report opens §6 with, and it is the one this exists to name.
  if (asked.length > 0 && !bounce && !onHerSubject && !substantial) {
    return { ...base, verdict: 'hopped', askedBack: false }
  }
  if (substantial || !open) {
    // Anything at all to a yes/no question is an answer; a question on her own
    // subject with nothing in front of it is engaging with it rather than
    // leaving it.
    return { ...base, verdict: answerWords > 0 || onHerSubject ? 'answered' : 'thin', askedBack }
  }
  return { ...base, verdict: onHerSubject ? 'answered' : 'thin', askedBack }
}

/* ------------------------------------------------------------------ *
 * The four counts
 * ------------------------------------------------------------------ */

export interface Count {
  count: number
  /**
   * The denominator, stated. Only the turns that had a CHANCE: a question
   * asked before she had said anything with content in it cannot have been a
   * follow-up, and a question she asked as the rep ended cannot have been
   * answered.
   */
  of: number
}

export interface CallbackMoment {
  at: number
  word: string
  /** How many of her turns back it reached. */
  distance: number
}

export interface Responsiveness {
  followUps: Count
  callbacks: { count: number; moments: CallbackMoment[] }
  bidsTurnedToward: Count
  reciprocalDisclosures: Count
  /** Every question of hers and what happened to it, in order. S4 reads these. */
  bids: BidReading[]
}

export function responsivenessOf(transcript: readonly TranscriptTurn[]): Responsiveness {
  const blocks = blocksOf(transcript)
  const followUps: Count = { count: 0, of: 0 }
  const bidsTurnedToward: Count = { count: 0, of: 0 }
  const reciprocalDisclosures: Count = { count: 0, of: 0 }
  const moments: CallbackMoment[] = []
  const bids: BidReading[] = []

  const hers: Block[] = []
  // Her raw turns so far — what the live meter had heard when it scored him.
  const heard: TranscriptTurn[] = []
  let first = true
  for (const [position, block] of blocks.entries()) {
    if (block.speaker === 'agent') {
      hers.push(block)
      heard.push(...block.turns)
      const next = blocks[position + 1]
      if (next?.speaker !== 'user') continue

      // A reply the transcriber misheard ("Hej der", "음") is not evidence of
      // anything he did (PERSONA-REALISM-REPORT R8): not a bid missed, not a
      // disclosure unreturned. It is left out of both counts.
      if (isMisheard(next.text)) continue
      if (herAsks(block.text)) {
        const reading = readBid(block, next)
        bids.push(reading)
        bidsTurnedToward.of += 1
        if (isTurnedToward(reading.verdict)) bidsTurnedToward.count += 1
      }
      if (isDisclosure(block.text)) {
        reciprocalDisclosures.of += 1
        const kind = classifyUserTurn(next.text, { herLastTurnAsked: herAsks(block.text) })
        if (kind !== 'dismissal' && isDisclosure(next.text)) reciprocalDisclosures.count += 1
      }
      continue
    }

    const herLast = hers[hers.length - 1]
    const kind = classifyUserTurn(block.text, {
      opening: first,
      herLastTurnAsked: herLast ? herAsks(herLast.text) : false,
    })
    first = false
    // Contempt earns nothing here, for the reason `scoreFast` gives: "You're
    // making me miserable." repeated a word she had just said.
    if (kind === 'dismissal') continue

    if (kind === 'question' && herLast && contentWords(herLast.text).size > 0) {
      followUps.of += 1
      // The QUESTION has to come out of her line, not the answer in front of
      // it: "The coffee is fine. Where are you from?" answered her about the
      // coffee and then left it. The whole turn is the fallback only when the
      // classifier heard a question the punctuation did not mark.
      const asked = questionPart(block.text) || block.text
      if (sharedWord(asked, herLast.text) !== null) followUps.count += 1
    }

    // Asked of each raw line of his, against her raw lines, which is the exact
    // question the meter asked live. One moment per block at most: a callback
    // he made across a transcription split is still one callback.
    for (const turn of block.turns) {
      const callback = referencesAgent(turn.text, heard)
      if (callback && callback.distance >= LONG_RANGE_TURNS) {
        moments.push({ at: turn.t_start, word: callback.word, distance: callback.distance })
        break
      }
    }
  }

  return {
    followUps,
    callbacks: { count: moments.length, moments },
    bidsTurnedToward,
    reciprocalDisclosures,
    bids,
  }
}
