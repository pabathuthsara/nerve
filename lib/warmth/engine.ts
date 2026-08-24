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
import { effectiveCeiling } from './levels'
import { WARMTH_MIN, WARMTH_MAX } from './bands'
import type { Personality, Trajectory } from '@/lib/voice/types'
import { classifyOverreach, type OverreachVerdict, type SlowScore } from './slow'
import type { FastReason, FastScore } from './fast'
import { openingAffect, postureOf, type AffectState, type Posture } from './affect'
import { temperamentOf, type Temperament } from './temperament'

export type WarmthEventSource = 'start' | 'fast' | 'slow' | 'overreach' | 'repair'

/**
 * How each fast reason moves comfort and liking, relative to how it moves
 * interest. Applied to the SIGNED points, so a negative reason pulls all three
 * down in proportion.
 *
 * The shape of this table is the whole argument for three axes:
 *
 *  - A callback is the strongest liking signal there is (1.0) and says almost
 *    nothing about ease (0.3). Being picked up on is how you decide you like
 *    somebody.
 *  - An open question raises liking and barely touches comfort — being
 *    questioned is interesting, not relaxing.
 *  - A dead-end streak is mostly an EASE failure (0.6). Two people with nothing
 *    to say to each other is uncomfortable long before either stops being
 *    interested.
 *  - Hesitation reads as awkwardness (0.4) rather than dislike (0.1).
 */
const COMFORT_WEIGHT: Record<FastReason['code'], number> = {
  'open-question': 0.1,
  'engaged-length': 0.4,
  callback: 0.3,
  'dead-end': 0.3,
  'dead-end-streak': 0.6,
  'filler-rate': 0.2,
  hesitation: 0.4,
}

const LIKING_WEIGHT: Record<FastReason['code'], number> = {
  'open-question': 0.5,
  'engaged-length': 0.3,
  callback: 1.0,
  'dead-end': 0.5,
  'dead-end-streak': 0.4,
  'filler-rate': 0.1,
  hesitation: 0.1,
}

/** Overreach is an EASE event first and an interest event second. */
const OVERREACH_COMFORT = 1.4
const OVERREACH_LIKING = 0.8

/** A model judgement carries more about him than about the topic. */
const SLOW_COMFORT = 0.4
const SLOW_LIKING = 0.7

/**
 * How long he has to put a misstep right.
 *
 * Two turns. One is not a conversation, and past two it stops being a recovery
 * and becomes the next subject.
 */
export const REPAIR_WINDOW_TURNS = 2
/** A fall this size or worse opens the window. Ordinary cooling does not. */
export const REPAIR_TRIGGER = -1.5
/** What a turn inside the window is worth, against the same turn outside it. */
export const REPAIR_BONUS = 1.6

/**
 * A slow judgement this warm is a moment, not a turn.
 *
 * The model is asked for -10..+10 and reserves the top of that range for
 * something that actually landed. `maxGainPerTurn` is right for ordinary turns
 * and wrong for this one: capping the best moment in the rep guarantees nothing
 * ever feels like a change, and real liking is not a curve, it is an instant.
 */
export const BREAKTHROUGH_INTENT = 8
/** How far past the per-turn cap a breakthrough may reach. */
export const BREAKTHROUGH_MULTIPLE = 2
/** Twice a rep. A third would be a slot machine rather than a conversation. */
export const BREAKTHROUGHS_PER_SESSION = 2

/**
 * How far the FAST layer's authority falls across a rep.
 *
 * The fast scorer pays +3 for an open question, +2 for a turn of eight to
 * twenty-five words and +2 or +3 for reusing one of her content words. All
 * three are LEXICAL, which means they are farmable: a user works out "ask a
 * what/how question, say twelve words, echo one of her nouns" and the meter
 * pays for it forever. The start jitter randomises the opening, not the rule.
 *
 * So form is worth full price early, when a stranger genuinely is judging you
 * on how you open, and worth less as the conversation goes on and what you are
 * actually saying starts to matter more than its shape. Late movement is
 * dominated by the slow scorer, which is judgement rather than pattern.
 *
 * GAINS ONLY. A dead end late in a rep is not cheaper than a dead end early —
 * if anything it is worse — and tapering penalties would make the last minute
 * of a bad rep free.
 *
 * Checked against the ladder in `engine.test.ts`: the rungs still separate at
 * 12, 15 and 18 turns, so this is an anti-farming measure and not a difficulty
 * change.
 */
