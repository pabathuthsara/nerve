/**
 * WarmthEngine — the core mechanic.
 *
 * Pure and deterministic. No network, no model, no clock of its own: every
 * timestamp is passed in. That is what makes the whole mechanic unit-testable
 * with a scripted conversation, which matters because this is the part of the
 * product that decides whether a rep felt real.
 *
 * The engine owns exactly one number and the history of how it moved. It does
 * not know what a provider is, does not know what a prompt is, and never talks
 * to anything. The session wires it to the character by asking for a band
 * directive; the engine has no idea that happened.
 */

import {
  BAND_NAMES,
  bandDirective,
  bandFor,
  type DirectiveContext,
  type WarmthBand,
} from './bands'
import { effectiveCeiling, type WarmthLevelConfig } from './levels'
import { classifyOverreach, type OverreachVerdict, type SlowScore } from './slow'
import type { FastReason, FastScore } from './fast'

export type WarmthEventSource = 'start' | 'fast' | 'slow' | 'overreach'

export interface WarmthEvent {
  at: number
  turnIndex: number
  /** Applied delta, after gain/decay and after clamping to floor/ceiling. */
  delta: number
  /** Before gain/decay. Kept so the asymmetry is auditable in telemetry. */
  rawDelta: number
  /** Warmth lost to per-turn natural decay, included in `delta`. */
  naturalDecay: number
  source: WarmthEventSource
  reason: string
  warmthBefore: number
  warmthAfter: number
  band: WarmthBand
  intimacy: number | null
  userText: string
  detail: string[]
}

export interface AsyncScoreLatency {
  median: number
  p90: number
  skipped: number
}

export interface WarmthTelemetry {
  start: number
  end: number
  peak: number
  trough: number
  /** Ordered sequence of bands entered, consecutive duplicates collapsed. */
  bandsVisited: WarmthBand[]
  timeInBand: Record<WarmthBand, number>
  events: WarmthEvent[]
  asyncScoreLatencyMs: AsyncScoreLatency
  /** The jittered opening value actually rolled for this session. */
  rolledStart: number
  config: WarmthLevelConfig
}

export interface WarmthEngineOptions {
  level: WarmthLevelConfig
  /** Injected for tests. Defaults to Math.random. */
  rng?: () => number
}

export class WarmthEngine {
  private readonly config: WarmthLevelConfig
  private readonly startValue: number
  private current: number
  private peakValue: number
  private troughValue: number

  private readonly eventLog: WarmthEvent[] = []
  private readonly bandSequence: WarmthBand[] = []
  private readonly timeInBand: Record<WarmthBand, number>
  private readonly slowLatencies: number[] = []

  private bandEnteredAt = 0
  private lastAt = 0
  private skippedSlow = 0
  private turnIndex = 0

  constructor(options: WarmthEngineOptions) {
    this.config = options.level
    const rng = options.rng ?? Math.random

    // Rolled, not fixed (§05). The same opener must not always work, or the
    // user learns a script instead of a skill.
    const jitter = (rng() * 2 - 1) * this.config.startJitter
    this.startValue = this.clamp(this.config.start + jitter)

    this.current = this.startValue
    this.peakValue = this.startValue
    this.troughValue = this.startValue

    this.timeInBand = Object.fromEntries(
      BAND_NAMES.map((name) => [name, 0]),
    ) as Record<WarmthBand, number>
    this.bandSequence.push(bandFor(this.startValue))
  }

  get warmth(): number {
    return Math.round(this.current * 100) / 100
  }

  get band(): WarmthBand {
    return bandFor(this.current)
  }

  /** The line injected into the conversation. She never sees the number. */
  get directive(): string {
    return bandDirective(this.current)
  }

  /** As above, with per-turn constraints the session computes (§4e). */
  directiveWith(context: DirectiveContext): string {
    return bandDirective(this.current, context)
  }

  get events(): readonly WarmthEvent[] {
    return this.eventLog
  }

  private clamp(value: number): number {
    return Math.max(this.config.floor, Math.min(effectiveCeiling(this.config), value))
  }

  /**
   * The asymmetry, in one place. Rises are multiplied by gain, falls by decay.
   * With Alex's 0.4/2.0 a bad turn costs five good ones.
   *
   * Gains additionally suffer diminishing returns: the same turn that moves a
   * stranger from 10 to 14 moves a warm one from 80 to 81. Without this the
   * meter is linear and a run of decent turns walks straight to INVESTED, which
   * is not how anyone actually warms to a stranger. The cap on top stops one
   * exceptional turn doing the work of four.
   */
  private scale(raw: number): number {
    if (raw <= 0) return raw * this.config.decay
    const falloff = Math.max(0, (100 - this.current) / 100)
    return Math.min(raw * this.config.gain * falloff, this.config.maxGainPerTurn)
  }

  private accrueTime(at: number): void {
    const elapsed = Math.max(0, at - this.bandEnteredAt);
    (this.timeInBand[this.band] as number) += elapsed
    this.bandEnteredAt = at
    this.lastAt = Math.max(this.lastAt, at)
  }

