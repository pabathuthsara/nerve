/**
 * How long she takes, and what the screen says she is doing.
 *
 * ── WHY TIMING IS A CHANNEL AND NOT A GARNISH ────────────────────────────
 *
 * `HUMANNESS.md` makes the argument for speech: real conversation carries
 * meaning on words, length, timing, prosodic continuity, disfluency and
 * turn-taking, and the product wrote on two of the six. Texting keeps three of
 * those channels and loses three — there is no prosody, no disfluency and no
 * overlap — so the ones that survive carry proportionally more.
 *
 * Timing is the loudest of them. Everybody who has ever been texted can read a
 * delay, and nobody needs it explained. A reply that arrives in four seconds
 * and a reply that arrives in fourteen say different things with identical
 * words, and that difference is free: it costs no tokens, no model call and no
 * copy.
 *
 * ── THE RATIO IS THE SIGNAL, NOT THE ABSOLUTE ────────────────────────────
 *
 * A cold reply in real life takes hours. Rendering that honestly would produce
 * an app that appears broken, and a training product whose lesson is "come back
 * tomorrow" teaches nothing. So the scale is compressed to roughly 35:1 —
 * 0.4 seconds at INVESTED against 15 at CLOSED — which is far past the point
 * where the difference is legible and nowhere near the point where the screen
 * looks dead.
 *
 * ── AND THE MODEL LATENCY HIDES INSIDE THE DELAY ─────────────────────────
 *
 * The sequence is: he sends, the read delay elapses, `Seen` appears, THEN the
 * model is called, and the typing indicator is held back by whatever is left of
 * the typing lead after generation. So a one-to-two second completion is spent
 * inside a delay the product wanted anyway. The section gets faster and more
 * human from the same change, and at INVESTED — where the delay is 0.4s and
 * generation dominates — a fast reply is exactly what INVESTED means.
 *
 * Waiting BEFORE generating rather than after is also what makes double-texting
 * free: a second message inside the read window costs nothing, because nothing
 * has been generated yet.
 *
 * Pure. Every number is derived from the band and the text, and the jitter is
 * seeded, so two devices reading the same thread agree about when she answers.
 */

import { bandFor, type WarmthBand } from '@/lib/warmth/bands'
import { seededRandom } from '@/lib/voice/seed'

export interface PresenceTiming {
  /** How long before the receipt flips to `Seen`. */
  readDelayMs: number
  /** How long after `Seen` before the typing indicator may appear. */
  typingLeadMs: number
}

/**
 * The table.
 *
 * Authored against the bands rather than against warmth directly, so that the
 * one place that decides what GUARDED means (`bandFor`) decides it here too. A
 * second set of thresholds would be a second opinion about the same seam.
 */
const TIMING: Record<WarmthBand, PresenceTiming> = {
  // She is holding the phone and she is in this conversation.
  INVESTED: { readDelayMs: 400, typingLeadMs: 300 },
  ENGAGED: { readDelayMs: 1_200, typingLeadMs: 800 },
  OPEN: { readDelayMs: 3_000, typingLeadMs: 2_000 },
  // She is doing something else and this is not the thing she is doing.
  GUARDED: { readDelayMs: 7_000, typingLeadMs: 4_000 },
  CLOSED: { readDelayMs: 14_000, typingLeadMs: 6_000 },
  // Not "never" — a delay with no end is indistinguishable from a bug, and the
  // exit layer owns actually going. This is the longest she is ever kept.
  HOSTILE: { readDelayMs: 20_000, typingLeadMs: 6_000 },
}

/** Milliseconds of typing per character. A phone thumb, not a keyboard. */
export const MS_PER_CHARACTER = 45
/** Nobody types for less than this, even for "ok". */
export const MIN_TYPING_MS = 600
/** Nobody watches a typing indicator for longer than this. */
export const MAX_TYPING_MS = 4_000
/** Either side of the computed durations, as a fraction. */
export const PRESENCE_JITTER = 0.25

/**
 * How much longer everything takes when he is pushing.
 *
 * `isPressuring` in `lib/warmth/texting/reciprocity.ts` is the predicate and
 * this is the consequence. Somebody who has sent three unanswered messages to a
 * person who is not warm waits LONGER for the fourth, not the same. It is the
 * most recognisable shape in the medium and it needs no copy at all.
 */
export const PRESSURE_MULTIPLIER = 1.8

/** The base timing for a warmth, before jitter and before pressure. */
export function timingFor(warmth: number): PresenceTiming {
  return TIMING[bandFor(warmth)]
}