export const FAST_AUTHORITY_FLOOR = 0.8
/** Turns over which the taper runs. Roughly one three-minute rep. */
export const FAST_AUTHORITY_SPAN = 15

export function fastAuthority(turnIndex: number): number {
  const through = Math.min(1, Math.max(0, (turnIndex - 1) / (FAST_AUTHORITY_SPAN - 1)))
  return 1 - (1 - FAST_AUTHORITY_FLOOR) * through
}

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
  /** Where comfort and liking finished. Interest is `warmthAfter`. */
  comfortAfter: number
  likingAfter: number
  /** How the three stood relative to each other after this turn. */
  posture: Posture
  /** This turn was worth more because it repaired a fall. */
  repaired: boolean
  /** This turn was allowed past the per-turn cap. */
  breakthrough: boolean
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
  /** Where comfort and liking finished, alongside `end` for interest. */
  comfortEnd: number
  likingEnd: number
  /** The posture she finished in. */
  posture: Posture
  /** Turns that recovered a fall, and moments allowed past the cap. */
  repairs: number
  breakthroughs: number
  /** The jittered opening value actually rolled for this session. */
  rolledStart: number
  /** The trajectory in force when the rep ended — which, with the dev panel
   *  open, is not necessarily the one it started with. */
  config: Trajectory
}

export interface WarmthEngineOptions {
  /**
   * Layer 1 of the persona, or a getter for it.
   *
   * A getter is what makes the dev panel work: sliding `gain` mid-session has
   * to affect the very next turn, so the engine reads the trajectory on every
   * calculation rather than copying it once at construction. Passing a plain
   * object is the same thing with a constant getter.
   */
  trajectory: Trajectory | (() => Trajectory)
  /**
   * LAYER 2, or a getter for it.
   *
   * Optional so every existing caller and fixture keeps working with a neutral
   * temperament — but a live rep always passes it, because without it all eight
   * characters are moved by identical arithmetic. See ./temperament.ts.
   */
  personality?: Personality | (() => Personality)
  /** Injected for tests. Defaults to Math.random. */
  rng?: () => number
}

export class WarmthEngine {
  private readonly readTrajectory: () => Trajectory
  private readonly readPersonality: (() => Personality) | null
  private readonly startValue: number
  private current: number
  private peakValue: number
  private troughValue: number
  /** The other two axes. See ./affect.ts for why there are three. */
  private comfortValue: number
  private likingValue: number

  private readonly eventLog: WarmthEvent[] = []
  private readonly bandSequence: WarmthBand[] = []
  private readonly timeInBand: Record<WarmthBand, number>
  private readonly slowLatencies: number[] = []

  private bandEnteredAt = 0
  private lastAt = 0
  private skippedSlow = 0
  private turnIndex = 0
  /** Turn index of the last real fall, for the repair window. */
  private lastFallTurn: number | null = null
  private repairCount = 0
  private breakthroughCount = 0

  constructor(options: WarmthEngineOptions) {
    const trajectory = options.trajectory
    this.readTrajectory =
      typeof trajectory === 'function' ? trajectory : () => trajectory
    const personality = options.personality
    this.readPersonality =
      personality === undefined
        ? null
        : typeof personality === 'function'
          ? personality
          : () => personality
    const rng = options.rng ?? Math.random

    // Rolled, not fixed (§05). The same opener must not always work, or the
    // user learns a script instead of a skill.
    const config = this.config
    const jitter = (rng() * 2 - 1) * config.startJitter
    this.startValue = this.clamp(config.start + jitter)

    this.current = this.startValue
    this.peakValue = this.startValue
    this.troughValue = this.startValue

    const opening = openingAffect(this.startValue)
    this.comfortValue = opening.comfort
    this.likingValue = opening.liking

    this.timeInBand = Object.fromEntries(
      BAND_NAMES.map((name) => [name, 0]),
    ) as Record<WarmthBand, number>
    this.bandSequence.push(bandFor(this.startValue))
  }

