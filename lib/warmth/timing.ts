/**
 * What interest does to timing.
 *
 * Warmth changed everything she SAID and nothing about HOW LONG SHE TOOK. That
 * is backwards: people read interest from timing before they read it from
 * words. Somebody who is into a conversation answers on top of you; somebody
 * who is not lets a beat go by first, and you know which one you are talking to
 * long before you have parsed the sentence.
 *
 * ── THE FIFTH LAYER (HUMANNESS-PLAN §3) ─────────────────────────────────
 *
 * §04 describes the character as four layers: trajectory, personality, gated,
 * room. Timing is the fifth, and it reads the same warmth the other four read.
 *
 * The evidence is Stivers et al. (2009, PNAS), who measured turn-taking across
 * ten languages and found a **universal modal gap of about 200ms**, with every
 * language inside 250ms of that mean. What matters here is the tail: gaps past
 * roughly 700ms are decoded, cross-culturally, as a **dispreferred response**.
 * Silence before an answer is not neutral. It means *I don't want to*, and
 * listeners read it without being taught to.
 *
 * The scorecard already grades the USER on mean response latency. The product
 * understood that latency carries meaning and had simply never applied that
 * understanding to her.
 *
 * Two rules make the difference between a character and a metronome:
 *
 *  1. **Posture overrides band.** `wary` — interested but not at ease — is slow
 *     at warmth 70. A character who is warm and fast is easy; a character who
 *     is warm and hesitant is a person.
 *  2. **Sample, never fix.** A constant delay is a metronome and a metronome is
 *     a machine, however plausible its mean. Human response times are a wide
 *     distribution, so this draws from one.
 *
 * Everything here is pure and every draw takes an injectable rng. The adapter
 * owns delivery.
 */

import { clamp } from '@/lib/voice/types'
import type { Posture } from './affect'
import { bandFor, type WarmthBand } from './bands'

/**
 * What kind of thing she is answering.
 *
 * Hesitation before a personal answer is the most legible social signal there
 * is, and it did not exist in this product. `dispreferred` is the other half:
 * declining, deflecting and refusing all attract a pause in front of them.
 *
 * Both are decided by the warmth layer from what it already knows about the
 * user's turn — see `WarmthSession.replyShape`. Nothing here reads a model.
 */
export type TurnKind = 'ordinary' | 'intimate' | 'dispreferred'

/**
 * The shape of the reply she is about to give, beyond the meter itself.
 *
 * Carried alongside warmth into the adapter because both consequences live at
 * transport level and neither can be expressed anywhere else. She is still
 * never told a number, and she is never told any of this.
 */
export interface ReplyShape {
  posture: Posture
  turnKind: TurnKind
}

export const DEFAULT_REPLY_SHAPE: ReplyShape = { posture: 'level', turnKind: 'ordinary' }

/**
 * Target onset per band, in milliseconds from the user finishing.
 *
 * The numbers want tuning against real reps; the STRUCTURE is the point. Read
 * the right-hand column out loud — that is what each row is for.
 *
 *   HOSTILE   900–1400  I am not going to make this easy
 *   CLOSED    700–1100  dispreferred, audibly
 *   GUARDED   500–900   polite reluctance
 *   OPEN      350–650   ordinary
 *   ENGAGED   200–400   engaged, ready
 *   INVESTED  120–280   I was already going to say something
 *
 * The width of each row is also its spread: the cold bands are wide because
 * reluctance is erratic, and the warm ones are narrow because somebody who has
 * decided to answer answers.
 */
const BAND_ONSET: Record<WarmthBand, { low: number; high: number }> = {
  HOSTILE: { low: 900, high: 1400 },
  CLOSED: { low: 700, high: 1100 },
  GUARDED: { low: 500, high: 900 },
  OPEN: { low: 350, high: 650 },
  ENGAGED: { low: 200, high: 400 },
  INVESTED: { low: 120, high: 280 },
}

/**
 * Posture, applied as a FLOOR rather than as an addition.
 *
 * A floor is what "overrides band" actually means. Adding 400ms to INVESTED
 * still leaves a wary character faster than a merely open one, which is the
 * opposite of what wariness sounds like. Naming the band she is timed as
 * instead makes the rule legible: wary at warmth 70 answers like a guarded
 * stranger, because that is what being interested and not at ease does to the
 * beat before you speak.
 *
 * `taken` is the only posture that can make her faster, and only by a little:
 * liking someone past what the conversation has earned is the state where you
 * answer before you have decided to.
 */
const POSTURE_FLOOR: Partial<Record<Posture, WarmthBand>> = {
  /** Interested, not at ease. Slow however warm the meter is. */
  wary: 'GUARDED',
  /** Engaged with the subject, not with him. Politeness has a beat in it. */
  polite: 'OPEN',
}

/** Milliseconds shaved for a character who is ahead of the conversation. */
const TAKEN_LEAD_MS = 80

