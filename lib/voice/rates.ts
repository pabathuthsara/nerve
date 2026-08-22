/**
 * Cost per minute, stamped on every session summary (§04 — invariant 2).
 *
 * These are estimates until M0 measures the real thing. Realtime pricing
 * re-charges prior audio context on each turn, so cost per minute climbs as a
 * conversation lengthens: the ≈$0.065 figure holds for short reps, and measured
 * heavy-context sessions reach $0.12–0.15/min. If M0 lands above $0.12/min the
 * tier caps in §14 need revisiting before launch, not after.
 */

import type {
  ProviderId,
  Rate,
  SessionUsage,
  UsageSample,
} from './types'

const RATES: Record<string, Rate> = {
  'gpt-realtime-mini': { currency: 'USD', perMinute: 0.065 },
  'gpt-realtime-2.1-mini': { currency: 'USD', perMinute: 0.065 },
  'gpt-realtime': { currency: 'USD', perMinute: 0.16 },
  'eleven-agents': { currency: 'USD', perMinute: 0.095 },
  // The assembled pipeline. §04 costs it at ≈$0.033/min: ElevenLabs at
  // $0.05/1K characters ≈ $0.023, plus ≈$0.010 for STT and the text model.
  // Stamped on the ledger as an estimate; `summary.pipeline.usage` carries the
  // measured figure, computed from characters and tokens actually spent.
  'elevenlabs-pipeline': { currency: 'USD', perMinute: 0.033 },
}

export function rateFor(_provider: ProviderId, model: string): Rate {
  return RATES[model] ?? { currency: 'USD', perMinute: 0 }
}

interface TokenRateCard {
  inputText: number
  cachedInputText: number
  inputAudio: number
  cachedInputAudio: number
  outputText: number
  outputAudio: number
}

/** USD per million tokens, from the OpenAI model rate cards. */
const TOKEN_RATES: Record<string, TokenRateCard> = {
  'gpt-realtime-mini': {
    inputText: 0.6,
    cachedInputText: 0.06,
    inputAudio: 10,
    cachedInputAudio: 0.3,
    outputText: 2.4,
    outputAudio: 20,
  },
  'gpt-realtime-2.1-mini': {
    inputText: 0.6,
    cachedInputText: 0.06,
    inputAudio: 10,
    cachedInputAudio: 0.3,
    outputText: 2.4,
    outputAudio: 20,
  },
  'gpt-realtime': {
    inputText: 4,
    cachedInputText: 0.4,
    inputAudio: 32,
    cachedInputAudio: 0.4,
    outputText: 16,
    outputAudio: 64,
  },
}

function tokenRatesFor(model: string): TokenRateCard | null {
  if (model === 'gpt-realtime-2.1-mini' || model.startsWith('gpt-realtime-2.1-mini-')) {
    return TOKEN_RATES['gpt-realtime-2.1-mini'] ?? null
  }
  if (model === 'gpt-realtime-mini' || model.startsWith('gpt-realtime-mini-')) {
    return TOKEN_RATES['gpt-realtime-mini'] ?? null
  }
  if (model === 'gpt-realtime' || model.startsWith('gpt-realtime-2025-')) {
    return TOKEN_RATES['gpt-realtime'] ?? null
  }
  return null
}

/** Prices provider-reported usage; this is no longer rate × wall-clock time. */
export function priceUsageSample(model: string, sample: UsageSample): UsageSample {
  const rates = tokenRatesFor(model)
  if (!rates) return { ...sample, pricedCostUsd: null }
  const classifiedTokens = sample.inputTextTokens + sample.inputAudioTokens
    + sample.outputTextTokens + sample.outputAudioTokens
  if (sample.totalTokens > 0 && classifiedTokens === 0) {
    return { ...sample, pricedCostUsd: null }
  }

  const uncachedText = Math.max(0, sample.inputTextTokens - sample.cachedInputTextTokens)
  const uncachedAudio = Math.max(0, sample.inputAudioTokens - sample.cachedInputAudioTokens)
  const cost = (
    uncachedText * rates.inputText
    + sample.cachedInputTextTokens * rates.cachedInputText
    + uncachedAudio * rates.inputAudio
    + sample.cachedInputAudioTokens * rates.cachedInputAudio
    + sample.outputTextTokens * rates.outputText
    + sample.outputAudioTokens * rates.outputAudio
  ) / 1_000_000

  return { ...sample, pricedCostUsd: cost }
}

export function summarizeUsage(
  samples: readonly UsageSample[],
  sessionSeconds: number,
): SessionUsage | null {
  if (samples.length === 0) return null
  const sum = (field: keyof UsageSample) => samples.reduce((total, sample) => {
    const value = sample[field]
    return total + (typeof value === 'number' ? value : 0)
  }, 0)
  const priced = samples.every((sample) => sample.pricedCostUsd !== null)
    ? samples.reduce((total, sample) => total + (sample.pricedCostUsd ?? 0), 0)
    : null

  return {
    samples: [...samples],
    inputTextTokens: sum('inputTextTokens'),
    cachedInputTextTokens: sum('cachedInputTextTokens'),
    inputAudioTokens: sum('inputAudioTokens'),
    cachedInputAudioTokens: sum('cachedInputAudioTokens'),
    outputTextTokens: sum('outputTextTokens'),
    outputAudioTokens: sum('outputAudioTokens'),
    totalTokens: sum('totalTokens'),
    pricedCostUsd: priced,
    pricedCostPerMinuteUsd:
      priced !== null && sessionSeconds > 0 ? priced / (sessionSeconds / 60) : null,
  }
}

/* ------------------------------------------------------------------ *
 * Assembled-pipeline rate cards
 * ------------------------------------------------------------------ */

/** USD per million tokens for the text models in the pipeline path. */
export interface PipelineTokenRates {
  /** Audio tokens in, for the transcriber. */
  audioInput: number
  textInput: number
  textOutput: number
}

/**
 * Published list prices. Estimates until a billing period reconciles them —
 * the same caveat the realtime card above carries.
 */
const PIPELINE_TOKEN_RATES: Record<string, PipelineTokenRates> = {
  'gpt-4o-mini-transcribe': { audioInput: 1.25, textInput: 1.25, textOutput: 5 },
  'gpt-4o-transcribe': { audioInput: 6, textInput: 2.5, textOutput: 10 },
  'gpt-4.1-mini': { audioInput: 0, textInput: 0.4, textOutput: 1.6 },
  'gpt-4.1-nano': { audioInput: 0, textInput: 0.1, textOutput: 0.4 },
  'gpt-4.1': { audioInput: 0, textInput: 2, textOutput: 8 },
}

export function pipelineTokenRates(model: string): PipelineTokenRates | null {
  return PIPELINE_TOKEN_RATES[model] ?? null
}

/** Cost of one model call, in USD. Unknown models price at zero rather than
 *  guessing, so an unpriced arm reads as 0 instead of as plausible fiction. */
export function priceTokens(
  model: string,
  tokens: { audioInput?: number; textInput?: number; textOutput?: number },
): number {
  const rates = pipelineTokenRates(model)
  if (!rates) return 0
  return (
    (tokens.audioInput ?? 0) * rates.audioInput
    + (tokens.textInput ?? 0) * rates.textInput
    + (tokens.textOutput ?? 0) * rates.textOutput
  ) / 1_000_000
}
