/**
 * The stored grade, rendered as the scorecard the frontend draws.
 *
 * The stored shape (§07) is six deterministic metrics scored 0-100 each, a
 * judgement layer of six sub-scores, and a composite that is 60% the mean of
 * the first and 40% the mean of the second. The frontend draws rows that carry
 * points out of a maximum and expects the visible rows to add up to the
 * composite — because a composite nobody can take apart is worse than a lower
 * one anybody can.
 *
 * Both of those are true at once here, and the arithmetic is not fudged to
 * make it so:
 *
 *   each metric row is worth 10          six rows, 60 points, the 60%
 *   the judgement row is worth 40        the other half of §07, in one line
 *
 * The judgement row takes the rounding. Six independent roundings can leave
 * the visible total a point away from the stored composite, and the honest
 * place to absorb that is the row whose inputs are themselves a model's
 * opinion — not a metric with a measured value printed beside it.
 */

import type { MetricBand, Moment, Scorecard } from './types'
import { uiWarmth } from './progression'

/** What the stored `metric_scores` rows look like coming back from Postgres. */
export interface StoredMetricScore {
  key: string
  label: string
  band: string
  value: number | null
  points: number | null
  verdict: 'inside' | 'below' | 'above' | 'unmeasured'
}

/** A turn-level warmth event as persisted beside the transcript. */
export interface StoredWarmthEvent {
  turnIndex: number
  delta: number
  warmthAfter: number
  reason: string
  userText: string
}

interface Axis {
  /** The frontend bar is 0-100. This is what 100 means for this metric. */
  max: number
  key: MetricBand['key']
  label: string
  targetMin: number
  targetMax: number
  format: (value: number) => string
  /** One sentence per verdict. Hand-authored, like every other string (§02). */
  notes: { below: string; inside: string; above: string }
}

/**
 * The display axis for each metric.
 *
 * `targetMin`/`targetMax` are the band from lib/grade/metrics.ts expressed in
 * bar coordinates. They are duplicated deliberately rather than imported:
 * lib/grade is server-side scoring and this is presentation, and the day the
 * band moves, the scorecard should keep rendering the band the stored grade
 * was actually scored against.
 */
const AXES: Record<string, Axis> = {
  talkRatio: {
    key: 'talk_ratio',
    label: 'Talk ratio',
    max: 1,
    targetMin: 40,
    targetMax: 55,
    format: (value) => `${Math.round(value * 100)}%`,
    notes: {
      below: 'You left most of the work to her. Room to say more of what you actually think.',
      inside: 'You shared the floor without disappearing from it.',
      above: 'You held the floor. She had to wait for a gap rather than take one.',
    },
  },
  questionsPer3Min: {
    key: 'question_rate',
    label: 'Question rate',
    max: 16,
    targetMin: 18.75,
    targetMax: 50,
    format: (value) => value.toFixed(1),
    notes: {
      below: 'Almost no questions. She had nowhere obvious to take it next.',
      inside: 'Curious without turning the conversation into an interview.',
      above: 'Questions stacked up faster than answers. It reads as an interview.',
    },
  },
  openClosedRatio: {
    key: 'open_closed',
    label: 'Open / closed',
    max: 5,
    targetMin: 40,
    targetMax: 100,
    format: (value) => `${value.toFixed(1)}:1`,
    notes: {
      below: 'Most of your questions could be answered in one word, and were.',
      inside: 'Your questions gave her somewhere to go.',
      above: 'Open questions throughout. She had room to take it anywhere.',
    },
  },
  fillerRate: {
    key: 'filler_words',
    label: 'Filler control',
    max: 12,
    targetMin: 0,
    targetMax: 33,
    format: (value) => `${value.toFixed(1)}/min`,
    notes: {
      below: 'Clean delivery.',
      inside: 'A few fillers under pressure, never enough to blur the point.',
      above: 'Fillers crowded the sentences and softened what you were saying.',
    },
  },
  longestMonologue: {
    key: 'longest_monologue',
    label: 'Longest monologue',
    max: 60,
    targetMin: 0,
    targetMax: 37,
    format: (value) => `${Math.round(value)}s`,
    notes: {
      below: 'Everything stayed inside the exchange.',
      inside: 'Your longest answer stayed inside the exchange.',
      above: 'One answer ran long enough that she stopped being in the conversation.',
    },
  },
  meanResponseLatency: {
    key: 'response_latency',
    label: 'Response latency',
    max: 5,
    targetMin: 0,
    targetMax: 36,
    format: (value) => `${value.toFixed(1)}s`,
    notes: {
      below: 'You came back quickly and it stayed easy.',
      inside: 'Your pauses read as considered rather than vacant.',
      above: 'The gaps before your replies got long enough to feel like effort.',
    },
  },
}

/** Points available per deterministic metric row. Six of them: the 60%. */
const METRIC_MAX = 10
/** Points available for the judgement layer. The other 40%. */
const JUDGEMENT_MAX = 40

