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
import { NEGATIVE_TURN_THRESHOLD, slowScoreTriggers, type SlowTriggerReason } from './triggers'
import { DEFAULT_REPLY_SHAPE, type ReplyShape, type TurnKind } from './timing'
import { isOpenQuestion } from './fast'
import { DISCLOSURE_WORDS, type UserTurnShape } from './reciprocity'
import type { SteeringContext } from './steering'
// B2's seam. One selector, reading `persona.track`, with dating as the default
// branch that reaches exactly the code it reached yesterday. Nothing in
// `bands.ts`, `reciprocity.ts` or `steering.ts` is opened to make this work.
import { judgementFor } from './track'
import type { InterviewTurnKind } from './interview/bands'

/**
 * Re-send an unchanged direction at least this often.
 *
 * The countermeasure against drift, kept as a floor under the change detector.
 * Four turns is roughly forty seconds — long enough that she is not being
 * drilled, short enough that she cannot wander away from the band unnoticed.
 */
export const STEER_HEARTBEAT_TURNS = 4

/** Recent agent turns considered when rationing her questions (§4e). */
const QUESTION_WINDOW = 5
/**
 * At most this share of that window may end in a question.
 *
 * The DATING number, and it is where it has always been. The interview arm
 * carries its own on `TrackJudgement.maxQuestionShare`, because an interviewer
 * asks a question on nearly every turn and this quota gags her on four turns in
 * five — see the note there.
 */
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
  /**
   * What her FIRST turn is, when it is not a reply (§6.7).
   *
   * **Absent on every dating rep, and absent on four of the five interview
   * rounds.** Set to `'brief'` only when a `system_design` round opens on an
   * authored design problem, which is the one turn in this product that is
   * longer than a band allows: the statement is forty to seventy words and
   * every interview band tops out at thirty-four.
   *
   * It is read on the FIRST agent turn and never again, so a round that has
   * already started behaves exactly as it does today. Undefined reaches
   * `mirrorCapFor` as a third argument it does not declare and therefore
   * ignores — the dating ceiling is byte-identical arithmetic.
   */
  openingTurnKind?: InterviewTurnKind
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
  /** The last line she was actually given, for change detection. */
  private lastDirective: string | null = null
  private turnsSinceSteer = 0
  /** The closing decision owns the next direction on its own. */
  private closingHandover = false
  /**
   * What kind of thing she is about to answer — the fifth layer's other input.
   *
   * Derived from the pre-filter that has already run on his turn, so it costs
   * nothing and is available the instant the turn finalises. See `TurnKind`.
   */
  private lastTurnKind: TurnKind = DEFAULT_REPLY_SHAPE.turnKind
  /**
   * What HE just did, in the four terms the reciprocity gates read.
   *
   * The warmth engine models how much she likes him. This is the other half —
   * how much he is giving — and until it existed the two came apart completely.
   * See `./reciprocity.ts`. Null until he has spoken.
   */
  private lastUserShape: UserTurnShape | null = null
  /** She said nothing last turn, so she may not do it twice running. */
  private silentLastTurn = false
  /**
   * Her turns since she last said nothing at all.
   *
   * Starts at infinity rather than zero: at the beginning of a rep she has
   * never done it, and reading that as "too soon" would suppress the first one
   * for the first four turns of every interview.
   */
  private turnsSinceSilence = Number.POSITIVE_INFINITY
  /** His last turn actually contained a question mark. See `askedDirectly`. */
  private lastUserAskedDirectly = false

  constructor(options: WarmthSessionOptions) {
    this.options = options
    this.engine = new WarmthEngine({
      trajectory: options.trajectory,
      // LAYER 2 reaches the meter through here and nowhere else. A getter, for
      // the same reason the trajectory is one: the dev panel can retune a
      // character mid-rep and the next turn has to feel it.
      personality: () => this.persona.personality,
      // Also a getter, for the same reason: a character switched in the dev
      // panel must not leave the engine reading the previous one's mode.
      postureMode: () => this.persona.postureMode ?? 'relative',
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
    const line = this.judgement.steer({
      persona: this.persona,
      warmth: this.engine.warmth,
      suppressQuestion: this.questionQuotaSpent(),
      ...this.openingBriefFlag,
      // The other two axes reach her as a posture, never as numbers — the same
      // rule warmth has always followed. Silent when the three agree.
      posture: this.engine.posture,
      repairOpen: this.engine.repairOpen,
      his: this.lastUserShape,
    })
    this.lastDirective = line
    this.turnsSinceSteer = 0
    return line
  }

  /**
   * The direction, or null when she has already been told this.
   *
   * THE DRILLING FIX. Steering used to be injected on every VAD speech start —
   * including bursts of noise and turns that were deleted milliseconds later as
   * echo — and the composed line is deterministic within a band. So a rep
   * accumulated fifteen near-identical copies of
   * "[Flat. Half your attention is elsewhere. Four to ten words…]".
   *
   * Repeating an instruction fifteen times is how you make a model MORE
   * mechanical, not less: it converges hard on the repeated text and her replies
   * flatten out as the conversation goes on, which is the exact opposite of
   * warming up. Every copy is also re-charged as context on every later turn.
   *
   * So the line is sent when it CHANGES, plus a heartbeat often enough that she
   * cannot drift far from it. A rep now carries a handful of directions instead
   * of one per breath, and each one means something because it is different from
   * the last.
   */
  directiveIfChanged(): string | null {
    if (this.consumeClosingHandover()) return null
    const next = this.judgement.steer({
      persona: this.persona,
      warmth: this.engine.warmth,
      suppressQuestion: this.questionQuotaSpent(),
      posture: this.engine.posture,
      repairOpen: this.engine.repairOpen,
      his: this.lastUserShape,
      ...this.openingBriefFlag,
    })
    this.turnsSinceSteer += 1
    // Hers if she has one. See `Persona.steerHeartbeatTurns` — a wider band
    // drifts further between reminders, so the two are one setting.
    const heartbeat = this.persona.steerHeartbeatTurns ?? STEER_HEARTBEAT_TURNS
    if (next === this.lastDirective && this.turnsSinceSteer < heartbeat) {
      return null
    }
    return this.directive()
  }

  /**
   * The direction for a provider that keeps nothing between turns.
   *
   * The ElevenLabs pipeline sends `[contract, exit rule, history, steering]`
   * and then throws the request away, so `directiveIfChanged` cannot be used
   * as it stands: returning null on an unchanged turn would leave her with no
   * band rule at all, and the band is the only thing that owns reply length.
   * That is round 6 again, reached from the opposite direction.
   *
   * So the line always ships. What is rationed instead is every clause that
   * reads as an instruction to ACT rather than a description of how to
   * respond — her agenda, the band's own invitation, and the gates she has
   * earned. On a turn where the direction is genuinely new — it changed, or the
   * heartbeat came due — she gets all of it. On the turns between she keeps the
   * band, the posture and the colour, and is not told again, immediately before
   * speaking, to volunteer something, start a topic, use his name and get back
   * to her book.
   *
   * PERSONA-AUDIT §11 rationed the agenda and left the rest running every turn.
   * They fail the same way and for the same reason, so they now ride the same
   * cadence. The throttle used to supply it for free; on a stateless provider it
   * has to be done on purpose. See `SteeringContext.includeStanding`.
   */
  statelessDirective(): string {
    if (this.consumeClosingHandover()) return ''
    const fresh = this.directiveIfChanged()
    if (fresh !== null) return fresh
    return this.judgement.steer({
      persona: this.persona,
      warmth: this.engine.warmth,
      suppressQuestion: this.questionQuotaSpent(),
      posture: this.engine.posture,
      repairOpen: this.engine.repairOpen,
      his: this.lastUserShape,
      includeStanding: false,
      ...this.openingBriefFlag,
    })
  }

  /**
   * The closing decision has been taken. Stand down for one turn.
   *
   * Thirty seconds out she is told exactly one thing — wind down and leave, or
   * wind down and offer him her number (`rep-rules.shouldWrapUp`). "Exactly
   * one thing" is about what reaches the model, not about how many calls the
   * caller makes. Appending that decision after a standing directive still
   * saying she would rather be left alone with her book gives her two orders
   * and she splits the difference: every win on 5 September offered the number
   * conditionally and then retreated into the scene in the same breath.
   *
   * One turn only, and consumed by whoever reads the direction next. If she
   * takes another turn before the rep ends she gets her band back rather than
   * nothing.
   */
  handOverToClosing(): void {
    this.closingHandover = true
  }

  private consumeClosingHandover(): boolean {
    if (!this.closingHandover) return false
    this.closingHandover = false
    return true
  }

  /** The persona as it stands right now, not as it stood at connect. */
  /**
   * Which track's judgement this rep runs under.
   *
   * Read LIVE off the persona for the same reason the persona itself is: the
   * dev panel can swap the character mid-session, and a cached selector would
   * keep steering the previous one. It is one property lookup.
   */
  private get judgement() {
    return judgementFor(this.persona)
  }

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
    // ONE OWNER FOR THE QUESTION RULE. The reciprocity gate rides here rather
    // than adding a clause of its own, because two systems specifying one thing
    // is the round-6 failure this file already documents. `mayAskFor` refuses
    // turn one, refuses below ENGAGED, refuses after a dead end, and refuses
    // when he has offered nothing to ask about — see `./reciprocity.ts`.
    if (!this.judgement.mayAsk(this.engine.warmth, this.lastUserShape)) return true
    // The share is the track's. Dating keeps §4e's 0.4; an interviewer has no
    // quota at all, because asking is the job and a rationed interviewer is a
    // form. `MAX_QUESTION_SHARE` is the default and is unchanged.
    const share = this.judgement.maxQuestionShare ?? MAX_QUESTION_SHARE
    if (share >= 1) return false
    const recent = this.agentTurns.slice(-QUESTION_WINDOW)
    if (recent.length < QUESTION_WINDOW) return false
    const asked = recent.filter((turn) => turn.text.trim().endsWith('?')).length
    return asked / recent.length >= share
  }

  get steeringItemsSent(): number {
    return this.steeringSent
  }

  /**
   * Everything below the application that decides HOW LONG she takes.
   *
   * Timing is the fifth layer (`./timing.ts`) and it reads the same warmth the
   * other four read, plus two things only this class knows: the posture the
   * three axes are currently in, and what kind of turn she is answering. The
   * adapter applies it; she is never told any of it.
   */
  get replyShape(): ReplyShape {
    return { posture: this.engine.posture, turnKind: this.lastTurnKind }
  }

  /**
   * Her ceiling for the next reply: the band's, lowered to mirror his turn.
   *
   * The band still owns how much she gives. This decides whether the turn has
   * earned it — "Mhm." buys two words, not nine. See `mirrorCapFor`.
   */
  get replyWordCap(): number {
    return this.judgement.wordCap(this.engine.warmth, this.lastUserShape, this.openingTurnKind)
  }

  /**
   * The kind of turn she is about to take, when it is not a reply.
   *
   * Her first one only, and only when the caller said so. Everything after it —
   * and every turn of every dating rep — is `undefined`, which is the argument
   * `mirrorCapFor` never sees.
   */
  private get openingTurnKind(): InterviewTurnKind | undefined {
    if (this.agentTurns.length > 0) return undefined
    return this.options.openingTurnKind
  }

  /** The same fact, in the shape the steering context wants it. */
  private get openingBriefFlag(): { openingBrief?: true } {
    return this.openingTurnKind === 'brief' ? { openingBrief: true } : {}
  }

  /**
   * Whether she says nothing at all this turn.
   *
   * Read by the adapter, which then makes no request: enforced rather than
   * asked for, the same way the word cap is. A model told to say nothing says
   * something short instead.
   */
  get staysSilent(): boolean {
    // NEVER ON THE CLOSING TURN. Thirty seconds out she is told exactly one
    // thing — wind down and leave, or wind down and offer him her number — and
    // that decision is the moment the whole product is built around. A grunt at
    // 2:30 must not be able to swallow it.
    if (this.closingHandover) return false
    return this.judgement.maySayNothing(this.engine.warmth, this.lastUserShape, {
      silentLastTurn: this.silentLastTurn,
      // How long since she last did it. The dating arm does not read this —
      // its silence is a cold-band withdrawal and "never twice running" is the
      // whole spacing rule there. An interviewer's pause is a technique, and a
      // technique used every other turn is a tic.
      turnsSinceSilence: this.turnsSinceSilence,
      // The stricter reading of "he asked me something". `UserTurnShape` is
      // Tier 0 and stays byte-identical; this is carried beside it, and only
      // the interview arm reads it. See the option's own note.
      askedDirectly: this.lastUserAskedDirectly,
      // An interviewer who greets a candidate with silence is not applying
      // pressure, she is broken. The dating arm never reads this — `deadEnd`
      // cannot be true on an opening turn, which already covers it there.
      opening: this.userTurnCount === 0,
    })
  }

  /** The adapter reports back what it did, so silence cannot repeat. */
  noteSilence(silent: boolean): void {
    this.silentLastTurn = silent
    this.turnsSinceSilence = silent ? 0 : this.turnsSinceSilence + 1
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
      // LAYER 2 reaches the scorer here. Without it every character on the
      // ladder is moved by identical arithmetic — see ./temperament.ts.
      personality: this.persona.personality,
      agentTurns: this.agentTurns,
      precedingDeadEnds: this.consecutiveDeadEnds,
      gapSeconds,
      // His first turn is not a dead end however short it is — see `scoreFast`.
      // Counted here rather than inferred from `agentTurns`, so it holds whether
      // he opened or she did.
      openingTurn: this.userTurnCount === 1,
    })

    this.engine.applyFast(score, turn.t_end, turn.text)
    this.consecutiveDeadEnds = score.deadEnd ? this.consecutiveDeadEnds + 1 : 0

    // What he gave, for the reciprocity gates. Everything here is already
    // computed above or is one call away from it; nothing sees a model.
    this.lastUserShape = {
      words: score.wordCount,
      askedQuestion: turn.text.includes('?') || isOpenQuestion(turn.text),
      disclosed: score.wordCount >= DISCLOSURE_WORDS,
      deadEnd: score.deadEnd,
    }
    // Recorded BESIDE the shape rather than in it: `UserTurnShape` is Tier 0
    // and every dating gate reads it exactly as it always has. This is the
    // stricter question test the interview arm needs, and nothing else reads it.
    this.lastUserAskedDirectly = turn.text.includes('?')

    // Evidence-driven, with a count-based floor underneath (§2a).
    const triggers = slowScoreTriggers({
      turnIndex: this.userTurnCount,
      fastRaw: score.raw,
      wordCount: score.wordCount,
      text: turn.text,
      deadEnd: score.deadEnd,
    })
    // Timing reads the same evidence the scorer does, one turn earlier. A
    // dispreferred answer is the one people hesitate in front of; so is a
    // personal one, and that pause is the most legible signal in the product.
    this.lastTurnKind = triggers.includes('hostility') || score.raw <= NEGATIVE_TURN_THRESHOLD
      ? 'dispreferred'
      : triggers.includes('personal-marker')
        ? 'intimate'
        : 'ordinary'

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
