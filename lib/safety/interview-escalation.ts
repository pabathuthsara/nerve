/**
 * What an INTERVIEWER says when a line is crossed (INTERVIEW-PLAN B9).
 *
 * ── WHAT IS SHARED, AND IT IS ALMOST EVERYTHING ──────────────────────────
 *
 * Moderation runs on both streams already and is completely track-blind, which
 * is right and stays: `nextSafetyAction`, the verdict mapping, the strike
 * counters, the age arithmetic and the distress path (§16.8) are the same
 * functions on both arms and are **not touched**. §16's sequence — an in-frame
 * decline first, then the rep ends — is the product's position on this and it
 * does not vary by track.
 *
 * ── WHAT IS NOT ──────────────────────────────────────────────────────────
 *
 * The three directives. What an interviewer says when a candidate crosses a
 * line is not what a stranger in a shop says, and it is not close: she is at
 * work, the encounter has a professional frame, and "short, cool, one sentence"
 * from somebody conducting an interview reads as a different genre of refusal.
 * A recruiter who says "I do not want that" sounds like a date; a recruiter who
 * says "That is not something I am going to discuss" sounds like a recruiter.
 *
 * The same three roles, the same in-frame rule, the same "the user is told
 * nothing" for her own strike. Only the voice moves.
 *
 * **A change to what the product refuses is a change to what the legal pages
 * claim** — `components/site/legal-pages.tsx` is part of the same edit. Nothing
 * here changes what is refused; it changes who is refusing.
 */

import {
  CLOSE_DIRECTIVE,
  CORRECT_DIRECTIVE,
  DECLINE_DIRECTIVE,
  type SafetyAction,
} from './escalation'
import type { TrackId } from '@/lib/voice/types'

/**
 * The first strike, in frame.
 *
 * Not a warning dialog and not a message from the app — she declines, as a
 * person at work who has just been made uncomfortable, and the interview
 * continues. §05 allows the timer, the ring and her voice on a live screen, and
 * a safety banner is none of the three.
 */
export const INTERVIEW_DECLINE_DIRECTIVE = [
  '(They have just said something explicit, aggressive or wildly inappropriate for',
  'an interview. Say plainly that it is not something you are going to discuss —',
  'one short sentence, professional, not a lecture and not a warning.',
  'Do not repeat what they said. Then go straight to your next question.',
  'Stay completely in character and keep the interview going.)',
].join(' ')

/**
 * What she is told when SHE crossed it.
 *
 * The user never sees this and never learns it happened, which is the correct
 * outcome on both tracks: the sentence has already been said and pointing at it
 * a second time would double the damage.
 */
export const INTERVIEW_CORRECT_DIRECTIVE = [
  '(You just said something an interviewer would never say to a candidate.',
  'Drop it, do not refer to it again, and get back to the questions you came',
  'to ask.)',
].join(' ')

/**
 * The last thing she is told, so the rep ends as a scene rather than a crash.
 *
 * An interview that is over ends the way one really does — the interviewer
 * closes it, briefly and civilly, and goes. Cutting the transport dead instead
 * is a black screen with no explanation, which reads as a bug and is the
 * reading that gets a safety control blamed for one.
 */
export const INTERVIEW_CLOSE_DIRECTIVE = [
  '(This interview is over. Say one short line ending it — civil, not angry —',
  'and go. Do not explain, do not ask anything, do not continue.)',
].join(' ')

/**
 * The directive for an action, on this track.
 *
 * One selector, dating as the default branch reaching the identical strings it
 * reached yesterday — the same shape as every other seam in this plan.
 */
export function safetyDirectiveFor(action: SafetyAction, track: TrackId): string | null {
  const interview = track === 'interview'
  switch (action) {
    case 'decline':
      return interview ? INTERVIEW_DECLINE_DIRECTIVE : DECLINE_DIRECTIVE
    case 'correct':
      return interview ? INTERVIEW_CORRECT_DIRECTIVE : CORRECT_DIRECTIVE
    case 'end':
      return interview ? INTERVIEW_CLOSE_DIRECTIVE : CLOSE_DIRECTIVE
    // `none` needs nothing said, and `distress` is not a directive at all: the
    // rep ends and the training frame is dropped (§16.8). Handing a character a
    // line to say into that moment is exactly what §16.8 refuses.
    default:
      return null
  }
}
