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
import { advanceExit, isDismissal, isUserFarewell, type ClosingDecision, type SceneExit } from './leaving'
import type { UserTurnKind } from './turn-kind'
import { personaNotes } from './persona-notes'
import type { SteeringContext } from './steering'
// B2's seam. One selector, reading `persona.track`, with dating as the default
// branch that reaches exactly the code it reached yesterday. Nothing in
// `bands.ts`, `reciprocity.ts` or `steering.ts` is opened to make this work.
import { judgementFor } from './track'
import type { InterviewTurnKind } from './interview/bands'
import type { InterviewSteeringContext } from './interview/steering'

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

/**
 * Her ceiling when he has only said hello.
 *
 * "Hey." is one word and "Morning, yeah." is three. Four leaves room for a
 * greeting with a word of warmth on it and no room at all for the concrete
 * observation that filled both stored openers. It is a CEILING and not a
 * target — the band, the sentence rule and the reciprocity clause all still
 * apply beneath it.
 */
const GREETING_REPLY_WORDS = 4

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
   * Where the scene is, and it only ever moves forward.
   *
   * `closingHandover` above is a one-shot: it stands the whole directive down
   * for exactly ONE turn so the wind-down decision arrives alone, and it is
   * cleared the moment it is read. That is right for the hand-over and it was
   * catastrophic as a record of having said goodbye — measured on 9 September,
   * Nadia said she had better check on the present and then, one turn later
   * with ordinary steering restored, asked him what his secret talent was.
   *
   * So the one-shot keeps its job and this keeps the memory. Monotonic, by
   * construction: see `advanceExit`.
   */
  private exit: SceneExit = 'present'
  /**
   * The exit was HIS doing, not the clock's.
   *
   * Both routes reach `'wrapping'` and only one of them may run on to
   * `'leaving'`. The thirty-second wind-down is the moment the whole product is
   * built around — she offers her number and the rep ends on the timer — and
   * auto-advancing it would cut the rep short at 2:31. A dismissal or a goodbye
   * is the opposite: she says one more line and the scene is over.
   */
  private exitByUser = false
  /**
   * What the wind-down decided, kept for the REST of the rep.
   *
   * `NUMBER_DIRECTIVE` is reinforced once, on the turn the decision is taken,
   * and `closingHandover` stands the band down for that one turn. That was
   * enough when the offer was the last thing she said and is not enough the
   * moment he answers it — measured on 10 September, she offered her number,
   * he asked for it, and on the next turn ordinary steering resumed and the
   * contract's own rule took over:
   *
   *   "Not while this is still going... Never promise it for later."
   *
   * So she offered and then refused, in consecutive turns, which is the one
   * ending the product is built around arriving as a contradiction. The
   * contract defers to the bracketed line in as many words — "If that changes,
   * the direction in brackets will tell you so" — and until now the direction
   * only told her once.
   */
  private closingDecision: ClosingDecision = 'leave'
  /**
   * The last four exchanges, oldest first, for the judge.
   *
   * The slow scorer used to see one pair and nothing else, so a RUN of anything
   * — three dead ends, a fourth question with nothing of his own in between,
   * mounting contempt — was invisible to the only layer that could recognise
   * it. Trimmed hard because this is serialised into a prompt.
   */
  private readonly exchanges: Array<{ him: string; her: string | null }> = []
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
  /**
   * What his last turn WAS (`./turn-kind.ts`), beside the four-field shape.
   *
   * Carried here rather than added to `UserTurnShape` for the reason
   * `lastUserAskedDirectly` is: that record is read by every dating gate and
   * stays byte-identical.
   */
  private lastUserKind: UserTurnKind = 'silence'

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
  /**
   * Everything the steering composer reads, in ONE place.
   *
   * The three callers below used to build this literal independently, and the
   * `exit` field proved why that is a bug waiting: added to `statelessDirective`
   * alone, it was silently dropped on every turn where the directive had
   * CHANGED — which is most turns — so a character who had committed to leaving
   * was still being told "You are not going yet." A field that three call sites
   * must remember is a field two of them will eventually forget.
   *
   * Read LIVE: the persona reference is whatever the tuning store currently
   * holds, so a slider moved mid-rep changes her very next reply (§3).
   */
  private steeringContext(): InterviewSteeringContext {
    return {
      persona: this.persona,
      warmth: this.engine.warmth,
      suppressQuestion: this.questionQuotaSpent(),
      // The other two axes reach her as a posture, never as numbers — the same
      // rule warmth has always followed. Silent when the three agree.
      posture: this.engine.posture,
      repairOpen: this.engine.repairOpen,
      his: this.lastUserShape,
      firstExchange: this.firstExchange,
      exit: this.exit,
      ...(this.exit === 'present' ? {} : { closing: this.closingDecision }),
      ...this.openingBriefFlag,
    }
  }

  directive(): string {
    this.steeringSent += 1
    const line = this.judgement.steer(this.steeringContext())
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
    const next = this.judgement.steer(this.steeringContext())
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
    return this.judgement.steer({ ...this.steeringContext(), includeStanding: false })
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
  handOverToClosing(decision: ClosingDecision = 'leave'): void {
    this.closingHandover = true
    this.closingDecision = decision
    this.commitExit('wrapping')
  }

  /**
   * Move the scene forward. Never backwards.
   *
   * The one writer for `exit`, so that "she has decided to go" cannot be
   * un-decided by a later caller who happens to run in a different order.
   */
  commitExit(next: SceneExit): void {
    this.exit = advanceExit(this.exit, next)
  }

  /** Where the scene is. Read by the adapter to end the rep, and by the tests. */
  get sceneExit(): SceneExit {
    return this.exit
  }

  /**
   * She has committed to leaving and has now said her last line.
   *
   * The adapter reads this after her turn completes and ends the rep. It is
   * deliberately NOT read before she speaks: a committed exit still gets one
   * line, because a character who vanishes mid-conversation is a dropped
   * connection and a character who says one last thing and goes is a person.
   */
  get shouldEndScene(): boolean {
    return this.exit === 'leaving'
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
    const band = this.judgement.wordCap(this.engine.warmth, this.lastUserShape, this.openingTurnKind)
    // A HELLO IS ANSWERED WITH A HELLO, AND THE MIRROR RULE CANNOT SAY SO.
    //
    // `mirrorCapFor` is a measured NO-OP on the opening turn: a one-word hello
    // yields `ceil(1 × 1.3) = 2`, which is then raised to the band's own
    // typical by the "a real turn always buys a sentence" floor — 3, 4, 6, 7, 8
    // and 9 across the table. That floor is right for "I am hungry" and wrong
    // for "Hello.", and the difference is not something the mirror rule can see
    // because it only counts words.
    //
    // So the carve-out lives here, where `firstExchange` and the turn kind are
    // both known, rather than as a warmth opinion added to a Tier 0 file. It
    // can only ever LOWER the band, like every other reciprocity rule.
    //
    // Measured consequence of not having it: "Hello." → "Hello. Not a bad
    // morning for sitting still." and "Hello there." → "Morning. The place is
    // noisier than I wanted." Both are a greeting AND an unprompted
    // observation, at a band whose directive says "Answer only what he asked."
    if (this.firstExchange && this.lastUserKind === 'greeting') {
      return Math.min(band, GREETING_REPLY_WORDS)
    }
    return band
  }

  /**
   * Her sentence ceiling for the next reply.
   *
   * Off the band alone, and NOT mirrored against his last turn — reciprocity
   * lowers how much she gives, and "one sentence" is already the floor of that
   * for every band but INVESTED. See `BandSpec.maxSentences`.
   */
  get replySentenceCap(): number {
    return this.judgement.sentenceCap(this.engine.warmth)
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
   * She is answering his FIRST turn, so he has offered her nothing yet.
   *
   * Read by `invitedThisTurn`, which withholds the band's invitation and the
   * gates for exactly this turn. His opener is exempt from `deadEnd` on purpose
   * — a two-word hello must not cost him warmth — and that exemption was being
   * read as an offer.
   *
   * `<= 1` rather than `=== 1` so it also covers the turn before he has spoken
   * at all, where `lastUserShape` is still null and the answer is the same one.
   */
  private get firstExchange(): boolean {
    return this.userTurnCount <= 1
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
    // NOR ON THE WAY OUT. A committed exit gets exactly one line, and a grunt
    // must not be able to swallow it — the goodbye is the whole point of having
    // made leaving a state rather than a request.
    if (this.exit !== 'present') return false
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
    const open = this.exchanges[this.exchanges.length - 1]
    if (open && open.her === null) open.her = turn.text
    // She has now said the line a committed exit is owed. The next thing the
    // adapter reads is `shouldEndScene`, and the rep ends. Only when HE ended
    // it — the clock's wind-down keeps running to the timer. See `exitByUser`.
    if (this.exitByUser && this.exit === 'wrapping') this.commitExit('leaving')
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
      // The half of "was that a dead end" that word count cannot supply. "Yeah."
      // is an ANSWER when she just asked him something; it used to cost him six
      // points either way. See `./turn-kind.ts`.
      herLastTurnAsked: lastAgent?.text.trim().endsWith('?') ?? false,
    })

    this.engine.applyFast(score, turn.t_end, turn.text, {
      // CONTEMPT MUST NOT ARM THE REPAIR BONUS.
      //
      // A fall opens a two-turn window in which his next positive turn is worth
      // more, and she is told "He misjudged it and is recovering. Let him, if he
      // earns it." That is exactly right for a fumble and exactly wrong for
      // "fuck off": measured on 9 September, the dismissal opened the window and
      // the next turn was scored as a repair.
      repairable: !score.reasons.some((reason) => reason.code === 'contempt'),
    })
    this.consecutiveDeadEnds = score.deadEnd ? this.consecutiveDeadEnds + 1 : 0

    // LEAVING IS A STATE, DECIDED HERE, SYNCHRONOUSLY, FROM WHAT HE SAID.
    //
    // Not a request to the model and not a sentinel it has to remember to emit
    // while also writing a line. He told her to go, or he said goodbye; both are
    // lexical facts already in hand, and both used to reach nothing at all.
    // `wrapping` rather than `leaving`, so she still gets one line to go out on.
    if ((score.kind === 'dismissal' && isDismissal(turn.text)) || isUserFarewell(turn.text)) {
      this.exitByUser = true
      this.commitExit('wrapping')
    }

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
    this.lastUserKind = score.kind

    // The run, for the judge. Pushed with her reply still unknown; `onAgentTurn`
    // fills it in when she answers. Four is two exchanges more than the judge is
    // shown, so trimming here can never drop one it was about to be given.
    this.exchanges.push({ him: turn.text, her: null })
    while (this.exchanges.length > 4) this.exchanges.shift()

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
      // The three exchanges BEFORE the one being judged. Without them a run of
      // anything is invisible: the judge saw one pair, so a fourth consecutive
      // question with nothing of his own in between looked exactly like a first
      // one, and mounting contempt looked like a single sour remark.
      recent: this.exchanges
        .slice(0, -1)
        .slice(-3)
        .map((exchange) => ({ him: exchange.him, her: exchange.her })),
      // What her author says moves her, extracted from the contract she is
      // already compiled from — one authored source, never a second copy.
      likes: personaNotes(this.persona).likes,
      dislikes: personaNotes(this.persona).dislikes,
    }

    void scorer.score(request, controller.signal).then((score) => {
      if (this.pending !== pending || this.disposed) return
      this.pending = null
      if (!score) {
        this.engine.recordSkippedSlow()
        return
      }
      // THE LEXICAL LAYER MAY DECIDE THE SIGN. IT MAY NOT DECIDE THE MAGNITUDE.
      //
      // The fast filter already refused to pay this turn and charged it
      // `CONTEMPT_POINTS`; the judge is then asked what it MEANT, and on
      // 9 September it came back +1.61 for "You're making me miserable."
      // because her playful reply read as evidence the exchange was friendly.
      // `PAIR_RULE` now says her performance is not evidence about his intent,
      // and two few-shots cover the low-intimacy hostile quadrant the table
      // never had — but a judgement layer is a model and will sometimes be
      // wrong about a turn a precision-tuned filter is right about.
      //
      // Clamped, never inverted. How negative it was is still the model's
      // question, and a hostile turn the judge scores at 0 stays at 0.
      const judged = pending.trigger.includes('hostility')
        ? { ...score, intent: Math.min(0, score.intent) }
        : score
      this.engine.applySlow(
        judged,
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

  /**
   * Let the last exchange finish being judged, then stop.
   *
   * `dispose()` is a hard teardown: it drops the awaiting turn and aborts the
   * score in flight. That is correct for a teardown and it silently threw away
   * the single most informative turn of every rep — the terminal one, which is
   * where the goodbye, the number and the boundary all live. In the 9 September
   * hostility rep, "Go away." has no stored slow event for exactly this reason.
   *
   * Called at the TOP of the rep teardown, before the socket close, so the
   * few hundred milliseconds that close already costs are spent waiting for a
   * judgement rather than in addition to it. Bounded, because a rep must never
   * be held open by a vendor that has stopped answering.
   */
  async finalise(budgetMs = 800): Promise<void> {
    this.flushAwaiting()
    const pending = this.pending
    if (!pending) return
    await Promise.race([
      new Promise<void>((resolve) => {
        const started = Date.now()
        const poll = setInterval(() => {
          if (this.pending !== pending || Date.now() - started > budgetMs) {
            clearInterval(poll)
            resolve()
          }
        }, 25)
      }),
      new Promise<void>((resolve) => setTimeout(resolve, budgetMs)),
    ])
  }

  dispose(): void {
    this.awaiting = null
    this.disposed = true
    this.pending?.controller.abort()
    this.pending = null
  }
}
