/**
 * Whether the answers were actually right (INTERVIEW-TECHNICAL-PLAN §8).
 *
 * ── THIS IS A CHANGE TO WHAT NERVE IS, AND IT IS DELIBERATE ──────────────
 *
 * `lib/grade/interview/rubric.ts` says, in these words: *"Do not penalise a
 * candidate for not knowing something."* That is §07 inherited from the dating
 * arm — score process, never result — and it makes Nerve a gym for how you
 * handle an interview. From this plan onward **technical accuracy is scored**,
 * for a reason that is commercial and was stated plainly: that is what people
 * will be paying for, to know if they know. A candidate who wants to find out
 * whether their understanding of authentication survives contact with an
 * interviewer cannot find that out from a composure score.
 *
 * ── WHAT IT DOES NOT CHANGE ──────────────────────────────────────────────
 *
 * **§07 still holds for the OUTCOME.** Whether the interviewer seemed convinced
 * still contributes zero. A candidate who gets every fundamental right and
 * rambles through all of them still scores badly on structure.
 *
 * **Rule 8 still holds.** Nothing surfaces during a live rep. She never says
 * "that is wrong", never corrects, never hints. Accuracy is computed after and
 * displayed after, and nowhere else.
 *
 * **Not knowing is still not a character flaw.** Saying "I do not know" plainly
 * still scores well on composure. It scores nothing on accuracy, and those are
 * two different numbers on the same card. That distinction is the whole design:
 * the card can say *you handled that well and you were wrong*, which is the
 * most useful sentence this product could say to somebody.
 *
 * ── AND IT ABSTAINS BY CONSTRUCTION ──────────────────────────────────────
 *
 * §3.4, stated before it was built: a model judging correctness will sometimes
 * be wrong, and **being told you were wrong when you were right is far more
 * damaging than any soft process score.** So `UNSCORABLE` is the default, an
 * abstention is excluded from the denominator entirely rather than counted as a
 * zero, and an interview where everything abstained returns **null** — not a
 * bad score, no score. An abstention costs nothing. A false accusation costs
 * the account.
 */

import type { TranscriptTurn } from '@/lib/voice/types'
import { difficultySpec, type DifficultyLevel } from '@/lib/data/interview-difficulty'
import { interviewField, type InterviewFieldId } from '@/lib/data/interview-fields'

/**
 * One probe and the answer that followed it.
 *
 * The pair is the unit, not the transcript: "walk me through what you built"
 * has no correct answer, and a grader handed the whole rep would have to decide
 * for itself which questions were meant to have one. Deciding that at read time
 * is exactly the guesswork the mark exists to remove.
 */
export interface ProbePair {
  /** What she asked, verbatim. */
  question: string
  /** Everything the candidate said before her next turn. */
  answer: string
  /** Seconds into the rep the probe was asked. For the scorecard's ordering. */
  at: number
}

/** How much of one answer reaches the accuracy pass. */
export const ANSWER_CHARACTER_LIMIT = 3_000
/**
 * The most pairs one rep can produce.
 *
 * A twenty-five-minute round plans five ladder rungs and a twenty-minute
 * technical plans three probes, so this is headroom rather than a rule. It
 * bounds the prompt against a transcript with a marking bug in it, which is the
 * only way it could ever be reached.
 */
export const MAX_PROBE_PAIRS = 12

/**
 * The pairs, out of a marked transcript.
 *
 * A probe with nothing after it is dropped rather than scored against silence —
 * a rep that ended on her question has one unanswered probe, and grading it
 * would mark a candidate wrong for the clock running out.
 */
export function probePairsFrom(transcript: readonly TranscriptTurn[]): ProbePair[] {
  const pairs: ProbePair[] = []
  for (let index = 0; index < transcript.length; index += 1) {
    const turn = transcript[index]!
    if (turn.speaker !== 'agent' || turn.kind !== 'probe') continue

    const said: string[] = []
    for (let after = index + 1; after < transcript.length; after += 1) {
      const next = transcript[after]!
      if (next.speaker === 'agent') break
      const text = next.text.trim()
      if (text) said.push(text)
    }
    const answer = said.join(' ').slice(0, ANSWER_CHARACTER_LIMIT)
    if (!answer) continue
    pairs.push({ question: turn.text.trim(), answer, at: turn.t_start })
    if (pairs.length >= MAX_PROBE_PAIRS) break
  }
  return pairs
}

/* ------------------------------------------------------------------ *
 * The pass
 * ------------------------------------------------------------------ */

export type AccuracyVerdict = 'CORRECT' | 'INCOMPLETE' | 'WRONG' | 'UNSCORABLE'

