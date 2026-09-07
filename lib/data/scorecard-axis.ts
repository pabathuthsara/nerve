/**
 * The display axis for one metric row on the scorecard.
 *
 * Its own module because there are two tables now — `lib/data/scorecard.ts`
 * holds the dating one and `lib/data/interview-scorecard.ts` the interview one
 * — and a shared type that lived in one of them would make the other import a
 * table it never reads.
 */

import type { MetricBand } from './types'

export interface Axis {
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
