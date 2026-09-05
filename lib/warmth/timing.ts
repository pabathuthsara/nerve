/**
 * What interest does to timing.
 *
 * Warmth changed everything she SAID and nothing about HOW LONG SHE TOOK. That
 * is backwards: people read interest from timing before they read it from
 * words. Somebody who is into a conversation answers on top of you; somebody
 * who is not lets a beat go by first, and you know which one you are talking to
 * long before you have parsed the sentence.
 *
 * Both dials that could express this were fixed for the whole session — the VAD
 * silence window and the voice speed — so a character at warmth 5 and the same
 * character at warmth 85 replied with identical machine promptness. It is the
 * single most mechanical thing left in the pipeline and the cheapest to fix.
 *
 * Everything here is pure. The adapter owns delivery.
 */

import { clamp } from '@/lib/voice/types'

/**
 * How long she sits on a reply before it starts, in milliseconds.
 *
 * A real pause, not a stall: at the cold end it is about the length of a glance
 * up from a phone, and it disappears entirely once she is actually engaged.
 * This is a desired onset after the user stops speaking. On the assembled
 * pipeline, VAD and provider processing already consume that time: only the
 * remainder may delay playback. Generation must never wait for this beat.
 */
export const MAX_REPLY_DELAY_MS = 700

export function replyDelayMs(warmth: number): number {
  // Full delay at 0 and below, none from 60 up. Between those it tapers, so
  // warming up is something you can hear before she says anything different.
  if (warmth >= 60) return 0
  const coldness = clamp((60 - warmth) / 60, 0, 1)
  return Math.round(MAX_REPLY_DELAY_MS * coldness)
}

/** The optional personality beat after accounting for work already elapsed. */
export function remainingReplyDelayMs(warmth: number, elapsedMs: number): number {
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0
  return Math.max(0, replyDelayMs(warmth) - elapsed)
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
