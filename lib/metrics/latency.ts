/**
 * Round-trip latency measurement (§04 — "Latency test, before anything else").
 *
 * The M0 gate is a median round trip under 900ms. That number needs a precise
 * definition or it cannot be passed or failed honestly, so:
 *
 *   responseMs   user stopped speaking (as VAD saw it) -> character's audio
 *                starts playing out. Network + inference. This is the number
 *                the gate is measured against, because it is the only part we
 *                can architect our way out of.
 *
 *   perceivedMs  responseMs + the configured silence window. What the dead air
 *                actually feels like at the user's ear, since VAD deliberately
 *                waits before conceding the turn. Always the larger number, and
 *                the one to sanity-check the illusion against.
 *
 *   rttMs        raw network round trip from WebRTC transport stats. Isolates
 *                the Colombo-to-region distance from inference time, which is
 *                what tells you whether a failure is fixable by changing region.
 *
 * Built entirely on domain events, so it measures any provider identically.
 */

export interface LatencySample {
  index: number
  /** Seconds into the session at which the user stopped speaking. */
  atSeconds: number
  responseMs: number
  perceivedMs: number
}

export interface LatencyStats {
  count: number
  medianMs: number | null
  p90Ms: number | null
  minMs: number | null
  maxMs: number | null
  medianPerceivedMs: number | null
}

/**
 * A response later than this is not a turn-around, it is a stall or a dropped
 * turn. Including it would corrupt the distribution the gate reads.
 */
const MAX_PLAUSIBLE_RESPONSE_MS = 15_000

export class LatencyMeter {
  private readonly silenceMs: number
  private readonly collected: LatencySample[] = []
  private pendingStopAt: number | null = null

  constructor(silenceMs: number) {
    this.silenceMs = silenceMs
  }

  /** `at` is seconds since connect, from the domain event. */
  userSpeechStop(at: number): void {
    this.pendingStopAt = at
  }

  /** Returns the sample if this start closed a pending turn, else null. */
  agentSpeechStart(at: number): LatencySample | null {
    const stopAt = this.pendingStopAt
    if (stopAt === null) return null
    this.pendingStopAt = null

    const responseMs = Math.round((at - stopAt) * 1000)
    if (responseMs < 0 || responseMs > MAX_PLAUSIBLE_RESPONSE_MS) return null

    const sample: LatencySample = {
      index: this.collected.length + 1,
      atSeconds: Math.round(stopAt * 100) / 100,
      responseMs,
      perceivedMs: responseMs + this.silenceMs,
    }
    this.collected.push(sample)
    return sample
  }

  /** The character started talking without the user having finished — barge-in. */
  discardPending(): void {
    this.pendingStopAt = null
  }

  get samples(): readonly LatencySample[] {
    return this.collected
  }

  stats(): LatencyStats {
    const response = this.collected.map((s) => s.responseMs)
    const perceived = this.collected.map((s) => s.perceivedMs)
    return {
      count: response.length,
      medianMs: percentile(response, 50),
      p90Ms: percentile(response, 90),
      minMs: response.length ? Math.min(...response) : null,
      maxMs: response.length ? Math.max(...response) : null,
      medianPerceivedMs: percentile(perceived, 50),
    }
  }
}

export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  if (sorted.length === 1) return sorted[0] ?? null

  const rank = (p / 100) * (sorted.length - 1)
  const lower = Math.floor(rank)
  const upper = Math.ceil(rank)
  const low = sorted[lower]
  const high = sorted[upper]
  if (low === undefined || high === undefined) return null
  if (lower === upper) return Math.round(low)
  return Math.round(low + (high - low) * (rank - lower))
}

/** The gate: median round trip under 900ms (§17). */
export const LATENCY_GATE_MS = 900

/** Past this the conversation stops feeling like a conversation (§04). */
export const LATENCY_DEGRADED_MS = 1500

export type LatencyVerdict = 'pass' | 'marginal' | 'fail' | 'insufficient'

export function latencyVerdict(stats: LatencyStats): LatencyVerdict {
  if (stats.medianMs === null || stats.count < 5) return 'insufficient'
  if (stats.medianMs < LATENCY_GATE_MS) return 'pass'
  if (stats.medianMs < LATENCY_DEGRADED_MS) return 'marginal'
  return 'fail'
}
