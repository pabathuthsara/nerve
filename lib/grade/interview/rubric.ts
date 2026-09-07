/**
 * The interview rubric (§07's judgement layer, 40%).
 *
 * A NEW FILE BESIDE `lib/grade/prompt.ts`, WHICH IS NOT OPENED (rule 19).
 *
 * ── WHY THREE OF THE SIX HAD TO BE REWRITTEN ─────────────────────────────
 *
 * `OPENING` is *"did he get a conversation started at all"*, `CURIOSITY` is
 * *"did he ask about her, and go past the first answer"*, and `CLOSE` is
 * *"leaving warmly without pushing"*. All three describe the person who
 * APPROACHED. In an interview the candidate did not approach anybody, is not
 * supposed to be curious about the interviewer's afternoon, and does not leave
 * — they are asked whether they have any questions.
 *
 * Three transfer as skills under a different name and are re-anchored rather
 * than re-invented:
 *
 *   LISTENING       the same skill, and the same failure mode: answering the
 *                   question they prepared for instead of the one they got.
 *   COMPOSURE       the same, and recovery still counts for more than never
 *                   having stumbled.
 *   SIGNAL READING  the same, and it is the sharpest of the six here: an
 *                   interviewer who has stopped following up has told them
 *                   something, and most candidates keep going.
 *
 * And three are the interview's own:
 *
 *   STRUCTURE       did the answer have a shape, or did it wander until it ran
 *                   out. This is what replaces OPENING.
 *   SPECIFICITY     evidence, not adjectives. A decision, a number, a
 *                   consequence — the same axis the live scorer reads.
 *   CLOSE           the questions they asked back, which is a beat candidates
 *                   really do lose offers on.
 *
 * ── WHAT SURVIVES VERBATIM, AND MUST ─────────────────────────────────────
 *
 * §07's law. Outcome is worth zero, and it matters MORE here than on the dating
 * arm, because "did you get the job" is the thing every competitor in this
 * category scores. A candidate who is turned down can score 92.
 *
 * ── AND THE MEMORY LINE IS GONE ──────────────────────────────────────────
 *
 * Deliberately absent rather than emptied. An interviewer who remembers your
 * last attempt is the companion-app framing rule 9 refuses and §14 calls a
 * payment account waiting to be closed — `rep-screens.tsx` already suppresses
 * the surface, and this is the other half: nothing produces a line to suppress.
 */

import type { TranscriptTurn } from '@/lib/voice/types'
import type { DeterministicMetrics } from '../metrics'
import { renderMetrics } from '../prompt'

export const INTERVIEW_RUBRIC = `Score six dimensions, 0-100 each.

STRUCTURE        Did the answer have a shape — a situation, what they did, what
                 happened — or did it wander until it ran out? A short answer with
                 a shape beats a long one without.
SPECIFICITY      Evidence, not adjectives. A decision they made, a number they
                 moved, a consequence they owned. "I was responsible for" is a job
                 description; "I argued for X and we saw Y" is an answer.
LISTENING        Did they answer the question they were asked, or the one they had
                 prepared? Picking up the interviewer's actual words and following
                 them, versus running a rehearsed block.
SIGNAL READING   Did they notice how it was landing, and adjust? Missing an
                 interviewer who has stopped following up scores low. Correctly
                 reading a neutral one and giving more scores high.
COMPOSURE        Did they stay steady under a hard question or a silence? Recovery
                 after a bad answer counts for more than never having one.
CLOSE            The questions they asked back, and how they ended. A real question
                 about the work scores high. No questions at all scores low, INCLUDING
                 when everything before it went well.

SCORE THE PROCESS, NEVER THE OUTCOME.
Whether the interviewer seemed convinced, said anything encouraging, or mentioned
next steps contributes ZERO. A clean interview that ends in a no can score 92. A
sloppy one that got a warm goodbye scores 54. If you find yourself rewarding them
because it seemed to go well, stop and score how they played instead.

Do not penalise transcription errors. Speech recognition mangles technical words
worst of all; if the interviewer's reply shows she understood them, they were
understood.

Do not penalise a candidate for not knowing something, for asking for a moment to
think, or for saying they do not have an example. Saying so plainly is composure.

EVIDENCE: for each dimension, quote at most twelve words from THEIR answers that
drove the score. If nothing supports it, return "".

WENT WELL: one sentence naming something they actually did well, quoting them.
Required, and it is named before anything critical.`

export interface InterviewGradeRequestPayload {
  transcript: TranscriptTurn[]
  metrics: DeterministicMetrics
  interviewerName: string
  sessionSeconds: number
}

/**
 * The transcript, in this arm's labels.
 *
 * Its own renderer rather than `renderTranscript`, which writes `HIM:` — right
 * on the dating arm and wrong on one where the speaker is a candidate of any
 * gender. `renderMetrics` IS reused unchanged: it renders numbers that mean the
 * same thing on both tracks, and a second copy would be a second place for the
 * targets to drift.
 */
