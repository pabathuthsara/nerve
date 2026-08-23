/**
 * Wires the pure engine to a live conversation.
 *
 * Holds the turn bookkeeping the engine deliberately does not: who said what,
 * how many dead ends in a row, how long he took to answer, and which slow score
 * is currently in flight. The engine stays pure; this owns the mess.
 *
 * Still no provider knowledge. It hands out a directive string and the caller
 * decides how to deliver it.
 */

import type { Persona, TranscriptTurn } from '@/lib/voice/types'
import { WarmthEngine, type WarmthTelemetry } from './engine'
import type { Trajectory } from '@/lib/voice/types'
import { scoreFast, type FastScore } from './fast'
import type { SlowScorer, SlowScoreRequest } from './slow'
import { slowScoreTriggers, type SlowTriggerReason } from './triggers'
import { composeSteering } from './steering'

/** Recent agent turns considered when rationing her questions (§4e). */
const QUESTION_WINDOW = 5
/** At most this share of that window may end in a question. */
const MAX_QUESTION_SHARE = 0.4

export interface WarmthSessionOptions {
  /** The persona, or a getter for it. A getter is what the dev panel needs. */
  persona: Persona | (() => Persona)
  /**
   * Layer 1, or a getter for it. A getter lets the dev panel retune difficulty
   * mid-session and have the next turn feel it.
   */
  trajectory: Trajectory | (() => Trajectory)
  /** Null disables slow scoring entirely — the fast layer still runs. */
  scorer?: SlowScorer | null
  /** Seconds since the session connected. */
  nowSeconds: () => number
  /** Monotonic milliseconds, for async latency. */
  nowMs?: () => number
  rng?: () => number
}

/**
 * A user turn that has triggered scoring but cannot be sent yet, because the
 * scorer judges the PAIR and her reply has not arrived.
 */
interface AwaitingReply {
  turn: TranscriptTurn
  turnIndex: number
  warmthAtTurn: number
  trigger: SlowTriggerReason[]
  agentPrior: string | null
}

interface PendingSlow {
  controller: AbortController
  /** Warmth as it stood when the scored turn was spoken. */
  warmthAtTurn: number
  userText: string
  startedMs: number
  /** Index of the turn being scored, captured at fire time (§4f). */
  turnIndex: number
  /** Why this turn was selected for scoring. Recorded for the harness. */
  trigger: SlowTriggerReason[]
}

export class WarmthSession {
  readonly engine: WarmthEngine

  private readonly options: WarmthSessionOptions
  private readonly agentTurns: TranscriptTurn[] = []
  private consecutiveDeadEnds = 0
  private userTurnCount = 0
  private pending: PendingSlow | null = null
  private awaiting: AwaitingReply | null = null
  private disposed = false
  private steeringSent = 0

  constructor(options: WarmthSessionOptions) {
    this.options = options
    this.engine = new WarmthEngine({
      trajectory: options.trajectory,
      ...(options.rng ? { rng: options.rng } : {}),
    })
  }

  /**
   * The line to inject before her next response. She never sees a number.
   *
   * Counted, because "is the directive actually reaching her" is otherwise only
   * inferable from token deltas. If this does not match her turn count, the
   * steering is not landing and no amount of prompt wording will fix it.
   */
  directive(): string {
    this.steeringSent += 1
    // Composed from all four layers, and read LIVE — the persona reference is
    // whatever the tuning store currently holds, so a slider moved mid-rep
    // changes her very next reply (§3).
    return composeSteering({
      persona: this.persona,
      warmth: this.engine.warmth,
      suppressQuestion: this.questionQuotaSpent(),
    })
  }

  /** The persona as it stands right now, not as it stood at connect. */
  private get persona(): Persona {
    return typeof this.options.persona === 'function'
      ? this.options.persona()
      : this.options.persona
  }

  /**
   * "Questions in at most 40% of turns" (§4e) counted here rather than asked of
   * the model, which cannot count its own history. Looks at her recent turns
   * only, so one early run of questions does not gag her for the whole rep.
   */
  private questionQuotaSpent(): boolean {
    const recent = this.agentTurns.slice(-QUESTION_WINDOW)
    if (recent.length < QUESTION_WINDOW) return false
    const asked = recent.filter((turn) => turn.text.trim().endsWith('?')).length
    return asked / recent.length >= MAX_QUESTION_SHARE
  }