/**
 * Hesitation in front of the two turn kinds that attract it.
 *
 * `intimate` is the larger of the two on purpose: the pause before a personal
 * answer is the signal, and it is the one the user is here to learn to read.
 * Both are drawn rather than fixed, for the same reason the band is.
 */
const TURN_KIND_HESITATION: Record<TurnKind, { low: number; high: number }> = {
  ordinary: { low: 0, high: 0 },
  intimate: { low: 300, high: 600 },
  dispreferred: { low: 200, high: 450 },
}

/**
 * The ceiling on the whole thing.
 *
 * A cold stranger who takes two seconds is a cold stranger. One who takes four
 * is a broken pipeline, and the user cannot tell the difference from the
 * outside — so the difference is enforced here rather than left to the sum of
 * three draws.
 */
export const MAX_RESPONSE_DELAY_MS = 2000

/**
 * A normal draw, from a uniform rng, clamped to the range it was given.
 *
 * Box–Muller on two draws, centred on the midpoint with the half-width as one
 * standard deviation. So roughly two thirds of replies land inside the band's
 * stated range and the rest spread either side of it, which is the shape
 * Stivers measured — a tight mode with a long, meaningful tail.
 */
function draw(range: { low: number; high: number }, rng: () => number): number {
  if (range.high <= range.low) return range.low
  const centre = (range.low + range.high) / 2
  const sd = (range.high - range.low) / 2
  // `rng()` can return exactly 0, and log(0) is -Infinity.
  const u = Math.max(rng(), Number.EPSILON)
  const v = rng()
  const gaussian = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  // Two standard deviations of tail either side. Past that it stops reading as
  // variation and starts reading as a fault.
  return clamp(centre + gaussian * sd, centre - sd * 2, centre + sd * 2)
}

/**
 * How long she sits on a reply before it starts, in milliseconds.
 *
 * A desired ONSET measured from the user finishing, not a wait to add. On the
 * assembled pipeline the VAD, transcription and generation have already spent
 * some of it — usually all of it, in the cold bands — and only the remainder
 * may delay playback (`remainingResponseDelayMs`). Generation never waits for
 * this beat.
 *
 * That is why the engineering target inverts. "Reduce latency everywhere"
 * becomes "get the floor to 200ms for INVESTED and spend the rest
 * deliberately", which is both cheaper and a better character.
 */
export function responseDelayFor(
  warmth: number,
  shape: ReplyShape = DEFAULT_REPLY_SHAPE,
  rng: () => number = Math.random,
): number {
  const band = bandFor(Number.isFinite(warmth) ? warmth : 0)
  const floor = POSTURE_FLOOR[shape.posture]
  // The slower of the two rows wins, so a posture can only ever hold her back.
  const timedAs = floor && BAND_ONSET[floor].low > BAND_ONSET[band].low ? floor : band

  const onset = draw(BAND_ONSET[timedAs], rng)
    + draw(TURN_KIND_HESITATION[shape.turnKind], rng)
    - (shape.posture === 'taken' ? TAKEN_LEAD_MS : 0)

  return Math.round(clamp(onset, 0, MAX_RESPONSE_DELAY_MS))
}

/** The band she is TIMED as, once posture has had its say. Telemetry only. */
export function timingBandFor(warmth: number, shape: ReplyShape = DEFAULT_REPLY_SHAPE): WarmthBand {
  const band = bandFor(Number.isFinite(warmth) ? warmth : 0)
  const floor = POSTURE_FLOOR[shape.posture]
  return floor && BAND_ONSET[floor].low > BAND_ONSET[band].low ? floor : band
}

/** The optional personality beat after accounting for work already elapsed. */
export function remainingResponseDelayMs(targetMs: number, elapsedMs: number): number {
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0
  const target = Number.isFinite(targetMs) ? Math.max(0, targetMs) : 0
  return Math.max(0, target - elapsed)
}

/**
 * Whether she takes the turn when he starts talking over her.
 *
 * §05 is absolute: levels 1-4 never interrupt, ever. That is the ceiling and
 * this cannot raise it. What it adds is the other half of the rule — at level 5
 * and up, interruption is a sign of ENGAGEMENT rather than a property of the
 * rung. A bored stranger does not cut across you; she waits for you to finish
 * and then leaves.
 *
 * That also removes the worst version of the barge-in bug: at low warmth, where
 * a nervous user is most likely to be making noise they did not mean as speech,
 * she is no longer listening for a gap to jump into.
 */
export function interruptsAt(warmth: number, levelAllows: boolean): boolean {
  return levelAllows && warmth >= 55
}

/**
 * Her speaking rate, nudged by interest.
 *
 * Small on purpose — this is a lean, not an impression. Beyond a few percent it
 * stops reading as engagement and starts reading as a character whose voice
 * changes, which is worse than a flat one.
 */
export function paceFor(basePace: number, warmth: number): number {
  const lean = clamp((warmth - 40) / 60, -1, 1) * 0.05
  return clamp(basePace * (1 + lean), 0.25, 1.5)
}
