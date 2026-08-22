/**
 * The grading rubric (§07 — judgement layer, 40%).
 *
 * Fixed rubric, temperature zero, evidence required. Unlike the live scorer
 * this has no latency budget and sees the whole transcript, so it can be asked
 * for judgement rather than classification.
 */

import type { TranscriptTurn } from '@/lib/voice/types'
import type { DeterministicMetrics } from './metrics'

export const RUBRIC = `Score six dimensions, 0-100 each.

OPENING          Did he get a conversation started at all, and how? Speaking to a
                 stranger is the whole skill. An awkward opener that lands beats a
                 polished one that never comes.
CURIOSITY        Did he ask about her, and go past the first answer? Depth over count.
LISTENING        Did he use what she gave him? Picking up her actual words and
                 following them, versus waiting for his turn to talk.
SIGNAL READING   Did he correctly read how interested she was, and adjust? Missing a
                 clear no scores low. Correctly reading an ambiguous no scores high.
COMPOSURE        Did he stay steady? Recovery after an awkward moment counts for more
                 than never having one.
CLOSE            How did it end? Leaving warmly without pushing scores high, INCLUDING
                 when he was turned down.

SCORE THE PROCESS, NEVER THE OUTCOME.
Whether she gave a number, agreed to anything, or walked away contributes ZERO.
A clean rep that ends in rejection can score 92. A sloppy rep that got lucky
scores 54. If you find yourself rewarding him because it went well, stop and
score how he played instead.

Do not penalise transcription errors. Speech recognition mangles words; if her
reply shows she understood him, he was understood.

EVIDENCE: for each dimension, quote at most twelve words from HIS lines that
drove the score. If nothing supports it, return "".

WENT WELL: one sentence naming something he actually did well, quoting him.
Required, and it is named before anything critical.`

export interface GradeRequestPayload {
  transcript: TranscriptTurn[]
  metrics: DeterministicMetrics
  personaName: string
  sessionSeconds: number
}

export function renderTranscript(
  transcript: readonly TranscriptTurn[],
  personaName: string,
): string {
  return transcript
    .map(
      (turn) =>
        `[${turn.t_start.toFixed(1)}s] ${turn.speaker === 'user' ? 'HIM' : personaName.toUpperCase()}: ${turn.text}`,
    )
    .join('\n')
}

/**
 * The deterministic numbers are shown to the grader as context, not as an
 * instruction. They already carry 60% of the composite on their own; letting
 * the model restate them would weight them twice.
 */
export function renderMetrics(metrics: DeterministicMetrics): string {
  const pct = (value: number | null) => (value === null ? 'n/a' : `${Math.round(value * 100)}%`)
  const num = (value: number | null, digits = 1) =>
    value === null ? 'n/a' : value.toFixed(digits)
  return [
    `talk ratio ${pct(metrics.talkRatio)} (target 40-55%)`,
    `questions ${metrics.questionsAsked} (${metrics.openQuestions} open / ${metrics.closedQuestions} closed)`,
    `filler ${num(metrics.fillerRate)}/min (target < 4)`,
    `longest monologue ${num(metrics.longestMonologue)}s (target < 22)`,
    `mean response latency ${num(metrics.meanResponseLatency)}s (target < 1.8)`,
    `specific plan offered: ${metrics.specificPlanOffered}`,
    `clean exit: ${metrics.cleanExit}`,
    '',
    'These are already measured. Use them as context; do not re-score them.',
  ].join('\n')
}

export function buildGradeSystemPrompt(): string {
  return [
    'You grade a practice conversation. A man approached a woman he does not know and tried to hold a conversation. He is training; she is a character.',
    '',
    RUBRIC,
    '',
    'Reply with JSON only:',
    '{"opening":n,"curiosity":n,"listening":n,"signalReading":n,"composure":n,"close":n,',
    '"evidence":{"opening":"...","curiosity":"...","listening":"...","signalReading":"...","composure":"...","close":"..."},',
    '"wentWell":"...","outcome":"receptive|neutral|rejecting"}',
  ].join('\n')
}