export interface AccuracyJudgement {
  verdict: AccuracyVerdict
  /**
   * What they said that was wrong, in their own words. Empty unless `WRONG`.
   *
   * Required on a `WRONG` by the prompt AND by `parseAccuracyJudgements`, which
   * downgrades an unquoted accusation to `UNSCORABLE`. "You were wrong about
   * something, somewhere" is the sentence this whole design exists to prevent.
   */
  quote: string
  /** One line: what is actually true. Empty unless `WRONG` or `INCOMPLETE`. */
  correction: string
}

export const ACCURACY_POINTS: Record<Exclude<AccuracyVerdict, 'UNSCORABLE'>, number> = {
  CORRECT: 100,
  // Right as far as it goes. Deliberately well above half: a candidate who said
  // something true and stopped short is not halfway to being wrong, and a
  // ladder that scored them as if they were would make the number read as a
  // quiz mark rather than as a reading of their understanding.
  INCOMPLETE: 65,
  WRONG: 0,
}

export const ACCURACY_RUBRIC = `For each numbered pair, decide ONE verdict.

CORRECT      The substance is right, whatever the phrasing.
INCOMPLETE   Right as far as it goes, missing something a candidate at this level
             would be expected to say.
WRONG        Contains a specific claim that is false. Quote it and correct it.
UNSCORABLE   Ambiguous, partially right, garbled by transcription, or the candidate
             said plainly that they did not know.

DEFAULT TO UNSCORABLE. It costs nothing to abstain and a false WRONG costs the
account. Never mark WRONG on phrasing, on an incomplete-but-true answer, on a
simplification that is fair at this level, or on anything the transcript may have
mangled — speech recognition destroys technical words worst of all. If two readings
of what they said are available and one of them is correct, they said the correct
one.

Never penalise "I do not know" said plainly. Return UNSCORABLE and let the rest of
the scorecard read it as composure, which is what it is.

A WRONG verdict REQUIRES a quote of at most twenty words taken verbatim from their
answer, and one sentence saying what is actually true. Without both, return
UNSCORABLE instead.

An INCOMPLETE verdict takes a correction and no quote: one sentence naming the
thing they did not say.

Corrections are one line. Not a lesson, no encouragement, no links, no "you might
want to read about" — state what is true and stop.`

export interface AccuracyRequest {
  pairs: readonly ProbePair[]
  field: InterviewFieldId
  difficulty: DifficultyLevel
}

export function buildAccuracySystemPrompt(input: {
  field: InterviewFieldId
  difficulty: DifficultyLevel
}): string {
  const field = interviewField(input.field)
  const level = difficultySpec(input.difficulty)
  return [
    'You are checking whether a candidate\'s answers in a practice job interview were technically'
    + ' correct. You are not scoring how they came across — somebody else does that — and nothing'
    + ' you write is shown to them during the interview.',
    '',
    `Their field is ${field.label}. The questions were pitched at ${level.label} level, which tests`
    + ` ${level.tests.toLowerCase()}: ${level.directive}`,
    'Judge each answer against what somebody at THAT level should know. An answer that would be'
    + ' incomplete from a staff engineer can be complete from an intern.',
    '',
    ACCURACY_RUBRIC,
    '',
    'Reply with JSON only, one entry per pair, in order:',
    '{"verdicts":[{"n":1,"verdict":"CORRECT|INCOMPLETE|WRONG|UNSCORABLE","quote":"","correction":""}]}',
  ].join('\n')
}

export function renderProbePairs(pairs: readonly ProbePair[]): string {
  return pairs
    .map((pair, index) => [
      `${index + 1}. INTERVIEWER: ${pair.question}`,
      `   CANDIDATE: ${pair.answer}`,
    ].join('\n'))
    .join('\n\n')
}

/**
 * The model's reply, normalised — and downgraded wherever it overreached.
 *
 * **Every gate here fails toward `UNSCORABLE`**, which is the whole
 * construction §3.4 asked for: a missing entry, an unrecognised verdict, a
 * `WRONG` with no quote, a `WRONG` whose quote is not in what the candidate
 * actually said. That last one is the important one and it is enforced rather
 * than requested — a grader that invents a quote is a grader telling somebody
 * they said something they did not, which is worse than any wrong verdict.
 */
