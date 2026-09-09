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

import type { MetricBand, Moment, Scorecard, ScorecardAccuracy, Track } from './types'
import type { Axis } from './scorecard-axis'
import {
  INTERVIEW_AXES,
  INTERVIEW_FOCUS_INSTRUCTIONS,
  INTERVIEW_TRY_NEXT,
} from './interview-scorecard'

import { uiWarmth } from './progression'
import { DIMENSION_COLUMN, DIMENSION_LABEL, INTERVIEW_DIMENSIONS } from './interview-progress'

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

/**
 * Points available per deterministic metric row.
 *
 * **DERIVED, NOT TEN.** The deterministic half is sixty points however many
 * rows it is spread across — `scoreDeterministic` takes the MEAN of the metrics
 * it could measure — so a fixed ten per row is only correct when exactly six
 * were measured. The dating table has eight bands and two of them (`the ask`,
 * `the exit`) are frequently unmeasured, and the interview table has five, so
 * the audit line on the scorecard was arithmetic that happened to be right on
 * the common case and visibly wrong beside it, marked `.danger` for disagreeing
 * with a composite that was correct.
 *
 * Sixty divided by the rows that actually scored. Six scored rows is ten each,
 * which is exactly what it has always drawn for a dating rep.
 */
const DETERMINISTIC_POINTS = 60
function metricMax(scored: number): number {
  return scored > 0 ? DETERMINISTIC_POINTS / scored : 0
}
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
  /**
   * THE SEVENTH, AND IT IS THE INTERVIEW ARM'S ALONE
   * (INTERVIEW-TECHNICAL-PLAN §8.4).
   *
   * It is a LABEL rather than a member of `SubScores`: the six above are what
   * the grader returns on both tracks, what `weakestTwo` picks a focus from and
   * what the `scores` insert has columns for. This one is nullable, produced by
   * a second pass, and never appears on a dating rep — so it lives here, where
   * something that has a number needs a word for it, and nowhere else.
   *
   * The mark registry's test walks these keys, which is why `dim-accuracy`
   * exists. `MISSIONS` deliberately does not have a seventh entry and its own
   * test asserts that: a mission is a thing to try during a rep, and §05 says
   * nothing about correctness may surface during one.
   */
  technicalAccuracy: 'Technical accuracy',
}

/**
 * ── THE SAME SIX NUMBERS, IN THIS ARM'S WORDS ────────────────────────────
 *
 * The interview grader does NOT score opening, curiosity or a close. It scores
 * **structure, specificity, listening, signal reading, composure and the
 * questions asked back** (`lib/grade/interview/rubric.ts`), and
 * `INTERVIEW_SUBSCORE_KEY` then renames them onto the `scores` columns the
 * dating arm already had — one number out of a hundred in a fixed slot, so a
 * second set of columns would only be a second place for the composite to be
 * computed from.
 *
 * That rename was a storage decision and it leaked out of storage. The
 * scorecard read the stored key and printed the DATING word for it, so a
 * candidate who was scored on whether their answer had a shape read
 * **"Opening 71"**, and one scored on evidence read **"Curiosity 64"**. The
 * numbers were right and every label on the judged half was describing the
 * other product.
 *
 * **Derived, never re-authored.** `DIMENSION_LABEL` is the interview arm's own
 * naming and `/interview`'s readiness panel already prints it; a third hand-
 * written list here would be a third thing to keep in step. This inverts
 * `DIMENSION_COLUMN` instead, so a renamed dimension moves both screens at once
 * — and `scorecard.test.ts` walks the real unions rather than trusting it.
 *
 * The seventh is stated rather than derived because it has no dating
 * counterpart to map from: it is a nullable second pass and never appears on a
 * dating rep at all (§8.4).
 */
export const INTERVIEW_SUB_SCORE_LABELS: Record<string, string> = {
  ...Object.fromEntries(
    INTERVIEW_DIMENSIONS.map((dimension) => [
      // `scores` spells it `signal_reading`; a sub-score key is `signalReading`.
      DIMENSION_COLUMN[dimension].replace(/_(.)/g, (_, letter: string) => letter.toUpperCase()),
      DIMENSION_LABEL[dimension],
    ]),
  ),
  technicalAccuracy: SUB_SCORE_LABELS.technicalAccuracy ?? 'Technical accuracy',
}

/**
 * What to call a sub-score on the track it was earned on.
 *
 * One lookup rather than a ternary at each of the places that print one — the
 * scorecard, the trends and anything that comes after them — because the whole
 * defect above was two surfaces disagreeing about what a stored key means.
 * Falls through to the dating word for a key neither map knows, which is what
 * an unrecognised row has always rendered as.
 */
export function subScoreLabel(key: string, interview: boolean): string {
  if (interview) return INTERVIEW_SUB_SCORE_LABELS[key] ?? SUB_SCORE_LABELS[key] ?? key
  return SUB_SCORE_LABELS[key] ?? key
}

