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
import type { PipelineStages, PipelineTelemetry, PipelineUsage, StageStat } from '../types'
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

  private bargeIns = 0
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
