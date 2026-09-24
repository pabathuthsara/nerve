/**
 * Three grades of one rep, read as one (PERSONA-REALISM-REPORT S6).
 *
 * The S1 invariance run of 24 September graded byte-identical transcripts
 * twice with the same model at temperature zero and one dimension moved
 * fourteen points. A single sample is a noisy instrument, and a scorecard is
 * the thing this product asks a user to trust. The median of three is the
 * report's cheaper option — one call with `n: 3`, the input billed once — and
 * the median, unlike a mean, cannot be dragged by the one sample that read the
 * rep strangely.
 *
 * The WORDS come from one real sample — the one whose scores sit closest to the
 * median — because evidence quoted by one reading and a number from another
 * would be a scorecard nobody wrote. Pure.
 */

import { SUB_SCORE_KEYS, type SubScores } from './types'

export interface ScoredSample {
  scores: SubScores
  /** The normalised model output the scores came from. */
  parsed: Record<string, unknown>
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : Math.round((sorted[middle - 1]! + sorted[middle]!) / 2)
}

/** The per-dimension median and the sample whose words go with it. */
export function medianSample(samples: readonly ScoredSample[]): ScoredSample | null {
  if (samples.length === 0) return null
  if (samples.length === 1) return samples[0]!
  const scores = Object.fromEntries(
    SUB_SCORE_KEYS.map((key) => [key, median(samples.map((sample) => sample.scores[key]))]),
  ) as unknown as SubScores
  const distance = (sample: ScoredSample) =>
    SUB_SCORE_KEYS.reduce((sum, key) => sum + Math.abs(sample.scores[key] - scores[key]), 0)
  const closest = [...samples].sort((a, b) => distance(a) - distance(b))[0]!
  return { scores, parsed: closest.parsed }
}