export function renderInterviewTranscript(
  transcript: readonly TranscriptTurn[],
  interviewerName: string,
): string {
  return transcript
    .map(
      (turn) =>
        `[${turn.t_start.toFixed(1)}s] ${turn.speaker === 'user' ? 'CANDIDATE' : interviewerName.toUpperCase()}: ${turn.text}`,
    )
    .join('\n')
}

export { renderMetrics }

/**
 * The measured block, in this arm's targets.
 *
 * `renderMetrics` is `lib/grade/prompt.ts`'s and is Tier 0 — it is not opened,
 * and A0 pins its exact output. It also states four numbers that are wrong
 * here: *talk ratio target 40-55%*, *longest monologue target < 22*, *mean
 * response latency target < 1.8*, and two dating booleans (`specific plan
 * offered`, `clean exit`) that no interview can produce.
 *
 * Handing those to the grader is worse than handing it nothing. It reads
 * "target 40-55%" beside a 68% a candidate earned by answering properly, and
 * marks the rep down on every dimension that touches delivery — the
 * deterministic half already scored it wrong once, and this is the same wrong
 * number arriving a second time as prose. So this is the same block against
 * `INTERVIEW_METRIC_BANDS`, and the two dating booleans are gone.
 */
export function renderInterviewMetrics(metrics: DeterministicMetrics): string {
  const pct = (value: number | null) => (value === null ? 'n/a' : `${Math.round(value * 100)}%`)
  const num = (value: number | null, digits = 1) =>
    value === null ? 'n/a' : value.toFixed(digits)
  return [
    `answer share ${pct(metrics.talkRatio)} (target 55-78% — they should be doing most of the talking)`,
    `questions they asked back: ${metrics.questionsAsked}`,
    `filler ${num(metrics.fillerRate)}/min (target < 4)`,
    `longest answer ${num(metrics.longestMonologue)}s (target 20-75s)`,
    `mean thinking time ${num(metrics.meanResponseLatency)}s (target < 3 — a beat before a hard answer is composure)`,
    '',
    'These are already measured. Use them as context; do not re-score them.',
  ].join('\n')
}

export function buildInterviewGradeSystemPrompt(): string {
  return [
    'You grade a practice job interview. A candidate answered questions from an interviewer they had not met. They are training; the interviewer is a character.',
    '',
    INTERVIEW_RUBRIC,
    '',
    'Reply with JSON only:',
    '{"structure":n,"specificity":n,"listening":n,"signalReading":n,"composure":n,"close":n,',
    '"evidence":{"structure":"...","specificity":"...","listening":"...","signalReading":"...","composure":"...","close":"..."},',
    '"wentWell":"...","outcome":"receptive|neutral|rejecting"}',
  ].join('\n')
}

/**
 * The six, mapped onto the names the scorecard and the `scores` table use.
 *
 * `structure → opening` and `specificity → curiosity`. No migration and no
 * second set of columns: all six are one number out of a hundred in a fixed
 * slot, and a parallel table would only be a second place for the composite to
 * be computed from. Stated once, here and in `lib/data/interview-progress.ts`,
 * and asserted in both.
 */
export const INTERVIEW_SUBSCORE_KEY: Record<string, 'opening' | 'curiosity' | 'listening' | 'signalReading' | 'composure' | 'close'> = {
  structure: 'opening',
  specificity: 'curiosity',
  listening: 'listening',
  signalReading: 'signalReading',
  composure: 'composure',
  close: 'close',
}

/**
 * Normalises the model's reply into the shape the shared grader already reads.
 *
 * The interview arm returns `structure`/`specificity`; everything downstream —
 * the composite, the scorecard, the `scores` insert, `/progress` — reads
 * `opening`/`curiosity`. Renaming here rather than downstream means the rest of
 * the grading path is untouched, which is the point.
 */
export function normaliseInterviewScores(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const mapped: Record<string, unknown> = { ...raw }
  for (const [from, to] of Object.entries(INTERVIEW_SUBSCORE_KEY)) {
    if (from === to) continue
    if (raw[from] !== undefined) {
      mapped[to] = raw[from]
      delete mapped[from]
    }
  }
  const evidence = raw.evidence
  if (evidence && typeof evidence === 'object' && !Array.isArray(evidence)) {
    const source = evidence as Record<string, unknown>
    const next: Record<string, unknown> = { ...source }
    for (const [from, to] of Object.entries(INTERVIEW_SUBSCORE_KEY)) {
      if (from === to) continue
      if (source[from] !== undefined) {
        next[to] = source[from]
        delete next[from]
      }
    }
    mapped.evidence = next
  }
  // §11 and rule 9: the interview arm has no memory line, so nothing may arrive
  // carrying one. Cleared rather than trusted absent.
  mapped.memoryLine = ''
  return mapped
}
