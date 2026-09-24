/**
 * SIGNAL READING, AS FACTS (PERSONA-REALISM S4).
 *
 * `signalReading` is the most judgement-shaped of the six sub-scores — "did he
 * read how interested she was, and adjust?" — and the scorecard showed it as a
 * bare number from a model. The warmth trace and the transcript between them
 * already hold the answer to that question at every point it was asked, so
 * this reads them and says what happened, with a timestamp:
 *
 *   At 1:12 she asked you something back. You answered in two words and
 *   changed the subject.
 *
 * ── THE TWO KINDS OF MOMENT ──────────────────────────────────────────────
 *
 *   COOLING   her interest fell by three or more on one of his lines, or she
 *             answered twice running in two words or fewer. The question is
 *             what his NEXT line did: changed tack, gave her room, or pressed
 *             on the same line.
 *   WARMING   she asked him something, told him something about herself, or
 *             laughed. The question is whether he picked it up.
 *
 * ── WHAT THIS FILE WILL NOT SAY ──────────────────────────────────────────
 *
 * **It never hands him a line** (rule 8, and `assertNoScript`'s reasoning in
 * `lib/data/mission.ts`). Every sentence is a template authored below and
 * states what happened — never what to say, never what he should have done.
 * `assertFactSentence` refuses a quotation mark, the first person, and the
 * vocabulary of advice, and it REFUSES rather than trims: a fact that fails is
 * dropped, because a sanitised script is still a script. What was actually
 * said travels beside the sentence as evidence (`her`, `his`) and the screen
 * labels it as the transcript, not as copy.
 *
 * **It never claims more than it measured.** A reply this file cannot place —
 * an "Okay." after she went quiet, which is either giving her room or giving
 * up — produces no fact at all. Three true lines beat five arguable ones.
 *
 * Pure. No model, no network; it runs on the scorecard read, in the browser,
 * over rows that already exist. Nothing here is scored.
 */

import type { TranscriptTurn } from '@/lib/voice/types'
import { contentWords, wordsIn } from '@/lib/warmth/fast'
import { classifyUserTurn, isMisheard } from '@/lib/warmth/turn-kind'
import {
  blocksOf,
  herAsks,
  isDisclosure,
  questionPart,
  readBid,
  sharedWord,
  type Block,
  type BidReading,
} from './responsiveness'

/** A stored warmth event, as far as this file needs one. */
export interface SignalEvent {
  /** 1-based ordinal of his turn — `WarmthEvent.turnIndex`. */
  turnIndex: number
  /** Applied change on the engine scale. */
  delta: number
}

/**
 * A fall this size on one of his lines is a cooling event.
 *
 * Twice `REPAIR_TRIGGER` (-1.5), which is where the engine itself decides a
 * turn was a misstep worth a repair window. Three is a turn the meter
 * visibly noticed, not a turn that cost a point of natural decay.
 */
export const COOLING_DROP = 3

/** Her reply is minimal at this many words or fewer. */
export const MINIMAL_WORDS = 2

/** How many moments the scorecard shows. More than three is a report. */
export const MAX_FACTS = 3

export type SignalTrigger = 'drop' | 'short-replies' | 'question' | 'disclosure' | 'laugh'

export type SignalResponse =
  // after cooling
  | 'changed-tack'
  | 'gave-space'
  | 'pressed'
  | 'hostile'
  // after warming
  | 'answered'
  | 'answered-asked-back'
  | 'thin'
  | 'thin-bounced'
  | 'hopped'
  | 'skipped'
  | 'dead-end'
  | 'dismissed'
  | 'followed-up'
  | 'reciprocated'
  | 'stayed-on-it'
  | 'moved-on'
  | 'kept-it-going'
  | 'let-it-drop'