  /** Read live, never cached. See `WarmthEngineOptions.trajectory`. */
  private get config(): Trajectory {
    return this.readTrajectory()
  }

  /** Live too, for the same reason. Neutral when no personality was given. */
  private get temperament(): Temperament {
    return temperamentOf(this.readPersonality?.())
  }

  get warmth(): number {
    return Math.round(this.current * 100) / 100
  }

  get comfort(): number {
    return Math.round(this.comfortValue * 100) / 100
  }

  get liking(): number {
    return Math.round(this.likingValue * 100) / 100
  }

  get affect(): AffectState {
    return { warmth: this.warmth, comfort: this.comfort, liking: this.liking }
  }

  get posture(): Posture {
    return postureOf(this.affect)
  }

  /**
   * He misjudged it recently and this turn is his chance to put it right.
   *
   * Read by the steering composer so she can visibly let him — a repair the
   * other person does not register is not a repair, it is an apology into the
   * air.
   */
  get repairOpen(): boolean {
    if (this.lastFallTurn === null) return false
    return this.turnIndex - this.lastFallTurn < REPAIR_WINDOW_TURNS
  }

  /**
   * Read off the same rounded value the UI displays, not the raw float.
   *
   * The training-wheels readout shows a number and a band name side by side and
   * is teaching the user to associate them. Deriving the two from values that
   * differ in the third decimal is how you get "20 · CLOSED" on screen, which
   * reads as a bug to the person we are trying to teach.
   */
  get band(): WarmthBand {
    return bandFor(this.warmth)
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

  /**
   * The floor is global; the ceiling is the character's.
   *
   * `hardCeiling` below 100 is what makes a level unwinnable by design — Alex
   * sits at 45, which is inside OPEN and below ENGAGED, so no sequence of turns
   * reaches the warm bands. That is the point of level 8 (§06).
   */
  private clamp(value: number): number {
    return Math.max(WARMTH_MIN, Math.min(effectiveCeiling(this.config), value))
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
  private scale(raw: number, options: { repair?: boolean; breakthrough?: boolean } = {}): number {
    const config = this.config
    if (raw <= 0) return raw * config.decay
    const falloff = Math.max(0, (100 - this.current) / 100)
    const gained = raw * config.gain * falloff * (options.repair ? REPAIR_BONUS : 1)

    // The cap, and the two things allowed past it.
    //
    // A repair is worth more than the same turn cold, because recovering from a
    // misstep is a harder and more human thing than never making one — but it
    // is still an ordinary turn and it stays near the ceiling. A breakthrough is
    // not an ordinary turn: it is the moment somebody decides they like you, and
    // flattening it to the same 2.6 as every other good sentence is what made
    // the meter feel like arithmetic instead of a person.
    const ceiling = options.breakthrough
      ? config.maxGainPerTurn * BREAKTHROUGH_MULTIPLE
      : options.repair
        ? config.maxGainPerTurn * 1.5
        : config.maxGainPerTurn
    return Math.min(gained, ceiling)
  }

  /**
   * Move comfort and liking by the same event that moved interest.
   *
   * Both are clamped to the full 0..100 range rather than to the trajectory's
   * ceiling: `sessionCeiling` is a statement about how interested she is
   * willing to become, not about whether she can be at ease. Alex is capped at
   * 45 interest for the whole rep and can still be perfectly comfortable, which
   * is exactly what a level-8 character should feel like — pleasant, relaxed,
   * and not going anywhere.
   */
  private moveSecondary(comfortRaw: number, likingRaw: number): void {
    const config = this.config
    const t = this.temperament

    const scaleAxis = (raw: number, current: number, weight: number): number => {
      if (raw === 0) return current
      const moved =
        raw <= 0
          ? raw * config.decay * weight
          : Math.min(
              raw * config.gain * Math.max(0, (100 - current) / 100) * weight,
              config.maxGainPerTurn,
            )
      return Math.max(WARMTH_MIN, Math.min(WARMTH_MAX, current + moved))
    }

    this.comfortValue = scaleAxis(comfortRaw, this.comfortValue, t.comfort)
    this.likingValue = scaleAxis(likingRaw, this.likingValue, t.liking)
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
    /** Raw movement for the other two axes, before gain/decay. */
    comfortRaw?: number
    likingRaw?: number
    /** This turn was allowed past the per-turn cap. */
    breakthrough?: boolean
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

    // A positive turn inside the repair window is worth more than the same turn
    // cold. Checked BEFORE the turn is applied, because applying it is what
    // closes the window.
    const repaired = params.rawDelta > 0 && this.repairOpen
    const breakthrough = Boolean(params.breakthrough)

    const delta = this.scale(params.rawDelta, { repair: repaired, breakthrough })
    this.current = this.clamp(this.current + delta)
    this.moveSecondary(params.comfortRaw ?? 0, params.likingRaw ?? 0)

    if (repaired) this.repairCount += 1
    if (breakthrough) this.breakthroughCount += 1

    // A real fall opens the window; anything else closes it. Ordinary per-turn
    // decay is not a misstep and must not arm a bonus.
    if (delta <= REPAIR_TRIGGER) this.lastFallTurn = params.turnIndex
    else if (repaired) this.lastFallTurn = null

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
      source: repaired ? 'repair' : params.source,
      reason: params.reason,
      warmthBefore,
      warmthAfter: this.warmth,
      band: bandAfter,
      intimacy: params.intimacy,
      userText: params.userText,
      detail: params.detail,
      comfortAfter: this.comfort,
      likingAfter: this.liking,
      posture: this.posture,
      repaired,
      breakthrough,
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

    // The same reasons, weighted differently per axis. See COMFORT_WEIGHT /
    // LIKING_WEIGHT above for why a callback is a liking event and a dead-end
    // streak is an ease event.
    let comfortRaw = 0
    let likingRaw = 0
    for (const reason of score.reasons) {
      comfortRaw += reason.points * (COMFORT_WEIGHT[reason.code] ?? 0)
      likingRaw += reason.points * (LIKING_WEIGHT[reason.code] ?? 0)
    }

    // Form is worth full price early and less as the rep goes on, so a user who
    // has worked out the lexical rules cannot farm them for three minutes. Only
    // gains taper — a late dead end is not cheaper than an early one.
    const authority = fastAuthority(this.turnIndex)
    const taper = (raw: number) => (raw > 0 ? raw * authority : raw)

    // Natural decay applies whether or not the turn scored anything, so an
    // event is always produced. A turn that moves nothing still costs ground.
    return this.apply({
      at,
      turnIndex: this.turnIndex,
      naturalDecay: this.config.decayPerTurn,
      rawDelta: taper(score.raw),
      comfortRaw: taper(comfortRaw),
      likingRaw: taper(likingRaw),
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
        // Overreach is an EASE failure before it is an interest failure. She is
        // not less curious about him, she is less comfortable with him, and
        // splitting those is what lets a rep recover from one clumsy line
        // without pretending it did not happen.
        comfortRaw: overreach.delta * OVERREACH_COMFORT,
        likingRaw: overreach.delta * OVERREACH_LIKING,
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

    // A judgement at the top of the model's range is a moment, not a turn —
    // and only while she has moments left to give. See BREAKTHROUGH_INTENT.
    const breakthrough =
      score.intent >= BREAKTHROUGH_INTENT &&
      this.breakthroughCount < BREAKTHROUGHS_PER_SESSION

    return this.apply({
      at,
      turnIndex,
      rawDelta: score.intent,
      comfortRaw: score.intent * SLOW_COMFORT,
      likingRaw: score.intent * SLOW_LIKING,
      breakthrough,
      source: 'slow',
      reason: breakthrough ? 'model judgement · landed' : 'model judgement',
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
      comfortEnd: this.comfort,
      likingEnd: this.liking,
      posture: this.posture,
      repairs: this.repairCount,
      breakthroughs: this.breakthroughCount,
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
