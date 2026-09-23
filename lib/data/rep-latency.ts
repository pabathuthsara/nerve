/**
 * The two numbers the persona realism report is about, and the ladder they
 * decide (PERSONA-REALISM-REPORT L8, W1).
 *
 * ── WHY THESE, AND WHY HERE ──────────────────────────────────────────────
 *
 * The report's whole argument runs through two measurements that could only be
 * pulled by hand-written SQL: how long she takes to answer (a ~3.4 s median
 * gap, and 7.6 s before her FIRST reply on the free sign-up rep), and how many
 * turns a three-minute rep delivers (12.4 against the 15 the ladder was tuned
 * for). Every latency item exists to move the first, and the second is what
 * decides whether "gradually into you" exists above rung 1 — so W1, "re-measure
 * the ladder after the latency work before any trajectory moves", is these
 * same numbers per rung with the arm rate beside them.
 *
 * Read from the stored transcript, which is what the ear heard and what the
 * report measured, rather than from browser telemetry a client supplies.
 * Pure; the admin read is `lib/db/admin-metrics.ts`.
 */

import { ARM_THRESHOLD } from './rep-rules'

export interface StoredTurn {
  speaker: string
  text: string
  t_start: number
  t_end: number
}

export interface RepSample {
  personaSlug: string
  turns: readonly StoredTurn[]
  /** `sessions.peak_warmth`. Null when the rep never scored. */
  peakWarmth: number | null
  /** `sessions.duration_s`. Reps shorter than a minute are left out. */
  durationSeconds: number | null
}

/** A rep that did not run a minute is a test tap, not a conversation. */
export const MIN_REP_SECONDS = 60

/** ENGAGED, the band where "into you" starts to be audible. */
export const ENGAGED_WARMTH = 60

function isUser(turn: StoredTurn): boolean {
  return turn.speaker === 'user'
}

function isAgent(turn: StoredTurn): boolean {
  return turn.speaker === 'agent'
}

function valid(turn: StoredTurn): boolean {
  return Number.isFinite(turn.t_start) && Number.isFinite(turn.t_end) && turn.text.trim().length > 0
}

/**
 * Every gap from him finishing to her starting, in milliseconds.
 *
 * Only a user turn IMMEDIATELY followed by hers counts: two of his in a row is
 * him still talking, and a silent turn of hers (`mayStaySilentFor`) is a choice
 * rather than latency.
 */
export function replyGapsMs(turns: readonly StoredTurn[]): number[] {
  const ordered = turns.filter(valid).slice().sort((a, b) => a.t_start - b.t_start)
  const gaps: number[] = []
  for (let i = 1; i < ordered.length; i += 1) {
    const before = ordered[i - 1]!
    const after = ordered[i]!
    if (isUser(before) && isAgent(after)) gaps.push(Math.max(0, Math.round((after.t_start - before.t_end) * 1000)))
  }
  return gaps
}

/** Her first reply, the one the report measured at 7.6 s on Cass. */
export function firstReplyGapMs(turns: readonly StoredTurn[]): number | null {
  return replyGapsMs(turns)[0] ?? null
}

export function agentTurnCount(turns: readonly StoredTurn[]): number {
  return turns.filter((turn) => isAgent(turn) && valid(turn)).length
}

export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[index] ?? null
}

export interface LatencySummary {
  reps: number
  /** Median of every reply gap in every rep. */
  replyGapP50: number | null
  replyGapP90: number | null
  firstReplyP50: number | null
  firstReplyP90: number | null
  /** Mean of her turns per rep. The ladder was tuned for fifteen. */
  agentTurnsPerRep: number | null
}

export interface RungRow extends LatencySummary {
  personaSlug: string
  /** Share of reps whose peak reached `ARM_THRESHOLD`. */
  armedShare: number | null
  /** Share of reps whose peak reached ENGAGED. */
  engagedShare: number | null
}

function summarise(samples: readonly RepSample[]): LatencySummary {
  const gaps = samples.flatMap((sample) => replyGapsMs(sample.turns))
  const firsts = samples.map((sample) => firstReplyGapMs(sample.turns)).filter((gap): gap is number => gap !== null)
  const turns = samples.map((sample) => agentTurnCount(sample.turns))
  return {
    reps: samples.length,
    replyGapP50: percentile(gaps, 50),
    replyGapP90: percentile(gaps, 90),
    firstReplyP50: percentile(firsts, 50),
    firstReplyP90: percentile(firsts, 90),
    agentTurnsPerRep: turns.length ? Math.round((turns.reduce((a, b) => a + b, 0) / turns.length) * 10) / 10 : null,
  }
}

/** The reps worth measuring: a minute or longer. */
export function measurable(samples: readonly RepSample[]): RepSample[] {
  return samples.filter((sample) => (sample.durationSeconds ?? 0) >= MIN_REP_SECONDS)
}

export function latencySummary(samples: readonly RepSample[]): LatencySummary {
  return summarise(measurable(samples))
}

/** The same numbers per rung, with the ladder's own outcome beside them (W1). */
export function rungRows(samples: readonly RepSample[], order: readonly string[]): RungRow[] {
  const kept = measurable(samples)
  return order.map((slug) => {
    const rung = kept.filter((sample) => sample.personaSlug === slug)
    const peaks = rung.map((sample) => sample.peakWarmth).filter((peak): peak is number => peak !== null)
    return {
      personaSlug: slug,
      ...summarise(rung),
      armedShare: peaks.length ? peaks.filter((peak) => peak >= ARM_THRESHOLD).length / peaks.length : null,
      engagedShare: peaks.length ? peaks.filter((peak) => peak >= ENGAGED_WARMTH).length / peaks.length : null,
    }
  })
}