function jittered(value: number, roll: number): number {
  return Math.max(0, Math.round(value * (1 + (roll * 2 - 1) * PRESENCE_JITTER)))
}

export interface ScheduleInput {
  warmth: number
  /** Her reply, so the typing duration matches its length. Empty if silent. */
  replyText: string
  /** He is sending messages into silence. See `PRESSURE_MULTIPLIER`. */
  pressuring?: boolean
  /** Milliseconds the model call actually took, so the lead can absorb it. */
  generationMs?: number
  /** The thread seed plus the exchange index. Keeps a reload deterministic. */
  seed: string
}

export interface PresenceSchedule {
  /** Milliseconds from his message to the `Seen` receipt. */
  seenAfterMs: number
  /** Milliseconds from his message to the typing indicator appearing. */
  typingAfterMs: number
  /** Milliseconds from his message to her reply becoming visible. */
  revealAfterMs: number
}

/**
 * When each of the three things happens, measured from his last message.
 *
 * All three are offsets from ONE origin rather than a chain of deltas, because
 * the client renders them against a single stamped `revealAt` and a chain would
 * let rounding put "typing" after "revealed".
 */
export function scheduleFor(input: ScheduleInput): PresenceSchedule {
  const base = timingFor(input.warmth)
  const rng = seededRandom(input.seed)
  const multiplier = input.pressuring ? PRESSURE_MULTIPLIER : 1

  const seenAfterMs = Math.round(jittered(base.readDelayMs, rng()) * multiplier)

  // GENERATION IS SPENT INSIDE THE LEAD, NOT ADDED TO IT.
  //
  // The model was called the moment `Seen` appeared, so by the time the lead
  // would have elapsed some of it has already been used up waiting. What is
  // left is what he waits. If generation took longer than the whole lead, the
  // indicator appears immediately and the reply follows it — which is honest:
  // she did take that long.
  const lead = Math.round(jittered(base.typingLeadMs, rng()) * multiplier)
  const remainingLead = Math.max(0, lead - (input.generationMs ?? 0))
  const typingAfterMs = seenAfterMs + remainingLead

  const typing = typingDurationMs(input.replyText, rng())
  return {
    seenAfterMs,
    typingAfterMs,
    revealAfterMs: typingAfterMs + typing,
  }
}

/** How long she spends typing a message of this length. */
export function typingDurationMs(text: string, roll: number): number {
  if (!text) return 0
  const raw = text.length * MS_PER_CHARACTER
  const bounded = Math.min(MAX_TYPING_MS, Math.max(MIN_TYPING_MS, raw))
  return jittered(bounded, roll)
}

/**
 * What the line under her name says.
 *
 * Four states and they are the whole of what the top bar ever shows. `null` is
 * load-bearing: once she has gone the line disappears entirely rather than
 * freezing on a last-seen time, because a stale "Active 40m ago" on a finished
 * thread reads as a bug and a blank reads as absence.
 */
export type PresenceLabel =
  | { kind: 'active' }
  | { kind: 'typing' }
  | { kind: 'lastSeen'; minutesAgo: number }
  | { kind: 'gone' }

export interface PresenceViewInput {
  /** The thread has ended. Outranks everything else. */
  ended: boolean
  /** The typing indicator is up right now. */
  typing: boolean
  warmth: number
  /** Milliseconds since her last visible message, or null if she has not sent one. */
  sinceHerLastMs: number | null
}

/**
 * The bands at which she reads as present rather than as away.
 *
 * OPEN and above, matching the band table's own first invitation. Below it she
 * is somebody who has this conversation open in the background, which is what
 * the timings already say — the label just stops contradicting them.
 */
const PRESENT_BANDS: readonly WarmthBand[] = ['OPEN', 'ENGAGED', 'INVESTED']

export function presenceLabel(input: PresenceViewInput): PresenceLabel {
  if (input.ended) return { kind: 'gone' }
  if (input.typing) return { kind: 'typing' }

  const present = PRESENT_BANDS.includes(bandFor(input.warmth))
  if (present && (input.sinceHerLastMs === null || input.sinceHerLastMs < 120_000)) {
    return { kind: 'active' }
  }

  if (input.sinceHerLastMs === null) return { kind: 'active' }
  return { kind: 'lastSeen', minutesAgo: Math.max(1, Math.round(input.sinceHerLastMs / 60_000)) }
}

/** The label as the one string the top bar prints. */
export function presenceText(label: PresenceLabel): string | null {
  switch (label.kind) {
    case 'active':
      return 'Active now'
    case 'typing':
      return 'typing…'
    case 'lastSeen':
      return `Active ${label.minutesAgo}m ago`
    case 'gone':
      return null
  }
}