  private apply(params: {
    at: number
    rawDelta: number
    source: WarmthEventSource
    reason: string
    userText: string
    intimacy: number | null
    detail: string[]
    /** Explicit index of the turn this event describes. */
    turnIndex: number
    /** Applied before the score. Zero for anything that is not a user turn. */
    naturalDecay?: number
  }): WarmthEvent {
    const bandBefore = this.band
    // Time is attributed to the band that was actually occupied while it
    // elapsed, so a band entered and left inside one turn scores near zero.
    this.accrueTime(params.at)

    const warmthBefore = this.warmth

    // Natural decay lands first, so the falloff on any gain is computed against
    // the already-decayed value rather than the start of the turn.
    const naturalDecay = params.naturalDecay ?? 0
    if (naturalDecay > 0) this.current = this.clamp(this.current - naturalDecay)

    const delta = this.scale(params.rawDelta)
    this.current = this.clamp(this.current + delta)

    this.peakValue = Math.max(this.peakValue, this.current)
    this.troughValue = Math.min(this.troughValue, this.current)

    const bandAfter = this.band
    if (bandAfter !== bandBefore) {
      this.bandSequence.push(bandAfter)
      this.bandEnteredAt = params.at
    }

    const event: WarmthEvent = {
      at: Math.round(params.at * 100) / 100,
      turnIndex: params.turnIndex,
      delta: Math.round((this.warmth - warmthBefore) * 100) / 100,
      rawDelta: params.rawDelta,
      naturalDecay,
      source: params.source,
      reason: params.reason,
      warmthBefore,
      warmthAfter: this.warmth,
      band: bandAfter,
      intimacy: params.intimacy,
      userText: params.userText,
      detail: params.detail,
    }
    this.eventLog.push(event)
    return event
  }

  /**
   * Call once per finalised user turn, immediately.
   *
   * Returns the event *and* the index assigned to this turn. The caller must
   * hold that index and hand it back with any slow score for the same turn —
   * see applySlow.
   */
  applyFast(score: FastScore, at: number, userText: string): WarmthEvent {
    this.turnIndex += 1
    // Natural decay applies whether or not the turn scored anything, so an
    // event is always produced. A turn that moves nothing still costs ground.
    return this.apply({
      at,
      turnIndex: this.turnIndex,
      naturalDecay: this.config.naturalDecayPerTurn,
      rawDelta: score.raw,
      source: 'fast',
      reason: score.reasons.length ? dominantReason(score.reasons) : 'no signal',
      userText,
      intimacy: null,
      detail: score.reasons.map((r) => `${r.code} ${signed(r.points)} (${r.detail})`),
    })
  }

  /** The index assigned to the most recent user turn. */
  get currentTurnIndex(): number {
    return this.turnIndex
  }

  /**
   * Call when a slow score lands, with the warmth that had been *earned at the
   * time the scored turn was spoken* — not current warmth. Judging a turn
   * against a meter it could not have known about would make the rule arbitrary.
   */
  applySlow(
    score: SlowScore,
    warmthAtTurn: number,
    at: number,
    userText: string,
    latencyMs: number,
    /**
     * The index of the turn that was SCORED, not the turn in progress.
     *
     * Round 6 stamped whatever turn happened to be current when the model
     * answered, so turnIndex 4 appeared twice carrying two different lines
     * ("Just." and "What are you doing here?"). Anything joining warmth events
     * to transcript turns — the scorecard included — silently mis-attributes.
     */
    turnIndex: number,
  ): WarmthEvent {
    this.slowLatencies.push(latencyMs)
    const overreach = classifyOverreach(score.intimacy, warmthAtTurn)

    // An overreach verdict replaces the model's own delta rather than stacking
    // with it. The model judged the turn in isolation; the gap is the better
    // signal, and double-charging would make one clumsy question fatal.
    if (overreach.delta !== null) {
      return this.apply({
        at,
        turnIndex,
        rawDelta: overreach.delta,
        source: 'overreach',
        reason: overreach.verdict satisfies OverreachVerdict,
        userText,
        intimacy: score.intimacy,
        detail: [
          `intimacy ${score.intimacy} vs earned warmth ${Math.round(warmthAtTurn)}`,
          `overreach +${Math.round(overreach.overreach)}`,
          score.quote ? `quoted: "${score.quote}"` : '',
          score.reason,
        ].filter(Boolean),
      })
    }

    return this.apply({
      at,
      turnIndex,
      rawDelta: score.intent,
      source: 'slow',
      reason: 'model judgement',
      userText,
      intimacy: score.intimacy,
      detail: [score.quote ? `quoted: "${score.quote}"` : '', score.reason].filter(Boolean),
    })
  }

  /** A slow score that never came back in time. Recorded, never applied. */
  recordSkippedSlow(): void {
    this.skippedSlow += 1
  }

  telemetry(sessionSeconds: number): WarmthTelemetry {
    // Close out the band she is sitting in when the rep ends.
    this.accrueTime(Math.max(sessionSeconds, this.lastAt))

    return {
      start: round(this.startValue),
      end: this.warmth,
      peak: round(this.peakValue),
      trough: round(this.troughValue),
      bandsVisited: [...this.bandSequence],
      timeInBand: Object.fromEntries(
        Object.entries(this.timeInBand).map(([band, seconds]) => [band, round(seconds)]),
      ) as Record<WarmthBand, number>,
      events: [...this.eventLog],
      asyncScoreLatencyMs: {
        median: percentile(this.slowLatencies, 50),
        p90: percentile(this.slowLatencies, 90),
        skipped: this.skippedSlow,
      },
      rolledStart: round(this.startValue),
      config: this.config,
    }
  }
}

function dominantReason(reasons: readonly FastReason[]): string {
  if (reasons.length === 0) return 'no signal'
  const strongest = [...reasons].sort(
    (a, b) => Math.abs(b.points) - Math.abs(a.points),
  )[0]
  return strongest ? strongest.code : 'no signal'
}

function signed(points: number): string {
  return points > 0 ? `+${points}` : String(points)
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  if (sorted.length === 1) return Math.round(sorted[0] ?? 0)
  const rank = (p / 100) * (sorted.length - 1)
  const lower = Math.floor(rank)
  const upper = Math.ceil(rank)
  const low = sorted[lower]
  const high = sorted[upper]
  if (low === undefined || high === undefined) return 0
  if (lower === upper) return Math.round(low)
  return Math.round(low + (high - low) * (rank - lower))
}
