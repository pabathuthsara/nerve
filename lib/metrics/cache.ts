/**
 * Prompt-cache health.
 *
 * Realtime caches on the conversation prefix, and our prefix is the character
 * contract — several thousand tokens that should be charged once and read from
 * cache on every turn thereafter. Round 5 rewrote instructions mid-session via
 * session.update, invalidating that prefix and re-charging the whole contract
 * at full price on the next turn: one response at 2.9x the cost of a normal one.
 *
 * That failure is invisible in a total. It shows up only per response, which is
 * why this reads the samples rather than the sums.
 */

import type { SessionUsage, UsageSample } from '@/lib/voice/types'

export interface CacheBust {
  at: number
  responseId: string | null
  hitRate: number
  /** How many times a typical response this one cost. Null without pricing. */
  costMultiple: number | null
}

export interface CacheHealth {
  /** Cached share of input text tokens across the whole session. */
  hitRate: number | null
  /** Per-response hit rates, in order, for the trend. */
  perResponse: { at: number; hitRate: number }[]
  firstThirdHitRate: number | null
  lastThirdHitRate: number | null
  busts: CacheBust[]
  verdict: 'healthy' | 'degraded' | 'bust' | 'insufficient'
}

/**
 * A response is a bust when its cached share collapses to less than half of
 * what the session had been sustaining. Judged against the session's own
 * baseline rather than a fixed number, because the healthy rate depends on how
 * long the contract is.
 */
const BUST_RATIO = 0.5
/** Below this there is no cache worth busting, so there is nothing to detect. */
const MIN_BASELINE = 0.3
/** Under this, the session-wide rate is not healthy regardless of busts. */
const DEGRADED_BELOW = 0.5

function hitRateOf(sample: UsageSample): number | null {
  if (sample.inputTextTokens <= 0) return null
  return sample.cachedInputTextTokens / sample.inputTextTokens
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid] ?? null
  const low = sorted[mid - 1]
  const high = sorted[mid]
  return low === undefined || high === undefined ? null : (low + high) / 2
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function analyseCacheHealth(usage: SessionUsage | null): CacheHealth {
  const empty: CacheHealth = {
    hitRate: null,
    perResponse: [],
    firstThirdHitRate: null,
    lastThirdHitRate: null,
    busts: [],
    verdict: 'insufficient',
  }
  if (!usage) return empty

  // The first response of a session has nothing to hit — the prefix is being
  // written, not read. Counting it flags every healthy session as a bust, which
  // is exactly what round 6 did: 0% at 4.3s with a cost multiple of 0.98, i.e.
  // a perfectly ordinary response.
  const scored = usage.samples
    .slice(1)
    .map((sample) => ({ sample, hitRate: hitRateOf(sample) }))
    .filter((entry): entry is { sample: UsageSample; hitRate: number } => entry.hitRate !== null)

  if (scored.length < 3) {
    return {
      ...empty,
      hitRate:
        usage.inputTextTokens > 0
          ? usage.cachedInputTextTokens / usage.inputTextTokens
          : null,
      perResponse: scored.map((entry) => ({ at: entry.sample.at, hitRate: entry.hitRate })),
    }
  }

  const rates = scored.map((entry) => entry.hitRate)
  const baseline = median(rates) ?? 0
  const typicalCost = median(
    scored
      .map((entry) => entry.sample.pricedCostUsd)
      .filter((cost): cost is number => cost !== null && cost > 0),
  )

  const busts: CacheBust[] =
    baseline >= MIN_BASELINE
      ? scored
          .filter((entry) => entry.hitRate < baseline * BUST_RATIO)
          .map((entry) => ({
            at: entry.sample.at,
            responseId: entry.sample.responseId,
            hitRate: Math.round(entry.hitRate * 1000) / 1000,
            costMultiple:
              typicalCost && entry.sample.pricedCostUsd !== null
                ? Math.round((entry.sample.pricedCostUsd / typicalCost) * 100) / 100
                : null,
          }))
      : []

  const third = Math.max(1, Math.floor(rates.length / 3))
  // Measured across cacheable responses only, for the same reason.
  const cacheableInput = scored.reduce((sum, e) => sum + e.sample.inputTextTokens, 0)
  const cacheableCached = scored.reduce((sum, e) => sum + e.sample.cachedInputTextTokens, 0)
  const sessionRate = cacheableInput > 0 ? cacheableCached / cacheableInput : null

  return {
    hitRate: sessionRate,
    perResponse: scored.map((entry) => ({
      at: entry.sample.at,
      hitRate: Math.round(entry.hitRate * 1000) / 1000,
    })),
    firstThirdHitRate: mean(rates.slice(0, third)),
    lastThirdHitRate: mean(rates.slice(-third)),
    busts,
    verdict:
      busts.length > 0
        ? 'bust'
        : sessionRate !== null && sessionRate < DEGRADED_BELOW
          ? 'degraded'
          : 'healthy',
  }
}