function barPosition(value: number, axis: Axis): number {
  return Math.max(0, Math.min(100, (value / axis.max) * 100))
}

function toMetricBand(
  stored: StoredMetricScore,
  axes: Record<string, Axis>,
  perMetric: number,
): MetricBand | null {
  const axis = axes[stored.key]
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
    points: measured ? Math.round(((stored.points ?? 0) / 100) * perMetric) : 0,
    maxPoints: Math.round(perMetric),
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
  /** The seventh, on an interview rep that probed. Null everywhere else (§8.4). */
  technical_accuracy?: number | null
  /** The counts and the corrections behind it (§8.5). */
  accuracy?: unknown
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
  /**
   * Which room this rep was in.
   *
   * Decides which axis table the rows are read against and which instruction
   * "Try this next time" carries. Defaults to dating, so every existing caller
   * and every ungraded-track row lands exactly where it did before the
   * interview arm had a table of its own.
   */
  track?: Track
}): Scorecard {
  const interview = input.track === 'interview'
  const axes = interview ? INTERVIEW_AXES : AXES
  const instructions = interview ? INTERVIEW_FOCUS_INSTRUCTIONS : FOCUS_INSTRUCTIONS

  const stored = Array.isArray(input.score.metric_scores)
    ? (input.score.metric_scores as StoredMetricScore[])
    : []

  // Rows the grade could actually measure. An unmeasured metric is not a zero
  // and is not part of the denominator — the same rule `scoreDeterministic`
  // applies when it takes the mean.
  const scorable = stored.filter((row) => typeof row.points === 'number' && axes[row.key])
  const perMetric = metricMax(scorable.length)

  const metrics = stored
    .map((row) => toMetricBand(row, axes, perMetric))
    .filter((metric): metric is MetricBand => metric !== null)

  const deterministicPoints = metrics.reduce((sum, metric) => sum + metric.points, 0)
  const judgementPoints = Math.max(0, Math.min(JUDGEMENT_MAX, input.score.composite - deterministicPoints))

  const accuracy = accuracyFrom(input.score)
  const subScores = (['opening', 'curiosity', 'listening', 'signalReading', 'composure', 'close'] as const)
    .map((key) => ({
      key: key as string,
      label: subScoreLabel(key, interview),
      value: input.score[key === 'signalReading' ? 'signal_reading' : key],
    }))
    // THE SEVENTH SITS WITH THE OTHER SIX (§8.4).
    //
    // It has a standout card above the metrics because the corrections belong
    // somewhere a person will read them — but leaving it OUT of the breakdown
    // would say it is a footnote, and it is a scored dimension that moved the
    // composite. Absent on every dating rep and on every interview that never
    // probed, which is what the null is for.
    .concat(accuracy
      ? [{
        key: 'technicalAccuracy',
        label: subScoreLabel('technicalAccuracy', interview),
        value: accuracy.score as number | null,
      }]
      : [])
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
    tryNext: (firstFocus && instructions[firstFocus]) ?? INTERVIEW_TRY_NEXT,
    focus: input.score.focus ?? [],
    accuracy,
  }
}

/**
 * The seventh dimension, read back off the row (§8.5).
 *
 * Null unless BOTH the number and its working are there. A score with no
 * corrections behind it would render as an accusation with no evidence, which
 * is the one thing §3.4 says this feature must never do — so a half-written row
 * reads as no reading at all.
 */
function accuracyFrom(score: ScoreRow): ScorecardAccuracy | null {
  const value = score.technical_accuracy
  if (typeof value !== 'number') return null
  const raw = score.accuracy
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const stored = raw as Record<string, unknown>
  const count = (key: string): number =>
    typeof stored[key] === 'number' ? (stored[key] as number) : 0
  const notes = Array.isArray(stored.notes)
    ? stored.notes.flatMap((entry): ScorecardAccuracy['notes'] => {
      if (!entry || typeof entry !== 'object') return []
      const note = entry as Record<string, unknown>
      if (note.verdict !== 'WRONG' && note.verdict !== 'INCOMPLETE') return []
      if (typeof note.correction !== 'string' || !note.correction.trim()) return []
      return [{
        index: typeof note.index === 'number' ? note.index : 0,
        verdict: note.verdict,
        question: typeof note.question === 'string' ? note.question : '',
        quote: typeof note.quote === 'string' ? note.quote : '',
        correction: note.correction,
      }]
    })
    : []
  return {
    score: value,
    scored: count('scored'),
    asked: count('asked'),
    correct: count('correct'),
    incomplete: count('incomplete'),
    wrong: count('wrong'),
    notes,
    reading: typeof stored.reading === 'string' && stored.reading.trim() ? stored.reading : null,
  }
}