/** One hand-written instruction per sub-score. Never model-generated (§07). */
const FOCUS_INSTRUCTIONS: Record<string, string> = {
  opening: 'Open with something about the room you are both standing in, not about her.',
  curiosity: 'Ask one question about the thing she just said, before you change lanes.',
  listening: 'Use a detail she already gave you instead of starting a fresh topic.',
  signalReading: 'When she shortens her answers, slow down rather than adding another question.',
  composure: 'Let one silence sit. Filling it is what turns a pause into pressure.',
  close: 'Make the ask early enough that it grows out of the conversation instead of interrupting it.',
}

export const SUB_SCORE_LABELS: Record<string, string> = {
  opening: 'Opening',
  curiosity: 'Curiosity',
  listening: 'Listening',
  signalReading: 'Signal reading',
  composure: 'Composure',
  close: 'Close',
}

function barPosition(value: number, axis: Axis): number {
  return Math.max(0, Math.min(100, (value / axis.max) * 100))
}

function toMetricBand(stored: StoredMetricScore): MetricBand | null {
  const axis = AXES[stored.key]
  if (!axis) return null

  const measured = typeof stored.value === 'number'
  const verdict = stored.verdict === 'below' ? 'LOW' : stored.verdict === 'above' ? 'HIGH' : 'GOOD'
  const note = stored.verdict === 'below'
    ? axis.notes.below
    : stored.verdict === 'above'
      ? axis.notes.above
      : axis.notes.inside

  return {
    key: axis.key,
    label: axis.label,
    // An unmeasured metric says so rather than printing a zero it did not earn.
    displayValue: measured ? axis.format(stored.value as number) : '—',
    numericValue: measured ? barPosition(stored.value as number, axis) : 0,
    targetLabel: stored.band,
    targetMin: axis.targetMin,
    targetMax: axis.targetMax,
    verdict: measured ? verdict : 'GOOD',
    points: measured ? Math.round(((stored.points ?? 0) / 100) * METRIC_MAX) : 0,
    maxPoints: METRIC_MAX,
    note: measured ? note : 'This rep was too short to measure it.',
  }
}

export interface ScoreRow {
  composite: number
  metric_scores: unknown
  focus: string[] | null
  went_well: string | null
  opening: number | null
  curiosity: number | null
  listening: number | null
  signal_reading: number | null
  composure: number | null
  close: number | null
}

/** The best and worst turn of the rep, taken from the warmth gutter itself. */
export function momentsFrom(events: StoredWarmthEvent[]): { best: Moment | null; worst: Moment | null } {
  const spoken = events.filter((event) => event.userText.trim().length > 0)
  if (spoken.length === 0) return { best: null, worst: null }

  const byDelta = [...spoken].sort((a, b) => b.delta - a.delta)
  const top = byDelta[0]
  const bottom = byDelta[byDelta.length - 1]

  const toMoment = (event: StoredWarmthEvent): Moment => ({
    turnIndex: event.turnIndex,
    quote: event.userText,
    delta: Math.round(event.delta),
    warmthAfter: uiWarmth(event.warmthAfter),
    note: event.reason,
  })

  return {
    // A rep where nothing moved has no best moment worth claiming, and a rep
    // where nothing went wrong should not be handed a worst one.
    best: top && top.delta > 0 ? toMoment(top) : null,
    worst: bottom && bottom.delta < 0 ? toMoment(bottom) : null,
  }
}

export function toScorecard(input: {
  sessionId: string
  score: ScoreRow
  events: StoredWarmthEvent[]
}): Scorecard {
  const stored = Array.isArray(input.score.metric_scores)
    ? (input.score.metric_scores as StoredMetricScore[])
    : []

  const metrics = stored
    .map(toMetricBand)
    .filter((metric): metric is MetricBand => metric !== null)

  const deterministicPoints = metrics.reduce((sum, metric) => sum + metric.points, 0)
  const judgementPoints = Math.max(0, Math.min(JUDGEMENT_MAX, input.score.composite - deterministicPoints))

  const subScores = (['opening', 'curiosity', 'listening', 'signalReading', 'composure', 'close'] as const)
    .map((key) => ({
      key: key as string,
      label: SUB_SCORE_LABELS[key] ?? key,
      value: input.score[key === 'signalReading' ? 'signal_reading' : key],
    }))
    // A sub-score the judge did not return is left out rather than shown as a
    // zero somebody could read as a verdict.
    .filter((entry): entry is { key: string; label: string; value: number } => typeof entry.value === 'number')

  const { best, worst } = momentsFrom(input.events)
  const firstFocus = input.score.focus?.[0]

  return {
    sessionId: input.sessionId,
    composite: input.score.composite,
    metrics,
    judgement: {
      label: 'Judgement',
      points: judgementPoints,
      maxPoints: JUDGEMENT_MAX,
      subScores,
      wentWell: input.score.went_well,
    },
    bestMoment: best,
    worstMoment: worst,
    tryNext: (firstFocus && FOCUS_INSTRUCTIONS[firstFocus])
      ?? 'Run it back and change one thing on purpose. One change is readable; three are not.',
    focus: input.score.focus ?? [],
  }
}
