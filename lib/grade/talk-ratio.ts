/**
 * THE TALK-RATIO TARGET, NORMALISED TO HER (PERSONA-REALISM S5).
 *
 * The §07 band says his share of the speaking time should sit at 40–55%. That
 * number quietly assumes she is saying a normal amount — and on this product
 * how much she says is AUTHORED. The band table in `lib/warmth/bands.ts` asks
 * her for three words when she is hostile, four when closed, six when guarded,
 * seven when open and nine when invested. A rep spent mostly against a guarded
 * Robin is a rep in which she was told, every turn, to answer in six words and
 * stop; his share of the airtime rises because hers was capped, and the
 * deterministic 60% then docked him for a number the character produced.
 *
 * So the target moves with what she was asked to say:
 *
 *   k       her expected reply length over the reference (OPEN's typical, 7),
 *           weighted by how long the rep spent in each band
 *   f(r)    r / (r + (1 − r) · k) — the share a man who kept the same pace
 *           would have ended up with against her, for either edge of the band
 *
 * At k = 1 that is the identity, so a rep spent at OPEN is scored against the
 * band it has always been scored against. Below 1 the band rises (she said
 * less, so a fair share of the floor is a bigger one), above 1 it falls.
 *
 * ── WHY IT IS BOUNDED ────────────────────────────────────────────────────
 *
 * Three reasons, and the first is the one that matters.
 *
 *   **Band-time is his doing too.** Warmth is what he earned, so a rep that
 *   stayed cold has a colder expected reply length and a more forgiving talk
 *   target. Unbounded, a man who froze her out would have his monologue
 *   excused by the freeze. Eight points either way corrects for what the
 *   CHARACTER was told to do and stops well short of paying for what he did
 *   to her. (Rule 2 cuts the same way: this is the metric's own leak of
 *   outcome — cold rep, short replies, high share, lower score — being
 *   narrowed, not a new one being opened.)
 *
 *   **One point of slack.** A rep that wandered a little into ENGAGED is not a
 *   reason to print a different band on the scorecard than the one next to
 *   it. The first percentage point of movement is absorbed, continuously, so
 *   the curve has no step in it.
 *
 *   **Whole percentages.** The stored band string (`metric_scores.band`) is
 *   what the scorecard draws, and 43.7% is precision a talk ratio has never
 *   had.
 *
 * ── WHAT DOES NOT MOVE ───────────────────────────────────────────────────
 *
 * `METRIC_BANDS` and `renderMetrics()` are pinned by
 * `lib/characterization/dating-arm.test.ts` and both stay byte for byte. With
 * no band-time — an internal caller, a save that failed, an interview, an old
 * row — `datingMetricBands` returns `METRIC_BANDS` ITSELF, not a copy, so the
 * default path is the identical object reaching the identical arithmetic.
 * `talk-ratio.test.ts` asserts both halves: nothing moves by default, and it
 * moves only for a rep whose band-time says she was asked to say less (or
 * more) than the reference.
 *
 * Pure. No database, no model. The one read it needs is
 * `lib/db/band-time.ts`, and the one caller that threads it is the grade route.
 */

import { BANDS, bandFor, specFor, type WarmthBand } from '@/lib/warmth/bands'
import { METRIC_BANDS, type MetricBand } from './metrics'
import type { TranscriptTurn } from '@/lib/voice/types'

/** Seconds in each band. The shape `WarmthTelemetry.timeInBand` already has. */
export type BandTime = Partial<Record<WarmthBand, number>>

/** The band the §07 target was written against: a conversation that is open. */
export const REFERENCE_BAND: WarmthBand = 'OPEN'

/** What she is asked to write at the reference band. Read, never restated. */
export const REFERENCE_WORDS: number = specFor(REFERENCE_BAND).typicalWords

/** The furthest either edge of the band may move, as a share. Eight points. */
export const MAX_TALK_SHIFT = 0.08

/** Movement absorbed before the band shifts at all. One point. */
export const TALK_SHIFT_SLACK = 0.01

/**
 * Below this much measured band-time the rep is not normalised.
 *
 * Twenty seconds, which is `MIN_GRADED_SECONDS`: a rep too short to grade is
 * too short to have a band profile, and one turn of telemetry is a guess.
 */
export const MIN_BAND_SECONDS = 20

const TYPICAL: Record<WarmthBand, number> = Object.fromEntries(
  BANDS.map((spec) => [spec.band, spec.typicalWords]),
) as Record<WarmthBand, number>

/** The dating talk band, exactly as §07 states it. */
const DEFAULT_TALK_BAND: MetricBand = (() => {
  const band = METRIC_BANDS.find((entry) => entry.key === 'talkRatio')
  if (!band) throw new Error('METRIC_BANDS has no talkRatio band')
  return band
})()

/**
 * Her expected reply length, in words, weighted by time in band.
 *
 * Null when there is not enough band-time to say anything: a record of zeros,
 * a missing one, or one short of `MIN_BAND_SECONDS`.
 */
