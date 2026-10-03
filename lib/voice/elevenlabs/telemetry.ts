/**
 * Where the milliseconds go, and what they cost.
 *
 * The main reason this branch exists. A single round-trip number tells you the
 * pipeline is slow; it does not tell you whether to change TTS model, move the
 * proxy region, or give up on the architecture. So every stage is measured
 * separately and reported as median and p90 — the p90 matters more than it
 * looks, because one 2-second turn in ten is enough to break the illusion even
 * when the median is fine.
 *
 * Cost is tracked in the units each vendor actually bills: ElevenLabs charges
 * characters, OpenAI charges tokens. Both TTS models bill $0.05 per 1,000
 * characters — identical — so a Flash-versus-v3 decision is latency against
 * expressiveness and never a saving.
 *
 * Pure except for the credit warning, which is deliberately loud.
 */

import { percentile } from '@/lib/metrics/latency'
import { priceTokens } from '../rates'
import type {
  PipelineStages,
  PipelineTelemetry,
  PipelineUsage,
  StageStat,
  TurnTiming,
  TurnTimingOutcome,
} from '../types'
import { ttsModelSpec } from './config'

type StageName = keyof PipelineStages

const STAGES: readonly StageName[] = [
  'vadSilenceMs',
  'sttMs',
  'llmFirstTokenMs',
  'llmCompleteMs',
  'ttsFirstByteMs',
  'totalPerceivedMs',
]

export interface PipelineModels {
  ttsModel: string
  sttModel: string
  llmModel: string
}

export interface CreditGuardOptions {
  budget: number
  warnAt: number
  /** Injected in tests. Defaults to the console. */
  warn?: (message: string) => void
}

/**
 * The thing that stops a rep dying halfway through.
 *
 * The free plan is 10,000 credits a month with no overage — the session does
 * not degrade, it simply stops mid-sentence. So this shouts once on the way
 * past the threshold and then again on every further turn, because a warning
 * you scroll past is not a warning.
 */
export class CreditGuard {
  private readonly budget: number
  private readonly warnAt: number
  private readonly warn: (message: string) => void
  private announced = false

  constructor(options: CreditGuardOptions) {
    this.budget = options.budget
    this.warnAt = options.warnAt
    this.warn = options.warn ?? ((message) => console.warn(message))
  }

  /** `used` is the vendor's own counter where we have it, ours otherwise. */
  check(used: number): void {
    if (used < this.warnAt) return
    const remaining = Math.max(0, this.budget - used)
    const rule = '━'.repeat(64)
    this.warn(
      [
        '',
        rule,
        used >= this.budget
          ? '  ELEVENLABS CREDITS EXHAUSTED — SYNTHESIS WILL FAIL'
          : '  ELEVENLABS CREDITS RUNNING OUT',
        rule,
        `  used       ${Math.round(used).toLocaleString()} of ${this.budget.toLocaleString()}`,
        `  remaining  ${Math.round(remaining).toLocaleString()} characters`,
        `  that is roughly ${Math.floor(remaining / 40)} more replies at ~40 characters each.`,
        this.announced
          ? '  End the session before it stops mid-sentence.'
          : '  Stop testing, or top up, before starting another rep.',
        rule,
        '',
      ].join('\n'),
    )
    this.announced = true
  }

  get hasWarned(): boolean {
    return this.announced
  }
}

/**
 * How many replies are timed one by one. Three minutes of rep is ~15–25
 * replies; forty keeps the row small and still covers a rep that ran long.
 */
export const MAX_TIMED_TURNS = 40

/** One reply being timed. The clock values stay in here; `snapshot` is what
 *  is stored. */
export class TimedTurn {
  readonly timing: TurnTiming
  private requestAtMs: number
  private firstByteAtMs: number | null = null

  constructor(timing: TurnTiming, requestAtMs: number) {
    this.timing = timing
    this.requestAtMs = requestAtMs
  }

  firstByte(nowMs: number): void {
    if (this.firstByteAtMs !== null) return
    this.firstByteAtMs = nowMs
    this.timing.requestToFirstByteMs = ms(nowMs - this.requestAtMs)
  }

  firstSound(nowMs: number, onsetBeatMs: number): void {
    if (this.timing.firstByteToSoundMs !== null) return
    // A legacy-path reply can be heard before the turn reported a byte; the
    // first sound is then also the first byte.
    if (this.firstByteAtMs === null) this.firstByte(nowMs)
    this.timing.firstByteToSoundMs = ms(nowMs - this.firstByteAtMs!)
    this.timing.onsetBeatMs = ms(onsetBeatMs)
  }

  server(stage: keyof TurnTiming['server'], value: number): void {
    if (Number.isFinite(value) && value >= 0) this.timing.server[stage] = Math.round(value)
  }

