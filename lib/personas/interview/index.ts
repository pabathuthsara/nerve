/**
 * The interview roster. Four characters, one per `Interviewer['style']` (§5.8).
 *
 *   1  Dan Whitfield   friendly HR       glass meeting room   authored to be cleared
 *   2  Aisha Rahman    panel lead        panel room           remembers every vague answer
 *   3  Marcus Vance    technical         office booth         asks for the mechanism underneath
 *   4  Elena Kovač     distracted exec   corner office        decides early and never says
 *
 * ── THE RUNG NUMBER IS A CURVE, NOT A GATE ───────────────────────────────
 *
 * §5.10: **do not copy the dating ladder.** The dating ladder is a progression
 * — you earn Robin — and that is the shape of the dating product. Somebody who
 * paid $20 because they interview on Thursday needs the hard one tonight, and a
 * pack of five mostly spent on tutorial is a refund request. So all four are
 * open from the first credit, and the number is only what `levelTrajectory`
 * would read if it ever fell through to it.
 *
 * `lib/warmth/levels.ts` already filters `track === 'dating'` when it builds the
 * level → trajectory map, so these four cannot renumber a dating curve. That
 * filter existed before this file did, which is the only reason adding rung 1
 * to 4 twice is safe.
 *
 * ── AND THEY LIVE IN `PERSONAS` ──────────────────────────────────────────
 *
 * Merged into the shipped registry rather than kept beside it, because
 * `getPersona` is what the token route, the turn pipeline and the live page all
 * resolve against — an interviewer that is not in there is an interviewer no
 * rep can be started against. Every read that must stay dating-only filters on
 * `track` at the query: `fetchPersonas`, `fetchRepRecords`, `syncLevel`,
 * `recentScoresAtLevel` and `levelTrajectory`.
 */

import type { Persona } from '@/lib/voice/types'
import { danWhitfield } from './dan'
import { aishaRahman } from './aisha'
import { marcusVance } from './marcus'
import { elenaKovac } from './elena'

export const INTERVIEWERS: Record<string, Persona> = {
  [danWhitfield.slug]: danWhitfield,
  [aishaRahman.slug]: aishaRahman,
  [marcusVance.slug]: marcusVance,
  [elenaKovac.slug]: elenaKovac,
}

export const INTERVIEWER_SLUGS: readonly string[] = Object.keys(INTERVIEWERS)

export { danWhitfield, aishaRahman, marcusVance, elenaKovac }

/**
 * The style each interviewer holds, and the word the picker shows.
 *
 * §5.8: **the interview type IS the interviewer.** There is no separate style
 * toggle and there is not going to be one — `InterviewerPicker` is already the
 * toggle, and a second dial would be two systems deciding one thing, which is
 * the failure this codebase has now had four times.
 *
 * Authored here rather than derived from the persona's dials, because a style
 * is a claim about what the conversation will be like and a dial is a claim
 * about how the meter moves. They are usually consistent and they are not the
 * same statement.
 */
export const INTERVIEWER_STYLE: Record<string, { style: InterviewerStyle; label: string }> = {
  'dan-whitfield': { style: 'friendly_hr', label: 'Friendly HR' },
  'aisha-rahman': { style: 'panel_lead', label: 'Panel lead' },
  'marcus-vance': { style: 'technical', label: 'Technical' },
  'elena-kovac': { style: 'distracted_exec', label: 'Distracted exec' },
}

export type InterviewerStyle = 'friendly_hr' | 'technical' | 'distracted_exec' | 'panel_lead'

/** The word the picker shows, falling back rather than rendering an empty chip. */
export function interviewerStyleFor(slug: string): { style: InterviewerStyle; label: string } {
  return INTERVIEWER_STYLE[slug] ?? { style: 'friendly_hr', label: 'Interviewer' }
}