  get steeringItemsSent(): number {
    return this.steeringSent
  }

  onAgentTurn(turn: TranscriptTurn): void {
    this.agentTurns.push(turn)
    // Her reply completes the pair, which is the unit the scorer judges (§2b).
    const awaiting = this.awaiting
    if (awaiting) {
      this.awaiting = null
      this.fireSlow(awaiting, turn.text)
    }
  }

  /** Call on every finalised user turn. Synchronous and cheap by contract. */
  onUserTurn(turn: TranscriptTurn): FastScore {
    // She never answered the previous trigger; send it anyway rather than lose it.
    this.flushAwaiting()
    this.userTurnCount += 1

    const lastAgent = this.agentTurns[this.agentTurns.length - 1]
    const gapSeconds = lastAgent ? Math.max(0, turn.t_start - lastAgent.t_end) : null

    const score = scoreFast(turn, {
      level: this.persona.level,
      agentTurns: this.agentTurns,
      precedingDeadEnds: this.consecutiveDeadEnds,
      gapSeconds,
    })

    this.engine.applyFast(score, turn.t_end, turn.text)
    this.consecutiveDeadEnds = score.deadEnd ? this.consecutiveDeadEnds + 1 : 0

    // Evidence-driven, with a count-based floor underneath (§2a).
    const triggers = slowScoreTriggers({
      turnIndex: this.userTurnCount,
      fastRaw: score.raw,
      wordCount: score.wordCount,
      text: turn.text,
    })
    if (triggers.length > 0) {
      this.awaiting = {
        turn,
        turnIndex: this.engine.currentTurnIndex,
        warmthAtTurn: this.engine.warmth,
        trigger: triggers,
        agentPrior: lastAgent?.text ?? null,
      }
    }

    return score
  }

  /**
   * Fired and forgotten.
   *
   * The warmth snapshot was taken when he spoke, so the turn is judged against
   * what he had earned at that moment rather than against whatever the meter
   * reads by the time the model answers.
   */
  private fireSlow(awaiting: AwaitingReply, agentReply: string | null): void {
    const scorer = this.options.scorer
    if (!scorer || this.disposed) return

    // A previous score that has not landed by the time the next one is due is
    // already too stale to apply. Drop it rather than queue it.
    if (this.pending) {
      this.pending.controller.abort()
      this.engine.recordSkippedSlow()
      this.pending = null
    }

    const controller = new AbortController()
    const nowMs = this.options.nowMs ?? (() => Date.now())
    const pending: PendingSlow = {
      controller,
      warmthAtTurn: awaiting.warmthAtTurn,
      userText: awaiting.turn.text,
      startedMs: nowMs(),
      turnIndex: awaiting.turnIndex,
      trigger: awaiting.trigger,
    }
    this.pending = pending

    const request: SlowScoreRequest = {
      userText: awaiting.turn.text,
      agentReply,
      agentPrior: awaiting.agentPrior,
      warmth: awaiting.warmthAtTurn,
      band: this.engine.band,
      personaName: this.persona.name,
    }

    void scorer.score(request, controller.signal).then((score) => {
      if (this.pending !== pending || this.disposed) return
      this.pending = null
      if (!score) {
        this.engine.recordSkippedSlow()
        return
      }
      this.engine.applySlow(
        score,
        pending.warmthAtTurn,
        this.options.nowSeconds(),
        pending.userText,
        Math.round(nowMs() - pending.startedMs),
        pending.turnIndex,
      )
    })
  }

  /**
   * Flush a turn that triggered scoring but never got a reply — she was
   * interrupted, or the rep ended. Losing it silently would mean the loudest
   * turns are exactly the ones that go unscored, which is the round-6 failure
   * this whole trigger rework exists to fix.
   */
  private flushAwaiting(): void {
    const awaiting = this.awaiting
    if (!awaiting) return
    this.awaiting = null
    this.fireSlow(awaiting, null)
  }

  telemetry(sessionSeconds: number): WarmthTelemetry & { steeringItemsSent: number } {
    return { ...this.engine.telemetry(sessionSeconds), steeringItemsSent: this.steeringSent }
  }

  dispose(): void {
    this.awaiting = null
    this.disposed = true
    this.pending?.controller.abort()
    this.pending = null
  }
}
