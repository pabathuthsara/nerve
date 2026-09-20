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
  /**
   * The seventh dimension, and it is deliberately NOT one of the six above.
   *
   * ── WHY IT IS KEPT SEPARATE ──────────────────────────────────────────────
   *
   * Three reasons, and all three are about not lying with a chart. It is not
   * one of the six the judge returns — `INTERVIEW_SUBSCORE_KEY` maps those onto
   * dating columns and `technical_accuracy` is a column of its own, so adding a
   * seventh entry to `DIMENSION_COLUMN` would break the mapping the rubric test
   * walks. It is **absent from most rounds**: only `technical` and
   * `deep_technical` probe (`probeShare > 0`), so a screener, a recruiter
   * screen and a final round all produce nothing, and a seventh row that is
   * blank four times in five reads as a defect rather than as an absence. And
   * the grader **abstains by default** (§3.4) — a false "you were wrong" costs
   * the account and an abstention costs nothing — so even a technical round may
   * legitimately return no reading.
   *
   * It is also a different kind of claim. The six are about how somebody
   * ANSWERED; this is about whether what they said was true. Averaging it into
   * "what moved most across this run" would put those two on one scale.
   */
  technicalAccuracy?: number | null
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

/**
 * Technical accuracy across the run (§8.5, `LAUNCH-GAP.md` D15).
 *
 * `attempts` counts rounds that produced a READING, not rounds that were run —
 * which is the number that makes the panel honest: "two of your five rounds
 * tested fundamentals" is the sentence somebody needs before they read a trend
 * off two points.
 */
export interface AccuracyTrend {
  /** Graded rounds that actually returned a technical accuracy score. */
  attempts: number
  first: number | null
  latest: number | null
  best: number | null
  /** Latest minus first. Null until there are two readings to compare. */
  delta: number | null
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
  /**
   * What you actually knew, as opposed to how you said it.
   *
   * Null when no round in the run has produced a reading — which is the common
   * case and is not a failure: the free screener, the recruiter screen and the
   * final round do not test fundamentals at all. The panel says so rather than
   * drawing an empty axis.
   */
  accuracy: AccuracyTrend | null
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

  /**
   * Read off the reps that HAVE one, in the order they happened.
   *
   * No zero-filling and no carrying the last value forward: a round that did
   * not probe did not score zero on fundamentals, it did not ask about them.
   * Filling the gap either way would invent a data point, and this is the one
   * number on the screen that is a claim about what somebody knows.
   */
  const readings = graded
    .map((rep) => rep.technicalAccuracy)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  const accuracy: AccuracyTrend | null = readings.length === 0
    ? null
    : {
      attempts: readings.length,
      first: readings[0]!,
      latest: readings[readings.length - 1]!,
      best: Math.max(...readings),
      delta: readings.length >= TREND_MINIMUM
        ? Math.round((readings[readings.length - 1]! - readings[0]!) * 10) / 10
        : null,
    }

  return {
    attempts: graded.length,
    best,
    latest,
    rounds,
    dimensions,
    accuracy,
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
 * One sentence about what you actually knew.
 *
 * ── WHY THIS READS DIFFERENTLY FROM `progressReading` ────────────────────
 *
 * That one is about process and never mentions the outcome, because §07 says
 * the outcome is worth zero. This one is about **a fact**: whether the things
 * said in the room were true. §07 does not apply to it — D15 is the decision
 * that technical accuracy is a seventh scored dimension and a deliberate
 * change to what this product is — and the honesty this one owes is different:
 * it has to say how many rounds it is speaking from, because a single reading
 * from a single technical round is not a level and calling it one would be the
 * same lie `TREND_MINIMUM` exists to prevent on the other six.
 */
export function accuracyReading(accuracy: AccuracyTrend | null): string | null {
  if (!accuracy || accuracy.latest === null) return null
  const rounds = `${accuracy.attempts} round${accuracy.attempts === 1 ? '' : 's'}`
  if (accuracy.delta === null) return `One reading so far, from ${rounds} that tested fundamentals.`
  if (accuracy.delta > 0) return `Up ${accuracy.delta} across ${rounds} that tested fundamentals.`
  if (accuracy.delta < 0) return `Down ${Math.abs(accuracy.delta)} across ${rounds} that tested fundamentals.`
  return `Flat across ${rounds} that tested fundamentals.`
}

/**
 * Why there is no reading yet, in the words of the thing that would produce one.
 *
 * An empty state that just says "no data" on a screen about technical accuracy
 * reads as a broken feature. The truth is more useful and it is a fact about the
 * product: a screener, a recruiter screen and a final round do not test
 * fundamentals at all (`probeShare: 0`), so no number is the correct number
 * until somebody runs a technical round.
 */
export const ACCURACY_EMPTY =
  'Nothing to read yet. Only a technical or deep technical round tests fundamentals — a screener, a recruiter screen and a final round are about how you answer, not about whether the answer was right.'

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