export interface SignalFact {
  /** Seconds into the rep. */
  at: number
  /** `at`, as the screen prints it: m:ss. */
  clock: string
  kind: 'cooling' | 'warming'
  trigger: SignalTrigger
  response: SignalResponse
  /** Whether he read it. The screen marks a miss; it never scores one. */
  read: boolean
  /** Authored, and past `assertFactSentence`. */
  sentence: string
  /** Her line, verbatim. Evidence, not copy. */
  her: string
  /** His next line, verbatim. */
  his: string
}

/* ------------------------------------------------------------------ *
 * The sentences
 * ------------------------------------------------------------------ */

/**
 * Refuse a sentence that hands him a line or tells him what to do.
 *
 * The same three tests as `assertNoScript`, for the same reasons — a quotation
 * reads as "say this", the first person is a script wearing a hint's clothes —
 * plus the vocabulary of advice, because a fact that turns into "next time,
 * try…" has stopped being a fact. No contractions anywhere below for the same
 * reason `assertNoScript` gives: an apostrophe is indistinguishable from a
 * quotation mark to a test that must never let one through.
 */
export function assertFactSentence(sentence: string): void {
  if (/["“”‘’'`]/.test(sentence)) {
    throw new Error(`signal fact quotes something: ${sentence}`)
  }
  if (/\b(I|I'm|my|me|mine|myself)\b/.test(sentence)) {
    throw new Error(`signal fact is in the first person: ${sentence}`)
  }
  if (/\b(try|should|next time|instead|could have|would have|say|ask her|tell her|remember to)\b/i.test(sentence)) {
    throw new Error(`signal fact gives advice rather than stating what happened: ${sentence}`)
  }
}

function spell(count: number): string {
  return count <= 1 ? 'one word' : count === 2 ? 'two words' : `${count} words`
}

export function clockOf(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

type Sentence = (input: { clock: string; answerWords: number }) => string

/**
 * Every sentence this file can produce, keyed by what triggered it and what he
 * did. Hand-written, one line each, never generated. The test walks the whole
 * table through `assertFactSentence`.
 */
export const SENTENCES: Record<SignalTrigger, Partial<Record<SignalResponse, Sentence>>> = {
  drop: {
    'changed-tack': ({ clock }) => `At ${clock} her interest dropped on one of your lines. Your next line changed tack.`,
    'gave-space': ({ clock }) => `At ${clock} her interest dropped on one of your lines. You eased off and gave her room.`,
    pressed: ({ clock }) => `At ${clock} her interest dropped on one of your lines, and your next one pressed on with the same subject.`,
    hostile: ({ clock }) => `At ${clock} her interest dropped, and your next line turned on her.`,
  },
  'short-replies': {
    'changed-tack': ({ clock }) => `At ${clock} her answers had shrunk to a word or two. You changed tack.`,
    'gave-space': ({ clock }) => `At ${clock} her answers had shrunk to a word or two. You eased off and gave her room.`,
    pressed: ({ clock }) => `At ${clock} her answers had shrunk to a word or two, and you kept going on the same line.`,
    hostile: ({ clock }) => `At ${clock} her answers had shrunk to a word or two, and your next line turned on her.`,
  },
  question: {
    answered: ({ clock }) => `At ${clock} she asked you something back, and you gave her a real answer.`,
    'answered-asked-back': ({ clock }) => `At ${clock} she asked you something back. You gave her a real answer and kept the exchange going both ways.`,
    thin: ({ clock, answerWords }) => `At ${clock} she asked you something back. You answered in ${spell(answerWords)} and left it there.`,
    'thin-bounced': ({ clock, answerWords }) => `At ${clock} she asked you something back. You answered in ${spell(answerWords)} and handed the question straight back.`,
    hopped: ({ clock, answerWords }) => `At ${clock} she asked you something back. You answered in ${spell(answerWords)} and changed the subject.`,
    skipped: ({ clock }) => `At ${clock} she asked you something back. It went unanswered and the subject changed.`,
    'dead-end': ({ clock }) => `At ${clock} she asked you something back, and the reply gave her nothing to work with.`,
    dismissed: ({ clock }) => `At ${clock} she asked you something back, and your reply pushed her away.`,
  },
  disclosure: {
    'followed-up': ({ clock }) => `At ${clock} she told you something about herself, and your next question came straight out of it.`,
    reciprocated: ({ clock }) => `At ${clock} she told you something about herself, and you offered something of your own back.`,
    'stayed-on-it': ({ clock }) => `At ${clock} she told you something about herself, and you stayed with it.`,
    'moved-on': ({ clock }) => `At ${clock} she told you something about herself. Your next line went somewhere else entirely.`,
    'dead-end': ({ clock }) => `At ${clock} she told you something about herself, and the reply gave her nothing to work with.`,
    dismissed: ({ clock }) => `At ${clock} she told you something about herself, and your reply pushed her away.`,
  },
  laugh: {
    'kept-it-going': ({ clock }) => `At ${clock} she laughed, and you kept it going.`,
    'let-it-drop': ({ clock }) => `At ${clock} she laughed, and your next line let the moment drop.`,
  },
}

/* ------------------------------------------------------------------ *
 * Reading his next line
 * ------------------------------------------------------------------ */

/**
 * He stepped back rather than pushing.
 *
 * Phrases, not length alone: "Fair enough." and "I'll let you get back to it."
 * are room; "Okay." is not placeable and is left alone (see the file header).
 */
const GIVES_SPACE =
  /\b(fair enough|no worries|all good|no problem|let you get back|leave you to it|let you go|i'?ll let you|enjoy (?:your|the)|take care|nice (?:to meet|meeting|talking)|good (?:to meet|talking)|sorry to (?:bother|interrupt)|didn'?t mean to|my bad|fair play)\b/i

const LAUGH = /\[(?:laughs?|laughing|chuckles?|giggles?)\]|\b(?:ha){2,}\b|\bhaha\b|\blol\b/i

/**
 * What his line did after she cooled.
 *
 * Pressed: another question on the thing that cooled her or on her short
 * answer to it — including "Why?" and "How come?", which have no content word
 * of their own and are follow-ups by construction — or a statement that kept
 * arguing his line. Changed tack: a question or a statement of his own on
 * something new. Null when the line is an acknowledgement: that is either room
 * or retreat, and this file does not guess which.
 */
function afterCooling(previous: Block, hers: Block, reply: Block): SignalResponse | null {
  // A misheard line (R8) is the transcriber's, not his. Nothing is said about it.
  if (isMisheard(reply.text)) return null
  const kind = classifyUserTurn(reply.text, { herLastTurnAsked: herAsks(hers.text) })
  if (kind === 'dismissal') return 'hostile'
  if (kind === 'silence' || kind === 'acknowledgement' || kind === 'greeting') return null
  if (GIVES_SPACE.test(reply.text) && questionPart(reply.text).length === 0) return 'gave-space'

  const asking = kind === 'question'
  const onHisLine = sharedWord(reply.text, previous.text) !== null
  if (asking) {
    const question = questionPart(reply.text) || reply.text
    const followsHer = sharedWord(question, hers.text) !== null
    const bare = contentWords(question).size === 0
    return onHisLine || followsHer || bare ? 'pressed' : 'changed-tack'
  }
  return onHisLine ? 'pressed' : 'changed-tack'
}

function afterQuestion(reading: BidReading): SignalResponse {
  switch (reading.verdict) {
    case 'answered': return reading.askedBack ? 'answered-asked-back' : 'answered'
    case 'thin': return reading.askedBack ? 'thin-bounced' : 'thin'
    case 'hopped': return reading.answerWords === 0 ? 'skipped' : 'hopped'
    case 'dead-end': return 'dead-end'
    case 'dismissed': return 'dismissed'
  }
}

function afterDisclosure(hers: Block, reply: Block): SignalResponse | null {
  if (isMisheard(reply.text)) return null
  const kind = classifyUserTurn(reply.text, { herLastTurnAsked: false })
  if (kind === 'dismissal') return 'dismissed'
  if (kind === 'silence' || kind === 'acknowledgement' || kind === 'greeting') return 'dead-end'
  const shared = sharedWord(reply.text, hers.text) !== null
  if (kind === 'question' && shared) return 'followed-up'
  if (isDisclosure(reply.text)) return 'reciprocated'
  if (shared) return 'stayed-on-it'
  if (kind === 'question') return 'moved-on'
  // A statement with nothing of hers in it and nothing of his own either. Not
  // placeable, so not said.
  return null
}

const READS: ReadonlySet<SignalResponse> = new Set([
  'changed-tack', 'gave-space', 'answered', 'answered-asked-back',
  'followed-up', 'reciprocated', 'stayed-on-it', 'kept-it-going',
])

/**
 * How much there is to learn from a moment. Higher first.
 *
 * A missed bid is the top of the list because it is the report's own example
 * and the most common thing a nervous player cannot see from inside the rep:
 * her interest, visible, and gone past. Pressing on after she has cooled is
 * next. A good read after cooling outranks a good read after warming, because
 * adjusting is the harder half of the skill.
 */
const TEACHABILITY: Record<SignalResponse, number> = {
  hopped: 6,
  skipped: 6,
  'dead-end': 5,
  dismissed: 5,
  hostile: 5,
  'moved-on': 5,
  pressed: 5,
  'thin-bounced': 4,
  thin: 4,
  'let-it-drop': 4,
  'changed-tack': 3,
  'gave-space': 3,
  'answered-asked-back': 2,
  'followed-up': 2,
  reciprocated: 2,
  answered: 1,
  'stayed-on-it': 1,
  'kept-it-going': 1,
}

/* ------------------------------------------------------------------ *
 * The reading
 * ------------------------------------------------------------------ */

interface Candidate extends SignalFact {
  /** Tie-break: how far his reply moved the meter, when the trace has it. */
  weight: number
}

/**
 * The most teachable moments of the rep, in the order they happened.
 *
 * `events` is optional: a rep with no stored trace — the texting arm, an old
 * row, a rep whose save failed — still gets every moment the transcript alone
 * can show, and simply has no warmth drops among them.
 */
export function signalFacts(input: {
  transcript: readonly TranscriptTurn[]
  events?: readonly SignalEvent[]
  limit?: number
}): SignalFact[] {
  const blocks = blocksOf(input.transcript)
  const limit = input.limit ?? MAX_FACTS

  // The trace, folded to one number per turn of his: the fast score and the
  // slow judgement on the same turn are one move from where she sat.
  const byOrdinal = new Map<number, number>()
  for (const event of input.events ?? []) {
    if (!Number.isFinite(event.turnIndex) || !Number.isFinite(event.delta)) continue
    byOrdinal.set(event.turnIndex, (byOrdinal.get(event.turnIndex) ?? 0) + event.delta)
  }
  const moved = (block: Block): number =>
    block.userOrdinals.reduce((sum, ordinal) => sum + (byOrdinal.get(ordinal) ?? 0), 0)

  const candidates: Candidate[] = []
  // One reading per reply of his. A line that answered her question AND came
  // after a drop is one moment, read by whichever trigger reached it first.
  const answeredReply = new Set<number>()
  const push = (fact: Omit<SignalFact, 'clock' | 'sentence' | 'read'>, reply: Block, answerWords = 0) => {
    const sentence = SENTENCES[fact.trigger][fact.response]?.({ clock: clockOf(fact.at), answerWords })
    if (!sentence) return
    try {
      assertFactSentence(sentence)
    } catch {
      // Refused, not repaired. See the header.
      return
    }
    if (answeredReply.has(reply.index)) return
    answeredReply.add(reply.index)
    candidates.push({
      ...fact,
      clock: clockOf(fact.at),
      sentence,
      read: READS.has(fact.response),
      weight: Math.abs(moved(reply)),
    })
  }

  const nextOf = (position: number, speaker: 'user' | 'agent'): Block | null => {
    const next = blocks[position + 1]
    return next && next.speaker === speaker ? next : null
  }

  let minimalRun = 0
  for (const [position, block] of blocks.entries()) {
    if (block.speaker === 'user') {
      // COOLING, from the trace: this line of his cost three or more.
      if (moved(block) > -COOLING_DROP) continue
      const hers = nextOf(position, 'agent')
      const reply = hers ? nextOf(position + 1, 'user') : null
      if (!hers || !reply) continue
      const response = afterCooling(block, hers, reply)
      if (response) {
        push({ at: block.t_start, kind: 'cooling', trigger: 'drop', response, her: hers.text, his: reply.text }, reply)
      }
      continue
    }

    const reply = nextOf(position, 'user')

    // COOLING, from her length: the second of two minimal answers in a row.
    // Once per run, so three one-word answers are one moment, not two.
    const minimal = wordsIn(block.text).length <= MINIMAL_WORDS
    minimalRun = minimal ? minimalRun + 1 : 0
    if (minimalRun === 2) {
      const previous = position > 0 ? blocks[position - 1] : undefined
      if (reply && previous?.speaker === 'user') {
        const response = afterCooling(previous, block, reply)
        if (response) {
          push({ at: block.t_start, kind: 'cooling', trigger: 'short-replies', response, her: block.text, his: reply.text }, reply)
        }
      }
    }

    // A misheard reply (R8) is not his move; nothing is read off it.
    if (!reply || isMisheard(reply.text)) continue

    // WARMING. A question is the strongest bid and is read as one even when
    // it comes with a disclosure attached; a laugh is read only when nothing
    // else was offered in the same breath.
    if (herAsks(block.text)) {
      const reading = readBid(block, reply)
      push({
        at: block.t_start, kind: 'warming', trigger: 'question',
        response: afterQuestion(reading), her: block.text, his: reply.text,
      }, reply, reading.answerWords)
    } else if (isDisclosure(block.text)) {
      const response = afterDisclosure(block, reply)
      if (response) {
        push({ at: block.t_start, kind: 'warming', trigger: 'disclosure', response, her: block.text, his: reply.text }, reply)
      }
    } else if (LAUGH.test(block.text) && !isMisheard(reply.text)) {
      const kind = classifyUserTurn(reply.text, { herLastTurnAsked: false })
      const dropped = kind === 'silence' || kind === 'acknowledgement' || kind === 'dismissal'
      push({
        at: block.t_start, kind: 'warming', trigger: 'laugh',
        response: dropped ? 'let-it-drop' : 'kept-it-going', her: block.text, his: reply.text,
      }, reply)
    }
  }

  return choose(candidates, limit).map((candidate): SignalFact => ({
    at: candidate.at,
    clock: candidate.clock,
    kind: candidate.kind,
    trigger: candidate.trigger,
    response: candidate.response,
    read: candidate.read,
    sentence: candidate.sentence,
    her: candidate.her,
    his: candidate.his,
  }))
}

/**
 * The top `limit` by teachability, then back into the order they happened.
 *
 * **Never only misses when there was a read to show.** §07 names what went
 * well before anything critical, and the reason is retention rather than
 * manners — so if the three most teachable moments are all misses and the rep
 * held a moment he read correctly, the weakest miss gives up its place to it.
 */
function choose(candidates: Candidate[], limit: number): Candidate[] {
  if (limit <= 0) return []
  const ranked = [...candidates].sort((a, b) =>
    TEACHABILITY[b.response] - TEACHABILITY[a.response]
    || b.weight - a.weight
    || a.at - b.at)
  const picked = ranked.slice(0, limit)
  if (picked.length === limit && picked.every((fact) => !fact.read)) {
    const bestRead = ranked.slice(limit).find((fact) => fact.read)
    if (bestRead) picked[picked.length - 1] = bestRead
  }
  return picked.sort((a, b) => a.at - b.at)
}
