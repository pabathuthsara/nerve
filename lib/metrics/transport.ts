import { percentile } from './latency'

export interface RttSample {
  atSeconds: number
  rttMs: number
}

export interface RttDrift {
  count: number
  firstThirdMedianMs: number | null
  middleThirdMedianMs: number | null
  lastThirdMedianMs: number | null
  changeMs: number | null
  changePercent: number | null
  slopeMsPerMinute: number | null
  verdict: 'stable' | 'plateaued' | 'rising' | 'insufficient'
}

/** Distinguishes a one-time connection warm-up from RTT that keeps climbing. */
export function analyseRttDrift(samples: readonly RttSample[]): RttDrift {
  const ordered = [...samples].sort((a, b) => a.atSeconds - b.atSeconds)
  if (ordered.length < 9) return empty('insufficient', ordered.length)

  const third = Math.floor(ordered.length / 3)
  const first = percentile(ordered.slice(0, third).map((sample) => sample.rttMs), 50)
  const middle = percentile(ordered.slice(third, third * 2).map((sample) => sample.rttMs), 50)
  const last = percentile(ordered.slice(third * 2).map((sample) => sample.rttMs), 50)
  if (first === null || middle === null || last === null) return empty('insufficient', ordered.length)

  const changeMs = last - first
  const changePercent = first > 0 ? (changeMs / first) * 100 : null
  const slopeMsPerMinute = regressionSlope(ordered) * 60
  const materiallyUp = changeMs >= 50 && (changePercent ?? 0) >= 25
  const stillClimbing = last - middle >= 25 && slopeMsPerMinute > 0
  const warmedThenFlat = middle - first >= 50 && Math.abs(last - middle) < 25

  return {
    count: ordered.length,
    firstThirdMedianMs: first,
    middleThirdMedianMs: middle,
    lastThirdMedianMs: last,
    changeMs,
    changePercent,
    slopeMsPerMinute,
    verdict: materiallyUp && stillClimbing ? 'rising' : warmedThenFlat ? 'plateaued' : 'stable',
  }
}

function regressionSlope(samples: readonly RttSample[]): number {
  const meanX = samples.reduce((sum, sample) => sum + sample.atSeconds, 0) / samples.length
  const meanY = samples.reduce((sum, sample) => sum + sample.rttMs, 0) / samples.length
  let numerator = 0
  let denominator = 0
  for (const sample of samples) {
    const dx = sample.atSeconds - meanX
    numerator += dx * (sample.rttMs - meanY)
    denominator += dx * dx
  }
  return denominator > 0 ? numerator / denominator : 0
}

function empty(verdict: RttDrift['verdict'], count: number): RttDrift {
  return {
    count,
    firstThirdMedianMs: null,
    middleThirdMedianMs: null,
    lastThirdMedianMs: null,
    changeMs: null,
    changePercent: null,
    slopeMsPerMinute: null,
    verdict,
  }
}