  /** Cumulative for the request, so it is SET rather than added. */
  tokens(input: number, cachedInput: number): void {
    this.timing.inputTokens = input
    this.timing.cachedInputTokens = Math.min(input, cachedInput)
  }

  /** The first verdict stands: a reply that failed and was then swept up by
   *  the end of the rep failed. */
  settle(outcome: TurnTimingOutcome): void {
    if (this.timing.outcome === null) this.timing.outcome = outcome
  }
}

/**
 * Per-reply timing (`REP-FIXES-PLAN-2026-10-03.md` B1).
 *
 * Pure: every method takes the time it is told, so the whole thing is
 * testable without a clock, and it changes nothing about what the adapter
 * does — it only writes down when things happened. Clauses accumulate into a
 * draft until a reply is opened; that is what makes "he had to speak twice"
 * readable afterwards, as a first reply with two clauses and one of them empty.
 */
export class TurnTimeline {
  private readonly entries: TimedTurn[] = []
  private draft = emptyDraft()

  /** A clause's final transcript was released to the adapter. */
  clauseFinal(clause: {
    stoppedAtMs: number
    committedAtMs: number
    /** Committed -> this clause's own final, as the transcriber measured it. */
    latencyMs: number
    nowMs: number
    atS: number
    empty: boolean
    /** Clauses still unfinished behind this one. */
    pendingAfter: number
  }): void {
    const draft = this.draft
    draft.clauses += 1
    if (clause.empty) {
      draft.emptyClauses += 1
      return
    }
    draft.sttMs = ms(clause.nowMs - clause.stoppedAtMs)
    draft.orderWaitMs = ms(clause.nowMs - clause.committedAtMs - clause.latencyMs)
    draft.finalAtMs = clause.nowMs
    draft.atS = clause.atS
    draft.heldBy = Math.max(draft.heldBy, clause.pendingAfter)
  }

  /** A reply was ready and did not go: clauses pending, or he is speaking. */
  held(pending: number): void {
    this.draft.heldBy = Math.max(this.draft.heldBy, pending)
  }

  /** A reply is being requested now. Null past the cap; callers ignore it. */
  open(nowMs: number): TimedTurn | null {
    const draft = this.draft
    this.draft = emptyDraft()
    if (this.entries.length >= MAX_TIMED_TURNS) return null
    const index = this.entries.length
    const turn = new TimedTurn({
      index,
      first: index === 0,
      atS: draft.atS === null ? null : Math.round(draft.atS * 1000) / 1000,
      clauses: draft.clauses,
      emptyClauses: draft.emptyClauses,
      sttMs: draft.sttMs,
      orderWaitMs: draft.orderWaitMs,
      heldMs: draft.finalAtMs === null ? null : ms(nowMs - draft.finalAtMs),
      heldBy: draft.heldBy,
      requestToFirstByteMs: null,
      firstByteToSoundMs: null,
      onsetBeatMs: null,
      server: {},
      inputTokens: null,
      cachedInputTokens: null,
      outcome: null,
    }, nowMs)
    this.entries.push(turn)
    return turn
  }

  /** Clauses spoken and never answered are dropped with the draft; the rep is
   *  over and they bought nothing. */
  list(): TurnTiming[] {
    return this.entries.map((entry) => ({ ...entry.timing, server: { ...entry.timing.server } }))
  }
}

function emptyDraft() {
  return {
    clauses: 0,
    emptyClauses: 0,
    sttMs: null as number | null,
    orderWaitMs: null as number | null,
    finalAtMs: null as number | null,
    atS: null as number | null,
    heldBy: 0,
  }
}

function ms(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
}

export interface PipelineMeterOptions {
  models: PipelineModels
  credits: { budget: number; warnAt: number }
  /** Overrides the model spec's credits-per-character when the plan differs. */
  creditsPerChar?: number | null
  warn?: (message: string) => void
}

export class PipelineMeter {
  private readonly samples: Record<StageName, number[]> = {
    vadSilenceMs: [],
    sttMs: [],
    llmFirstTokenMs: [],
    llmCompleteMs: [],
    ttsFirstByteMs: [],
    totalPerceivedMs: [],
  }

  private readonly models: PipelineModels
  private readonly guard: CreditGuard
  private readonly creditsPerChar: number

  /** Per-reply timing. Measurement only; see `TurnTimeline`. */
  readonly timeline = new TurnTimeline()

  private bargeIns = 0
  private backchannels = 0
  private truncatedTurns = 0
  private characters = 0
  private sttAudioTokens = 0
  private sttTextTokens = 0
  private llmInputTokens = 0
  private llmCachedInputTokens = 0
  private llmOutputTokens = 0
  private creditsRemaining: number | null = null
  /** The vendor's own used-counter, when the subscription endpoint answers. */
  private vendorCreditsUsed: number | null = null