export function parseAccuracyJudgements(
  raw: unknown,
  pairs: readonly ProbePair[],
): AccuracyJudgement[] {
  const abstain = (): AccuracyJudgement => ({ verdict: 'UNSCORABLE', quote: '', correction: '' })
  if (!raw || typeof raw !== 'object') return pairs.map(abstain)
  const list = (raw as Record<string, unknown>).verdicts
  if (!Array.isArray(list)) return pairs.map(abstain)

  return pairs.map((pair, index) => {
    const entry = list[index]
    if (!entry || typeof entry !== 'object') return abstain()
    const row = entry as Record<string, unknown>
    const verdict = row.verdict
    if (verdict !== 'CORRECT' && verdict !== 'INCOMPLETE' && verdict !== 'WRONG') return abstain()

    const quote = typeof row.quote === 'string' ? row.quote.trim().slice(0, 200) : ''
    const correction = typeof row.correction === 'string' ? row.correction.trim().slice(0, 300) : ''

    if (verdict === 'WRONG') {
      // Both halves, or it is not an accusation this product will make.
      if (!quote || !correction) return abstain()
      if (!quotesTheAnswer(quote, pair.answer)) return abstain()
      return { verdict, quote, correction }
    }
    if (verdict === 'INCOMPLETE') {
      if (!correction) return abstain()
      return { verdict, quote: '', correction }
    }
    return { verdict, quote: '', correction: '' }
  })
}

/**
 * Is the quote actually theirs?
 *
 * Compared on letters and digits alone, lowercased. Punctuation and whitespace
 * are the transcript's rather than the candidate's, and a verdict thrown away
 * over a comma would push a real finding into an abstention for no reason.
 */
export function quotesTheAnswer(quote: string, answer: string): boolean {
  const flatten = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '')
  const needle = flatten(quote)
  if (needle.length < 8) return false
  return flatten(answer).includes(needle)
}

/* ------------------------------------------------------------------ *
 * The number, and what the candidate reads
 * ------------------------------------------------------------------ */

export interface AccuracyNote {
  /** Which pair, 1-based, so the scorecard can order them as they happened. */
  index: number
  verdict: Exclude<AccuracyVerdict, 'CORRECT' | 'UNSCORABLE'>
  question: string
  quote: string
  correction: string
}

export interface AccuracyResult {
  /** 0-100, or null when nothing could be judged. Null is not zero. */
  score: number | null
  /** How many pairs the verdict counted. The denominator, stated. */
  scored: number
  /** How many were put to them at all. */
  asked: number
  correct: number
  incomplete: number
  wrong: number
  /** One line per thing that was not right. Never a lesson (§10.7). */
  notes: AccuracyNote[]
}

export function accuracyResult(
  pairs: readonly ProbePair[],
  judgements: readonly AccuracyJudgement[],
): AccuracyResult {
  let correct = 0
  let incomplete = 0
  let wrong = 0
  let total = 0
  const notes: AccuracyNote[] = []

  judgements.forEach((judgement, index) => {
    const pair = pairs[index]
    if (!pair) return
    if (judgement.verdict === 'UNSCORABLE') return
    total += ACCURACY_POINTS[judgement.verdict]
    if (judgement.verdict === 'CORRECT') correct += 1
    else {
      if (judgement.verdict === 'WRONG') wrong += 1
      else incomplete += 1
      notes.push({
        index: index + 1,
        verdict: judgement.verdict,
        question: pair.question,
        quote: judgement.quote,
        correction: judgement.correction,
      })
    }
  })

  const scored = correct + incomplete + wrong
  return {
    // NULL, NOT ZERO. An interview where everything abstained has no accuracy
    // reading, and rendering that as a zero would be the false accusation §3.4
    // refuses, delivered by arithmetic instead of by a model.
    score: scored === 0 ? null : Math.round(total / scored),
    scored,
    asked: pairs.length,
    correct,
    incomplete,
    wrong,
    notes,
  }
}

/**
 * The sentence that separates the two numbers (§8.5).
 *
 * The valuable thing this product can say is *you handled that well and you
 * were wrong*, so the line names the count and nothing else. No verdict on the
 * candidate, no encouragement, no advice — the corrections are underneath it
 * and they are the content.
 */
export function accuracyReading(result: AccuracyResult): string | null {
  if (result.score === null) return null
  const missed = result.wrong + result.incomplete
  if (missed === 0) {
    return result.scored === 1
      ? 'The one thing you were asked about was right.'
      : `All ${result.scored} of the things you were asked about were right.`
  }
  const wrong = result.wrong === 1 ? 'one was wrong' : `${result.wrong} were wrong`
  const short = result.incomplete === 1
    ? 'one was short of a full answer'
    : `${result.incomplete} were short of a full answer`
  const parts = [
    ...(result.wrong > 0 ? [wrong] : []),
    ...(result.incomplete > 0 ? [short] : []),
  ]
  return `Of the ${result.scored} things you were asked about, ${parts.join(' and ')}.`
}