export function expectedReplyWords(bandTime: BandTime | null | undefined): number | null {
  if (!bandTime) return null
  let seconds = 0
  let weighted = 0
  for (const [band, value] of Object.entries(bandTime) as [WarmthBand, number | undefined][]) {
    const typical = TYPICAL[band]
    if (typical === undefined || typeof value !== 'number' || !Number.isFinite(value) || value <= 0) continue
    seconds += value
    weighted += value * typical
  }
  if (seconds < MIN_BAND_SECONDS) return null
  return weighted / seconds
}

/** The share a same-paced man ends on against a partner who says `k` times as much. */
function reshare(share: number, k: number): number {
  return share / (share + (1 - share) * k)
}

function bounded(raw: number): number {
  const magnitude = Math.min(MAX_TALK_SHIFT, Math.max(0, Math.abs(raw) - TALK_SHIFT_SLACK))
  return Math.sign(raw) * magnitude
}

function toPercent(share: number): number {
  return Math.round(share * 100) / 100
}

/**
 * The talk-ratio band for this rep.
 *
 * Returns `base` itself — the same object — whenever the normalised band
 * rounds to the band it started as, so "nothing moved" is a reference
 * equality and not merely equal numbers.
 */
export function talkRatioBandFor(
  bandTime: BandTime | null | undefined,
  base: MetricBand = DEFAULT_TALK_BAND,
): MetricBand {
  const words = expectedReplyWords(bandTime)
  if (words === null || base.min === undefined || base.max === undefined) return base
  const k = words / REFERENCE_WORDS
  const min = toPercent(base.min + bounded(reshare(base.min, k) - base.min))
  const max = toPercent(base.max + bounded(reshare(base.max, k) - base.max))
  if (min === base.min && max === base.max) return base
  return { ...base, min, max }
}

/**
 * The dating band table for this rep: `METRIC_BANDS`, with the talk band
 * normalised to her.
 *
 * `METRIC_BANDS` itself when nothing moved, so the default path is the object
 * `dating-arm.test.ts` pins, not a lookalike.
 */
export function datingMetricBands(bandTime?: BandTime | null): readonly MetricBand[] {
  const talk = talkRatioBandFor(bandTime)
  if (talk === DEFAULT_TALK_BAND) return METRIC_BANDS
  return METRIC_BANDS.map((band) => (band.key === 'talkRatio' ? talk : band))
}

/* ------------------------------------------------------------------ *
 * Band-time, rebuilt from the row the rep already wrote
 * ------------------------------------------------------------------ */

/** A stored warmth event, as far as band-time needs one. */
export interface BandEvent {
  /** 1-based ordinal of his turn — `WarmthEvent.turnIndex`. */
  turnIndex: number
  band: string
}

const BAND_NAMES = new Set<string>(BANDS.map((spec) => spec.band))

/**
 * Seconds per band, from what `finishSession` stores.
 *
 * The live engine keeps `timeInBand` and the rep throws it away: the
 * `transcripts.warmth` column holds one entry per scored turn of his, with the
 * band she was left in, and `sessions.start_warmth` holds where she began.
 * That is enough to rebuild the same record. She sits in her starting band
 * until his first scored line ends; each scored line of his moves her into the
 * band its LAST event left her in, from the moment he stops speaking, until the
 * next one; the rep closes at `sessionSeconds`.
 *
 * Ordinals are counted the way `fetchTranscript` counts them — every user turn
 * in order — because that is the convention the stored events were keyed on.
 *
 * Null when there is nothing to rebuild from: no start, no events, or events
 * that name no band this table knows.
 */
export function bandTimeFromEvents(input: {
  transcript: readonly TranscriptTurn[]
  events: readonly BandEvent[]
  startWarmth: number | null | undefined
  sessionSeconds: number
}): BandTime | null {
  const { transcript, events, startWarmth, sessionSeconds } = input
  if (typeof startWarmth !== 'number' || !Number.isFinite(startWarmth)) return null

  // The band each scored line left her in: the last event on that ordinal
  // wins, because the slow judgement lands after the fast score on the same
  // turn and it is the one she was actually in afterwards.
  const after = new Map<number, WarmthBand>()
  for (const event of events) {
    if (!Number.isFinite(event.turnIndex) || !BAND_NAMES.has(event.band)) continue
    after.set(event.turnIndex, event.band as WarmthBand)
  }
  if (after.size === 0) return null

  const changes: { at: number; band: WarmthBand }[] = []
  let ordinal = 0
  for (const turn of transcript) {
    if (turn.speaker !== 'user') continue
    ordinal += 1
    const band = after.get(ordinal)
    if (band) changes.push({ at: Math.max(0, turn.t_end), band })
  }
  if (changes.length === 0) return null

  const end = Math.max(sessionSeconds, changes[changes.length - 1]?.at ?? 0)
  const time: BandTime = {}
  let band = bandFor(startWarmth)
  let from = 0
  for (const change of changes) {
    const at = Math.min(Math.max(change.at, from), end)
    time[band] = (time[band] ?? 0) + (at - from)
    band = change.band
    from = at
  }
  time[band] = (time[band] ?? 0) + (end - from)
  return time
}