  constructor(options: PipelineMeterOptions) {
    this.models = options.models
    this.creditsPerChar =
      options.creditsPerChar ?? ttsModelSpec(options.models.ttsModel).creditsPerChar
    this.guard = new CreditGuard({
      budget: options.credits.budget,
      warnAt: options.credits.warnAt,
      ...(options.warn ? { warn: options.warn } : {}),
    })
  }

  record(stage: StageName, ms: number): void {
    // Long stalls are precisely the observations an optimization must retain.
    // Dropping values above 20 seconds made the slowest failures disappear.
    if (!Number.isFinite(ms) || ms < 0) return
    this.samples[stage].push(Math.round(ms))
  }

  bargeIn(): void {
    this.bargeIns += 1
  }

  /** A short sound while she was audible that was let go rather than
   *  cutting her off. See `lib/voice/barge.ts`. */
  backchannel(): void {
    this.backchannels += 1
  }

  truncated(): void {
    this.truncatedTurns += 1
  }

  /**
   * Characters *sent to synthesis*, which is what ElevenLabs bills — including
   * the ones a barge-in threw away. Counting only what played would make the
   * session look cheaper than the invoice.
   */
  addTtsCharacters(count: number): void {
    this.characters += count
    this.guard.check(this.creditsUsed)
  }

  addSttTokens(tokens: { audio?: number; text?: number }): void {
    this.sttAudioTokens += tokens.audio ?? 0
    this.sttTextTokens += tokens.text ?? 0
  }

  addLlmTokens(tokens: { input?: number; output?: number; cachedInput?: number }): void {
    this.llmInputTokens += tokens.input ?? 0
    this.llmCachedInputTokens += Math.min(tokens.input ?? 0, tokens.cachedInput ?? 0)
    this.llmOutputTokens += tokens.output ?? 0
  }

  /** The vendor's own counters, read at connect and again at the end. */
  setVendorCredits(used: number | null, limit: number | null): void {
    this.vendorCreditsUsed = used
    this.creditsRemaining =
      used !== null && limit !== null ? Math.max(0, limit - used) : null
    if (used !== null) this.guard.check(used)
  }

  get creditsUsed(): number {
    return Math.round(this.characters * this.creditsPerChar)
  }

  get charactersSent(): number {
    return this.characters
  }

  usage(sessionSeconds: number): PipelineUsage {
    const elevenCostUsd = (this.characters / 1000) * ttsModelSpec(this.models.ttsModel).usdPer1kChars
    const sttCostUsd = priceTokens(this.models.sttModel, {
      audioInput: this.sttAudioTokens,
      textOutput: this.sttTextTokens,
    })
    const llmCostUsd = priceTokens(this.models.llmModel, {
      textInput: this.llmInputTokens,
      cachedTextInput: this.llmCachedInputTokens,
      textOutput: this.llmOutputTokens,
    })
    const openaiCostUsd = sttCostUsd !== null && llmCostUsd !== null
      ? sttCostUsd + llmCostUsd
      : null
    const totalCostUsd = openaiCostUsd === null ? null : elevenCostUsd + openaiCostUsd

    return {
      elevenlabs: {
        characters: this.characters,
        creditsUsed: this.creditsUsed,
        creditsRemaining: this.creditsRemaining,
        costUsd: round6(elevenCostUsd),
      },
      openai: {
        sttTokens: this.sttAudioTokens + this.sttTextTokens,
        llmTokens: this.llmInputTokens + this.llmOutputTokens,
        llmCachedInputTokens: this.llmCachedInputTokens,
        costUsd: openaiCostUsd === null ? null : round6(openaiCostUsd),
      },
      totalCostUsd: totalCostUsd === null ? null : round6(totalCostUsd),
      costPerMinuteUsd:
        totalCostUsd === null ? null
          : sessionSeconds > 0 ? round6(totalCostUsd / (sessionSeconds / 60)) : 0,
    }
  }

  stages(): PipelineStages {
    const out = {} as PipelineStages
    for (const stage of STAGES) out[stage] = stat(this.samples[stage])
    return out
  }

  telemetry(sessionSeconds: number): PipelineTelemetry {
    return {
      ttsModel: this.models.ttsModel,
      sttModel: this.models.sttModel,
      llmModel: this.models.llmModel,
      stages: this.stages(),
      bargeIns: this.bargeIns,
      truncatedTurns: this.truncatedTurns,
      usage: this.usage(sessionSeconds),
      turns: this.timeline.list(),
      backchannels: this.backchannels,
    }
  }

  /** The vendor counter if we have it, ours otherwise. For the guard's sake
   *  the two should agree; if they do not, the vendor is right. */
  get authoritativeCreditsUsed(): number {
    return this.vendorCreditsUsed ?? this.creditsUsed
  }
}

function stat(values: readonly number[]): StageStat {
  return {
    median: percentile(values, 50) ?? 0,
    p90: percentile(values, 90) ?? 0,
    count: values.length,
  }
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6
}
