/**
 * Predicted against actual — the chart §09 says does the therapeutic work.
 *
 * "Plotting predicted against actual over time produces the one chart that
 * does the therapeutic work: actual is almost always lower than predicted, and
 * watching your own data prove it is more persuasive than any amount of
 * encouragement."
 *
 * The arithmetic lives here, away from the SVG, because it carries the only
 * claim in the product that is close to a therapeutic one. It has to be
 * checkable by hand, and it has to be honest in the cases that would flatter
 * us: a user whose fear was accurate, or worse than they expected, must see
 * that. A chart that only ever curves the right way is a chart nobody should
 * believe, and §16 does not let us make clinical claims to paper over it.
 */

export interface AnxietyPoint {
  /** 0–10, taken before they went. */
  predicted: number
  /** 0–10, taken after. */
  actual: number
  /** The day it was logged, `YYYY-MM-DD`. Oldest first in a series. */
  on: string
}

export interface AnxietySeries {
  points: AnxietyPoint[]
  /** Mean predicted across every point. Null with nothing to average. */
  meanPredicted: number | null
  meanActual: number | null
  /**
   * Predicted minus actual. Positive means it was easier than they feared,
   * which is the finding — but it is computed, never assumed.
   */
  meanGap: number | null
  /** How many of the asks came back easier than predicted. */
  easierThanFeared: number
}

/**
 * Below this the chart is axes and a sentence, not a line (§15).
 *
 * Two points make a line and a line through two points is a trend nobody has
 * earned. Three is the first number where the shape means anything.
 */
export const POINTS_FOR_A_LINE = 3

interface LoggedAsk {
  anxietyPre: number | null
  anxietyPost: number | null
  loggedOn: string
}

/**
 * The series, oldest first.
 *
 * Only asks carrying both numbers appear. An ask logged honestly as not made
 * has a prediction and no actual, and plotting it against zero would read as
 * "it turned out to be nothing" — the opposite of what happened.
 *
 * Ordered here rather than trusted from the caller. The read sorts on
 * `logged_at`, which ties for rows written in the same instant — a backfill,
 * or two asks logged together — and an undefined order there draws a chart
 * that reads backwards. The day is the axis, so the day is what sorts it.
 *
 * @param log newest first, as `fetchFieldLog` returns it
 */
export function anxietySeries(log: readonly LoggedAsk[]): AnxietySeries {
  const points: AnxietyPoint[] = []
  for (const entry of log) {
    if (entry.anxietyPre === null || entry.anxietyPost === null) continue
    points.push({ predicted: entry.anxietyPre, actual: entry.anxietyPost, on: entry.loggedOn })
  }
  // Reverse first, then sort: `sort` is stable, so two asks on the same day
  // keep the order they were logged in rather than the order they were read in.
  points.reverse()
  points.sort((a, b) => a.on.localeCompare(b.on))

  if (points.length === 0) {
    return { points, meanPredicted: null, meanActual: null, meanGap: null, easierThanFeared: 0 }
  }

  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
  const meanPredicted = mean(points.map((point) => point.predicted))
  const meanActual = mean(points.map((point) => point.actual))

  return {
    points,
    meanPredicted: round(meanPredicted),
    meanActual: round(meanActual),
    meanGap: round(meanPredicted - meanActual),
    easierThanFeared: points.filter((point) => point.actual < point.predicted).length,
  }
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * The line under the chart, in the user's own numbers.
 *
 * Hand-written per case rather than assembled from a template, and it says
 * nothing the data does not support — including when the data says their fear
 * was about right, or that it was worse. §16: confidence training, never
 * treatment, and never a claim the chart above it does not show.
 */
export function anxietyVerdict(series: AnxietySeries): string | null {
  const { meanPredicted, meanActual, meanGap, points } = series
  if (meanPredicted === null || meanActual === null || meanGap === null) return null
  if (points.length < POINTS_FOR_A_LINE) return null

  if (meanGap >= 2) {
    return `You expect ${meanPredicted}. It lands at ${meanActual}. You have been wrong ${series.easierThanFeared} times out of ${points.length}, always in the same direction.`
  }
  if (meanGap > 0) {
    return `You expect ${meanPredicted}. It lands at ${meanActual}. Not a wide gap yet — keep logging and see whether it opens.`
  }
  if (meanGap === 0) {
    return `You expect ${meanPredicted}, and that is about what it costs. Your read on this is accurate.`
  }
  return `You expect ${meanPredicted}. It lands at ${meanActual}. These have been harder than you thought — worth easing back a tier rather than pushing through.`
}
