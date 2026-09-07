/**
 * Interview progress: readiness across one preparation run.
 *
 * ── WHY THIS IS NOT A LADDER ─────────────────────────────────────────────
 *
 * The dating track's progression is a ladder because that is the shape of the
 * dating product: you earn Robin. The interview track is bought by somebody who
 * interviews on Thursday, and a pack of five mostly spent on tutorial is a
 * refund request (§5.10). So difficulty is CHOSEN, and what replaces the ladder
 * is not a rank — it is **whether you are getting better at this interview**.
 *
 * The unit is the role you are preparing for. You have an `interview_setups`
 * row, you do four interviews against it, and what you want to see is the
 * trend. Per-round best composite, the six dimensions across the run, and a
 * plain reading of which one moved. A trend with an end date, because a job
 * hunt has one.
 *
 * ── WHAT IT MUST NOT TOUCH ───────────────────────────────────────────────
 *
 * `profiles.current_level`, `profiles.rank`, `unlockedLevels`, `earnedLevels`,
 * the field tier, and the personal-best composite that fires `BestBeat` are all
 * DATING numbers the constraint protects (§5.12, §8). Nothing here writes any
 * of them, and nothing here is derived from a dating rep: `reps` is filtered by
 * track before it arrives.
 *
 * **The one deliberate crossover is the streak**, and it lives in
 * `recordTrainingDay` rather than here. An interview counts as a training day;
 * §14 is explicit that running out of one thing must never break the habit
 * counter, and refusing to count a twenty-minute interview while counting a
 * three-minute rep would be indefensible.
 *
 * Pure functions with tests, the `rep-rules.ts` pattern.
 */

import { roundType, type RoundTypeId } from './interview-credits'

/** The six an interview is graded on. See `lib/grade/interview/rubric.ts`. */
export type InterviewDimension =
  | 'structure'
  | 'specificity'
  | 'listening'
  | 'composure'
  | 'signalReading'
  | 'close'

export const INTERVIEW_DIMENSIONS: readonly InterviewDimension[] = [
  'structure',
  'specificity',
  'listening',
  'composure',
  'signalReading',
  'close',
]

/**
 * How the six map onto the columns `scores` already has.
 *
 * **No migration, deliberately.** Three of the six carry over as skills under a
 * different name and three do not, but all six are one number out of a hundred
 * in a fixed slot — so a second set of columns would buy nothing except a
 * second place for the composite to be computed from. The mapping is stated
 * once, here, and `interview-progress.test.ts` walks it.
 */
export const DIMENSION_COLUMN: Record<InterviewDimension, string> = {
  structure: 'opening',
  specificity: 'curiosity',
  listening: 'listening',
  composure: 'composure',
  signalReading: 'signal_reading',
  close: 'close',
}

/** One graded interview in the run. */
export interface InterviewRep {
  sessionId: string
  /** ISO. Newest first is not assumed; this sorts. */
  startedAt: string
  round: RoundTypeId
  composite: number | null
  dimensions: Partial<Record<InterviewDimension, number>>
}

export interface DimensionTrend {
  dimension: InterviewDimension
  first: number | null
  latest: number | null
  best: number | null
  /** Latest minus first. Null until there are two graded reps to compare. */
  delta: number | null
}

export interface RoundBest {
  round: RoundTypeId
  label: string
  attempts: number
  best: number | null
  latest: number | null
}

export interface InterviewProgress {
  /** Graded interviews in this run. */
  attempts: number
  /** Best composite anywhere in the run. */
  best: number | null
  latest: number | null
  rounds: RoundBest[]
  dimensions: DimensionTrend[]
  /**
   * The one that moved most, and the one that moved least.
   *
   * Both, and always both — a screen that only names the weakest is a screen
   * that only ever says something discouraging, and §07's whole position is
   * that process is what is being measured. Null until there are two graded
   * reps, because a single score is a baseline and calling it a trend is a lie
   * about what the number means.
   */
  moved: DimensionTrend | null
  lagging: DimensionTrend | null
  /** Enough graded reps for the trend to mean anything. */
  readable: boolean
}

/** Two, because one number is a baseline and not a direction. */
export const TREND_MINIMUM = 2

export function interviewProgress(reps: readonly InterviewRep[]): InterviewProgress {
  const graded = reps
    .filter((rep) => rep.composite !== null)
    .slice()
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))

  const composites = graded.map((rep) => rep.composite!).filter((value) => Number.isFinite(value))
  const best = composites.length ? Math.max(...composites) : null
  const latest = composites.length ? composites[composites.length - 1]! : null

  const rounds: RoundBest[] = []
  for (const rep of graded) {
    const spec = roundType(rep.round)
    let entry = rounds.find((row) => row.round === spec.id)
    if (!entry) {
      entry = { round: spec.id, label: spec.label, attempts: 0, best: null, latest: null }
      rounds.push(entry)
    }
    entry.attempts += 1
    entry.latest = rep.composite
    entry.best = entry.best === null ? rep.composite : Math.max(entry.best, rep.composite!)
  }

  const dimensions = INTERVIEW_DIMENSIONS.map((dimension): DimensionTrend => {
    const scores = graded
      .map((rep) => rep.dimensions[dimension])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    if (scores.length === 0) {
      return { dimension, first: null, latest: null, best: null, delta: null }
    }
    const first = scores[0]!
    const last = scores[scores.length - 1]!
    return {
      dimension,
      first,
      latest: last,
      best: Math.max(...scores),
      delta: scores.length >= TREND_MINIMUM ? Math.round((last - first) * 10) / 10 : null,
    }
  })

  const withDelta = dimensions.filter((trend): trend is DimensionTrend & { delta: number } => trend.delta !== null)
  const readable = graded.length >= TREND_MINIMUM && withDelta.length > 0

  return {
    attempts: graded.length,
    best,
    latest,
    rounds,
    dimensions,
    moved: readable ? withDelta.reduce((top, trend) => (trend.delta > top.delta ? trend : top)) : null,
    lagging: readable ? withDelta.reduce((low, trend) => (trend.delta < low.delta ? trend : low)) : null,
    readable,
  }
}

/** The reading, in words, for the one line the progress panel shows. */
export const DIMENSION_LABEL: Record<InterviewDimension, string> = {
  structure: 'Structure',
  specificity: 'Specifics',
  listening: 'Listening',
  composure: 'Composure',
  signalReading: 'Reading them',
  close: 'What you asked back',
}

/**
 * One sentence about the run.
 *
 * §07 is why this never mentions a callback: the outcome is worth zero, and a
 * trend line that read "two callbacks out of four" would be scoring the result.
 * It says what moved and what did not, and stops.
 */
export function progressReading(progress: InterviewProgress): string | null {
  if (!progress.readable || !progress.moved || !progress.lagging) return null
  const moved = DIMENSION_LABEL[progress.moved.dimension]
  const lagging = DIMENSION_LABEL[progress.lagging.dimension]
  if (progress.moved.delta !== null && progress.moved.delta <= 0) {
    return `Nothing has moved yet across ${progress.attempts} interviews. ${lagging.toLowerCase()} is where the ground is.`
  }
  if (progress.moved.dimension === progress.lagging.dimension) {
    return `${moved} is the only thing with a trend in it so far.`
  }
  return `${moved} is up across this run. ${lagging} has not moved.`
}
